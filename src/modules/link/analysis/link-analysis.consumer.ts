import { setTimeout as sleep } from 'node:timers/promises'

import {
    Inject,
    Injectable,
    Logger,
    OnModuleDestroy,
    OnModuleInit,
} from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import {
    ChangeMessageVisibilityCommand,
    DeleteMessageCommand,
    Message,
    ReceiveMessageCommand,
} from '@aws-sdk/client-sqs'
import { z } from 'zod'

import { ValidatedEnvironment } from '../../../config/environment'
import { SqsService } from '../../../infrastructure/sqs/sqs.service'

import { classifyFailure } from './link-analysis.failure'
import {
    type AnalysisExecutor,
    AnalysisResult,
    LINK_ANALYSIS_EXECUTOR,
} from './link-analysis.type'
import { JOB_LEASE_SECONDS, JOB_TIMEOUT_MS } from './link-job.constant'
import { LinkJobRepository } from './link-job.repository'

export const linkJobMessageSchema = z
    .object({
        version: z.literal(3),
        jobId: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
    })
    .strict()

@Injectable()
export class LinkAnalysisQueueConsumer
    implements OnModuleInit, OnModuleDestroy
{
    private readonly logger = new Logger(LinkAnalysisQueueConsumer.name)
    private readonly abort = new AbortController()
    private task?: Promise<void>
    constructor(
        private readonly config: ConfigService<ValidatedEnvironment, true>,
        private readonly sqs: SqsService,
        private readonly jobs: LinkJobRepository,
        @Inject(LINK_ANALYSIS_EXECUTOR)
        private readonly executor: AnalysisExecutor,
    ) {}
    onModuleInit() {
        if (!this.config.get('SQS_CONSUMER_ENABLED', { infer: true })) return
        if (!this.queueUrl)
            throw new Error(
                'SQS_LINK_ANALYSIS_QUEUE_URL is required for worker',
            )
        if (
            this.config.get('SQS_VISIBILITY_TIMEOUT_SECONDS', {
                infer: true,
            }) <= JOB_LEASE_SECONDS
        )
            throw new Error(
                'SQS visibility timeout must exceed Job lease (240 seconds)',
            )
        this.task = this.poll()
    }
    async onModuleDestroy() {
        this.abort.abort()
        // 새 수신은 중단하되 이미 시작한 작업은 전체 timeout 안에서 정리한다.
        await this.task
    }
    private get queueUrl() {
        return this.config.get('SQS_LINK_ANALYSIS_QUEUE_URL', { infer: true })
    }
    private async poll() {
        let failures = 0
        while (!this.abort.signal.aborted) {
            try {
                const response = await this.sqs.receive(
                    new ReceiveMessageCommand({
                        QueueUrl: this.queueUrl,
                        MaxNumberOfMessages: 1,
                        WaitTimeSeconds: this.config.get(
                            'SQS_WAIT_TIME_SECONDS',
                            { infer: true },
                        ),
                        VisibilityTimeout: this.config.get(
                            'SQS_VISIBILITY_TIMEOUT_SECONDS',
                            { infer: true },
                        ),
                    }),
                    this.abort.signal,
                )
                failures = 0
                for (const message of response.Messages ?? []) {
                    if (this.abort.signal.aborted) return
                    await this.process(message)
                }
            } catch {
                if (this.abort.signal.aborted) return
                failures++
                this.logger.error('SQS 수신 실패. 설정과 연결을 확인하세요.')
                await sleep(
                    Math.min(30_000, 1000 * 2 ** Math.min(failures - 1, 5)),
                    undefined,
                    { signal: this.abort.signal },
                ).catch(() => undefined)
            }
        }
    }
    async process(message: Message): Promise<void> {
        try {
            if (!message.ReceiptHandle)
                throw new Error('Missing receipt handle')
            const parsed = linkJobMessageSchema.parse(
                JSON.parse(message.Body ?? ''),
            )
            const claim = await this.jobs.claim(parsed.jobId)
            if (claim.status === 'WAIT') {
                await this.sqs.changeVisibility(
                    new ChangeMessageVisibilityCommand({
                        QueueUrl: this.queueUrl,
                        ReceiptHandle: message.ReceiptHandle,
                        VisibilityTimeout: JOB_LEASE_SECONDS,
                    }),
                )
                return
            }
            if (claim.status === 'CLAIMED') {
                const controller = new AbortController()
                let timer: NodeJS.Timeout | undefined
                let result: AnalysisResult
                try {
                    result = await Promise.race([
                        this.executor.execute(
                            {
                                jobType: claim.input.job.jobType,
                                link: claim.input.link,
                                tags: claim.input.tags,
                            },
                            controller.signal,
                        ),
                        new Promise<never>((_, reject) => {
                            timer = setTimeout(() => {
                                controller.abort()
                                reject(new Error('Execution timed out'))
                            }, JOB_TIMEOUT_MS)
                        }),
                    ])
                } catch (error) {
                    result = {
                        patch:
                            claim.input.job.jobType === 'ANALYZE'
                                ? { aiSummaryStatus: 'FAILED' }
                                : {},
                        failure: {
                            retryable: classifyFailure(error) === 'RETRYABLE',
                            code: controller.signal.aborted
                                ? 'EXECUTION_TIMEOUT'
                                : 'EXECUTION_FAILED',
                            message: '분석 실행을 완료하지 못했습니다.',
                        },
                    }
                } finally {
                    clearTimeout(timer)
                }
                if (!(await this.jobs.finish(claim.input, result))) return
            }
            await this.sqs.delete(
                new DeleteMessageCommand({
                    QueueUrl: this.queueUrl,
                    ReceiptHandle: message.ReceiptHandle,
                }),
            )
        } catch {
            // 메시지 본문·원문 URL·provider 오류에는 개인정보가 있을 수 있으므로 식별자만 기록한다.
            this.logger.error(
                `SQS 작업 처리 실패. messageId=${message.MessageId ?? 'unknown'}`,
            )
        }
    }
}
