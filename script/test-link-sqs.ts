// 전용 로컬 DB·SQS에서 실제 Publisher → Consumer 경로를 검증한다. AI는 결정적인 실행기로 대체한다.
import assert from 'node:assert/strict'

import { ConfigService } from '@nestjs/config'
import {
    ChangeMessageVisibilityCommand,
    CreateQueueCommand,
    DeleteQueueCommand,
    GetQueueAttributesCommand,
    ReceiveMessageCommand,
    SendMessageCommand,
    SQSClient,
} from '@aws-sdk/client-sqs'
import { eq, sql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/postgres-js'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import postgres from 'postgres'

import { DatabaseService } from '../src/config/database/database.service'
import * as schema from '../src/config/database/schema'
import { ValidatedEnvironment } from '../src/config/environment'
import { SqsService } from '../src/infrastructure/sqs/sqs.service'
import { LinkAnalysisQueueConsumer } from '../src/modules/link/analysis/link-analysis.consumer'
import { LinkAnalysisQueuePublisher } from '../src/modules/link/analysis/link-analysis.publisher'
import {
    AnalysisExecutor,
    AnalysisResult,
} from '../src/modules/link/analysis/link-analysis.type'
import { LinkJobRepository } from '../src/modules/link/analysis/link-job.repository'
import { LinkOutboxRepository } from '../src/modules/link/analysis/link-outbox.repository'
import { LinkRepository } from '../src/modules/link/link.repository'

import 'reflect-metadata'

async function main() {
    const address = new URL(process.env.LINK_JOB_TEST_DATABASE_URL ?? '')
    const endpoint = new URL(process.env.LINK_JOB_TEST_SQS_ENDPOINT ?? '')
    assert(
        ['127.0.0.1', 'localhost'].includes(address.hostname) &&
            address.pathname === '/promise9_job_test',
        '전용 로컬 promise9_job_test DB만 허용합니다.',
    )
    assert(
        ['127.0.0.1', 'localhost'].includes(endpoint.hostname) &&
            endpoint.protocol === 'http:',
        '로컬 SQS 에뮬레이터만 허용합니다.',
    )
    // 이 검증 프로세스에서 운영 AWS 자격 증명을 사용하지 않는다.
    process.env.AWS_ACCESS_KEY_ID = 'local-test'
    process.env.AWS_SECRET_ACCESS_KEY = 'local-test'
    delete process.env.AWS_SESSION_TOKEN
    const sdk = new SQSClient({
        endpoint: endpoint.toString(),
        region: 'ap-northeast-2',
        credentials: {
            accessKeyId: 'local-test',
            secretAccessKey: 'local-test',
        },
    })
    const client = postgres(address.toString(), {
        max: 5,
        onnotice: () => undefined,
    })
    const db = drizzle(client, { schema, casing: 'snake_case' })
    const database = { db } as unknown as DatabaseService
    const links = new LinkRepository(database)
    const jobs = new LinkJobRepository(database)
    const outbox = new LinkOutboxRepository(database)
    const queues: string[] = []
    let sqs: SqsService | undefined
    const name = `promise9-job-test-${Date.now()}`
    try {
        await migrate(db, { migrationsFolder: 'drizzle' })
        const dlq = await sdk.send(
            new CreateQueueCommand({ QueueName: `${name}-dlq` }),
        )
        assert(dlq.QueueUrl)
        queues.push(dlq.QueueUrl)
        const dlqAttributes = await sdk.send(
            new GetQueueAttributesCommand({
                QueueUrl: dlq.QueueUrl,
                AttributeNames: ['QueueArn'],
            }),
        )
        const created = await sdk.send(
            new CreateQueueCommand({
                QueueName: name,
                Attributes: {
                    VisibilityTimeout: '300',
                    RedrivePolicy: JSON.stringify({
                        deadLetterTargetArn: dlqAttributes.Attributes!.QueueArn,
                        maxReceiveCount: 3,
                    }),
                },
            }),
        )
        const queueUrl = created.QueueUrl!
        assert(['127.0.0.1', 'localhost'].includes(new URL(queueUrl).hostname))
        queues.push(queueUrl)
        const config = new ConfigService<ValidatedEnvironment, true>({
            APP_ENV: 'development',
            AWS_REGION: 'ap-northeast-2',
            SQS_ENDPOINT: endpoint.toString(),
            SQS_LINK_ANALYSIS_QUEUE_URL: queueUrl,
            SQS_CONSUMER_ENABLED: false,
        })
        sqs = new SqsService(config)
        let executions = 0
        let result: AnalysisResult = {
            patch: { aiSummary: '통합 검증', aiSummaryStatus: 'SUCCESS' },
        }
        const executor: AnalysisExecutor = {
            execute: () => {
                executions++
                return Promise.resolve(result)
            },
        }
        const consumer = new LinkAnalysisQueueConsumer(
            config,
            sqs,
            jobs,
            executor,
        )
        const receive = async (url = queueUrl, wait = 1) =>
            (
                await sdk.send(
                    new ReceiveMessageCommand({
                        QueueUrl: url,
                        WaitTimeSeconds: wait,
                        MaxNumberOfMessages: 1,
                    }),
                )
            ).Messages?.[0]
        const publishAndReceive = async () => {
            const publisher = new LinkAnalysisQueuePublisher(
                config,
                sqs!,
                outbox,
            )
            publisher.onModuleInit()
            try {
                for (let i = 0; i < 10; i++) {
                    const message = await receive()
                    if (message) return message
                }
                throw new Error(
                    'Outbox 메시지가 10초 안에 발행되지 않았습니다.',
                )
            } finally {
                await publisher.onModuleDestroy()
            }
        }
        const fixture = async () => {
            await client`truncate links cascade`
            executions = 0
            await links.insert({
                userId: 1,
                originalUrl: 'https://example.com',
                normalizedUrl: 'https://example.com',
            })
            const [job] = await db.select().from(schema.linkProcessingJobs)
            return job
        }

        const completed = await fixture()
        await consumer.process(await publishAndReceive())
        assert.equal(
            (await db.select().from(schema.linkProcessingJobs))[0].status,
            'COMPLETED',
        )
        assert.equal(
            (await db.select().from(schema.links))[0].aiSummary,
            '통합 검증',
        )
        assert.equal(await receive(), undefined)
        await sdk.send(
            new SendMessageCommand({
                QueueUrl: queueUrl,
                MessageBody: JSON.stringify({
                    version: 3,
                    jobId: completed.id,
                }),
            }),
        )
        const duplicate = await receive()
        assert(duplicate)
        await consumer.process(duplicate)
        assert.equal(executions, 1)
        assert.equal(await receive(), undefined)
        console.log(
            'PASS: Outbox 발행 → 결과 저장 → ACK, 완료 Job 중복 메시지 정리',
        )

        await fixture()
        result = {
            patch: {},
            failure: {
                retryable: true,
                code: 'TEST_RETRY',
                message: '일시 실패',
            },
        }
        await consumer.process(await publishAndReceive())
        assert.equal(
            (await db.select().from(schema.linkProcessingJobs))[0].status,
            'PENDING',
        )
        assert.equal(await receive(), undefined)
        // 60초를 실제 대기하지 않고 테스트 DB에서 예약 시간을 앞당긴다.
        await db
            .update(schema.linkProcessingJobs)
            .set({ nextAttemptAt: sql`clock_timestamp()` })
        await db
            .update(schema.linkAnalysisOutbox)
            .set({ availableAt: sql`clock_timestamp()` })
        result = { patch: { aiSummaryStatus: 'SUCCESS' } }
        await consumer.process(await publishAndReceive())
        assert.equal(
            (await db.select().from(schema.linkProcessingJobs))[0].status,
            'COMPLETED',
        )
        assert.equal(executions, 2)
        assert.equal(await receive(), undefined)
        console.log('PASS: 일시 실패 → 재시도 Outbox → 재발행 → 완료')

        const failedSave = await fixture()
        result = {
            patch: { aiSummary: '롤백 대상', aiSummaryStatus: 'SUCCESS' },
        }
        const failedReceipt = await publishAndReceive()
        await client`create or replace function fail_job_finish_test() returns trigger language plpgsql as $$ begin if new.status = 'COMPLETED' then raise exception 'injected finish failure'; end if; return new; end $$`
        await client`create trigger fail_job_finish_test before update on link_processing_jobs for each row execute function fail_job_finish_test()`
        try {
            await consumer.process(failedReceipt)
            assert.equal(
                (await db.select().from(schema.links))[0].aiSummary,
                null,
            )
            assert.equal(
                (await db.select().from(schema.linkProcessingJobs))[0].status,
                'RUNNING',
            )
        } finally {
            await client`drop trigger fail_job_finish_test on link_processing_jobs`
            await client`drop function fail_job_finish_test()`
        }
        await db
            .update(schema.linkProcessingJobs)
            .set({
                leaseExpiresAt: sql`clock_timestamp() - interval '1 second'`,
            })
            .where(eq(schema.linkProcessingJobs.id, failedSave.id))
        await sdk.send(
            new ChangeMessageVisibilityCommand({
                QueueUrl: queueUrl,
                ReceiptHandle: failedReceipt.ReceiptHandle!,
                VisibilityTimeout: 0,
            }),
        )
        const savedAgain = await receive()
        assert(
            savedAgain,
            '결과 저장 실패 메시지가 삭제되지 않고 재전달되어야 합니다.',
        )
        result = {
            patch: { aiSummary: '복구 성공', aiSummaryStatus: 'SUCCESS' },
        }
        await consumer.process(savedAgain)
        assert.equal(
            (await db.select().from(schema.links))[0].aiSummary,
            '복구 성공',
        )
        assert.equal(
            (await db.select().from(schema.linkProcessingJobs))[0].status,
            'COMPLETED',
        )
        assert.equal(await receive(), undefined)
        console.log(
            'PASS: 결과·Job 저장 실패 → 전체 롤백·ACK 보류 → 재전달 후 복구',
        )

        const interrupted = await fixture()
        const receipt = await publishAndReceive()
        // 실제 선점 후 프로세스가 결과·ACK 없이 종료된 상태를 재현한다.
        assert.equal((await jobs.claim(interrupted.id)).status, 'CLAIMED')
        await db
            .update(schema.linkProcessingJobs)
            .set({
                leaseExpiresAt: sql`clock_timestamp() - interval '1 second'`,
            })
            .where(eq(schema.linkProcessingJobs.id, interrupted.id))
        await sdk.send(
            new ChangeMessageVisibilityCommand({
                QueueUrl: queueUrl,
                ReceiptHandle: receipt.ReceiptHandle!,
                VisibilityTimeout: 0,
            }),
        )
        const redelivery = await receive()
        assert(redelivery)
        await consumer.process(redelivery)
        const [recovered] = await db.select().from(schema.linkProcessingJobs)
        assert.equal(recovered.status, 'COMPLETED')
        assert.equal(recovered.attemptCount, 2)
        assert.equal(await receive(), undefined)
        console.log('PASS: 미완료 실행 → 실제 SQS 재전달 → 재선점·완료')

        await sdk.send(
            new SendMessageCommand({
                QueueUrl: queueUrl,
                MessageBody: 'invalid-json',
            }),
        )
        for (let i = 0; i < 4; i++) {
            const malformed = await receive()
            if (!malformed) break
            await consumer.process(malformed)
            await sdk.send(
                new ChangeMessageVisibilityCommand({
                    QueueUrl: queueUrl,
                    ReceiptHandle: malformed.ReceiptHandle!,
                    VisibilityTimeout: 0,
                }),
            )
        }
        const dead = await receive(dlq.QueueUrl)
        assert.equal(dead?.Body, 'invalid-json')
        console.log('PASS: 잘못된 메시지는 ACK 없이 DLQ로 이동')
    } finally {
        sqs?.onApplicationShutdown()
        try {
            const cleanup = await Promise.allSettled(
                queues.map((QueueUrl) =>
                    sdk.send(new DeleteQueueCommand({ QueueUrl })),
                ),
            )
            for (const outcome of cleanup)
                if (outcome.status === 'rejected')
                    console.error('테스트 큐 정리 실패:', outcome.reason)
        } finally {
            sdk.destroy()
            await client.end()
        }
    }
}
main().catch((error: unknown) => {
    console.error(error)
    process.exitCode = 1
})
