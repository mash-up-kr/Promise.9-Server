// 운영 DB 연결을 허용하지 않는 로컬 PostgreSQL 통합 검증.
import assert from 'node:assert/strict'

import { eq, sql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/postgres-js'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import postgres from 'postgres'

import { DatabaseService } from '../src/config/database/database.service'
import * as schema from '../src/config/database/schema'
import {
    enqueueLinkJob,
    LinkJobRepository,
} from '../src/modules/link/analysis/link-job.repository'
import { LinkOutboxRepository } from '../src/modules/link/analysis/link-outbox.repository'
import { LinkRepository } from '../src/modules/link/link.repository'

import 'reflect-metadata'

async function main() {
    const address = new URL(process.env.LINK_JOB_TEST_DATABASE_URL ?? '')
    assert(
        ['127.0.0.1', 'localhost'].includes(address.hostname) &&
            address.pathname === '/promise9_job_test',
        '전용 로컬 promise9_job_test DB만 허용합니다.',
    )
    const client = postgres(address.toString(), {
        max: 5,
        onnotice: () => undefined,
    })
    const db = drizzle(client, { schema, casing: 'snake_case' })
    const database = { db } as unknown as DatabaseService
    const links = new LinkRepository(database)
    const jobs = new LinkJobRepository(database)
    const outbox = new LinkOutboxRepository(database)
    let checks = 0
    const fixture = async () => {
        await client`truncate links cascade`
        const link = await links.insert({
            userId: 1,
            originalUrl: 'https://example.com',
            normalizedUrl: 'https://example.com',
        })
        const [job] = await db.select().from(schema.linkProcessingJobs)
        assert.equal(
            (await db.select().from(schema.linkAnalysisOutbox)).length,
            1,
        )
        return { link, job }
    }
    try {
        await migrate(db, { migrationsFolder: 'drizzle' })
        await client`truncate links cascade`
        await assert.rejects(
            db.transaction(async (tx) => {
                const [link] = await tx
                    .insert(schema.links)
                    .values({
                        userId: 1,
                        originalUrl: 'https://rollback.test',
                        normalizedUrl: 'https://rollback.test',
                    })
                    .returning()
                await enqueueLinkJob(tx, link.id, 999, 'ANALYZE')
            }),
        )
        assert.equal((await db.select().from(schema.links)).length, 0)
        checks++

        // Outbox 삽입 자체가 실패해도 링크와 Job이 함께 롤백되어야 한다.
        await client`create or replace function fail_job_outbox_test() returns trigger language plpgsql as $$ begin raise exception 'injected outbox failure'; end $$`
        await client`create trigger fail_job_outbox_test before insert on link_analysis_outbox for each row execute function fail_job_outbox_test()`
        try {
            await assert.rejects(
                links.insert({
                    userId: 1,
                    originalUrl: 'https://outbox.test',
                    normalizedUrl: 'https://outbox.test',
                }),
            )
            assert.equal((await db.select().from(schema.links)).length, 0)
            assert.equal(
                (await db.select().from(schema.linkProcessingJobs)).length,
                0,
            )
        } finally {
            await client`drop trigger fail_job_outbox_test on link_analysis_outbox`
            await client`drop function fail_job_outbox_test()`
        }
        checks++

        let { link, job } = await fixture()
        await assert.rejects(
            outbox.publishOne(() => Promise.reject(new Error('SQS failed'))),
        )
        assert.equal(
            (await db.select().from(schema.linkAnalysisOutbox))[0].publishedAt,
            null,
        )
        checks++
        const sent: number[] = []
        await Promise.all([
            outbox.publishOne((id) => {
                sent.push(id)
                return Promise.resolve()
            }),
            outbox.publishOne((id) => {
                sent.push(id)
                return Promise.resolve()
            }),
        ])
        assert.deepEqual(sent, [job.id])
        checks++

        const claims = await Promise.all([
            jobs.claim(job.id),
            jobs.claim(job.id),
        ])
        const claimed = claims.find((claim) => claim.status === 'CLAIMED')!
        assert.equal(
            claims.filter((claim) => claim.status === 'CLAIMED').length,
            1,
        )
        assert.equal(
            claims.filter((claim) => claim.status === 'WAIT').length,
            1,
        )
        assert(claimed.status === 'CLAIMED')
        checks++
        await assert.rejects(
            jobs.finish(claimed.input, { patch: { title: 'a'.repeat(513) } }),
        )
        assert.equal(
            (await db.select().from(schema.linkProcessingJobs))[0].status,
            'RUNNING',
        )
        checks++
        await db
            .update(schema.linkProcessingJobs)
            .set({
                leaseExpiresAt: sql`clock_timestamp() - interval '1 second'`,
            })
            .where(eq(schema.linkProcessingJobs.id, job.id))
        const second = await jobs.claim(job.id)
        assert(second.status === 'CLAIMED')
        assert.equal(
            await jobs.finish(claimed.input, { patch: { title: 'stale' } }),
            false,
        )
        assert.equal(
            await jobs.finish(second.input, {
                patch: { title: 'fresh', aiSummaryStatus: 'SUCCESS' },
            }),
            true,
        )
        assert.equal((await db.select().from(schema.links))[0].title, 'fresh')
        assert.equal((await jobs.claim(job.id)).status, 'DONE')
        checks++

        ;({ link, job } = await fixture())
        const retryClaim = await jobs.claim(job.id)
        assert(retryClaim.status === 'CLAIMED')
        await jobs.finish(retryClaim.input, {
            patch: { title: 'not committed' },
            failure: { code: 'TIMEOUT', message: 'timeout', retryable: true },
        })
        assert.equal((await db.select().from(schema.links))[0].title, null)
        const [pending] = await db.select().from(schema.linkProcessingJobs)
        const events = await db.select().from(schema.linkAnalysisOutbox)
        assert.equal(events.length, 2)
        assert.equal(
            events[1].availableAt.getTime(),
            pending.nextAttemptAt.getTime(),
        )
        assert.equal((await jobs.claim(job.id)).status, 'WAIT')
        assert.equal(
            await jobs.finish(retryClaim.input, { patch: { title: 'stale' } }),
            false,
        )
        checks++

        await db
            .update(schema.linkProcessingJobs)
            .set({
                status: 'RUNNING',
                attemptCount: 4,
                nextAttemptAt: sql`clock_timestamp()`,
                leaseExpiresAt: sql`clock_timestamp() - interval '1 second'`,
            })
            .where(eq(schema.linkProcessingJobs.id, job.id))
        assert.equal((await jobs.claim(job.id)).status, 'DONE')
        assert.equal(
            (await db.select().from(schema.linkProcessingJobs))[0].status,
            'FAILED',
        )
        assert.equal(
            (await db.select().from(schema.links))[0].aiSummaryStatus,
            'FAILED',
        )
        checks++

        ;({ link, job } = await fixture())
        await links.update(1, link.id, { memo: '수정' })
        const allJobs = await db
            .select()
            .from(schema.linkProcessingJobs)
            .orderBy(schema.linkProcessingJobs.id)
        assert.equal(allJobs[1].jobType, 'EMBEDDING')
        await outbox.publishOne(() => Promise.resolve())
        assert.equal(
            await outbox.publishOne(() =>
                Promise.reject(new Error('후속 작업이 일찍 발행됨')),
            ),
            false,
        )
        const head = await jobs.claim(job.id)
        assert(head.status === 'CLAIMED')
        await jobs.finish(head.input, { patch: {} })
        assert.equal(
            await outbox.publishOne((id) => {
                assert.equal(id, allJobs[1].id)
                return Promise.resolve()
            }),
            true,
        )
        checks++

        const embed = await jobs.claim(allJobs[1].id)
        assert(embed.status === 'CLAIMED')
        await db
            .update(schema.links)
            .set({ deletedAt: sql`clock_timestamp()` })
            .where(eq(schema.links.id, link.id))
        assert.equal(
            await jobs.finish(embed.input, {
                patch: { title: 'deleted update' },
            }),
            true,
        )
        assert.equal((await db.select().from(schema.links))[0].title, null)
        assert.equal(
            (
                await db
                    .select()
                    .from(schema.linkProcessingJobs)
                    .where(eq(schema.linkProcessingJobs.id, allJobs[1].id))
            )[0].status,
            'CANCELLED',
        )
        checks++
        // 공용 update는 휴지통 복구에도 쓰인다. Job 추가가 복구를 막지 않아야 한다.
        await assert.rejects(links.update(1, link.id, { memo: '삭제 중 수정' }))
        const restored = await links.update(1, link.id, { deletedAt: null })
        assert.equal(restored.deletedAt, null)
        assert.equal(
            (await db.select().from(schema.linkProcessingJobs)).length,
            2,
        )
        checks++
        console.log(
            `PostgreSQL integration: ${checks} checks passed (migrations, rollback, duplicate publish/claim, fencing, retry, exhaustion, ordering, deletion).`,
        )
    } finally {
        await client.end()
    }
}
main().catch((error: unknown) => {
    console.error(error)
    process.exitCode = 1
})
