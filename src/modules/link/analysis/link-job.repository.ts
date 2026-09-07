import { randomUUID } from 'node:crypto'

import { Injectable } from '@nestjs/common'
import { and, asc, eq, sql } from 'drizzle-orm'

import {
    DatabaseService,
    Transaction,
} from '../../../config/database/database.service'
import { links } from '../link.schema'
import { tags } from '../tag.schema'

import { AnalysisResult } from './link-analysis.type'
import { JOB_LEASE_SECONDS, JOB_MAX_ATTEMPTS } from './link-job.constant'
import {
    linkAnalysisOutbox as outbox,
    LinkJobType,
    linkProcessingJobs as jobs,
} from './link-job.schema'
import { ClaimedJob } from './link-job.type'

// 반드시 비즈니스 변경과 같은 트랜잭션에서 호출한다.
export async function enqueueLinkJob(
    tx: Transaction,
    linkId: number,
    userId: number,
    jobType: LinkJobType,
) {
    const [job] = await tx
        .insert(jobs)
        .values({ linkId, userId, jobType })
        .returning({ id: jobs.id })
    await tx.insert(outbox).values({ jobId: job.id })
}

export type ClaimResult =
    | { status: 'DONE' }
    | { status: 'WAIT' }
    | { status: 'CLAIMED'; input: ClaimedJob }

@Injectable()
export class LinkJobRepository {
    constructor(private readonly database: DatabaseService) {}

    // 같은 링크의 선점·저장은 언제나 link → job 순서로 잠근다.
    async claim(jobId: number): Promise<ClaimResult> {
        return this.database.db.transaction(async (tx) => {
            const [reference] = await tx
                .select({ linkId: jobs.linkId })
                .from(jobs)
                .where(eq(jobs.id, jobId))
            if (!reference) return { status: 'DONE' }
            const [link] = await tx
                .select()
                .from(links)
                .where(eq(links.id, reference.linkId))
                .for('update')
            const [job] = await tx
                .select()
                .from(jobs)
                .where(eq(jobs.id, jobId))
                .for('update')
            if (!link || !job || !['PENDING', 'RUNNING'].includes(job.status))
                return { status: 'DONE' }
            const [{ now }] = await tx
                .select({
                    now: sql<Date>`clock_timestamp()`,
                })
                .from(jobs)
                .where(eq(jobs.id, job.id))
            const nowMs = new Date(now).getTime()
            if (link.deletedAt) {
                await tx
                    .update(jobs)
                    .set({
                        status: 'CANCELLED',
                        finishedAt: sql`clock_timestamp()`,
                        updatedAt: sql`clock_timestamp()`,
                        executionToken: null,
                        leaseExpiresAt: null,
                    })
                    .where(eq(jobs.id, job.id))
                return { status: 'DONE' }
            }
            const [head] = await tx
                .select({ id: jobs.id })
                .from(jobs)
                .where(
                    and(
                        eq(jobs.linkId, link.id),
                        sql`${jobs.status} in ('PENDING', 'RUNNING')`,
                    ),
                )
                .orderBy(asc(jobs.id))
                .limit(1)
            if (
                head.id !== job.id ||
                job.nextAttemptAt.getTime() > nowMs ||
                (job.status === 'RUNNING' &&
                    job.leaseExpiresAt &&
                    job.leaseExpiresAt.getTime() > nowMs)
            )
                return { status: 'WAIT' }
            if (job.attemptCount >= JOB_MAX_ATTEMPTS) {
                await tx
                    .update(jobs)
                    .set({
                        status: 'FAILED',
                        finishedAt: sql`clock_timestamp()`,
                        updatedAt: sql`clock_timestamp()`,
                        executionToken: null,
                        leaseExpiresAt: null,
                        lastErrorCode: 'ATTEMPTS_EXHAUSTED',
                        lastErrorMessage: '작업 실행 횟수를 소진했습니다.',
                    })
                    .where(eq(jobs.id, job.id))
                if (job.jobType === 'ANALYZE')
                    await tx
                        .update(links)
                        .set({
                            aiSummaryStatus: 'FAILED',
                            updatedAt: sql`clock_timestamp()`,
                        })
                        .where(eq(links.id, link.id))
                return { status: 'DONE' }
            }
            const [claimed] = await tx
                .update(jobs)
                .set({
                    status: 'RUNNING',
                    attemptCount: job.attemptCount + 1,
                    executionToken: randomUUID(),
                    leaseExpiresAt: sql`clock_timestamp() + ${JOB_LEASE_SECONDS} * interval '1 second'`,
                    updatedAt: sql`clock_timestamp()`,
                })
                .where(eq(jobs.id, job.id))
                .returning()
            const tagRows = await tx
                .select()
                .from(tags)
                .where(
                    and(eq(tags.linkId, link.id), eq(tags.userId, link.userId)),
                )
                .orderBy(asc(tags.sortOrder), asc(tags.id))
            return {
                status: 'CLAIMED',
                input: { job: claimed, link, tags: tagRows },
            }
        })
    }

    async finish(input: ClaimedJob, result: AnalysisResult): Promise<boolean> {
        return this.database.db.transaction(async (tx) => {
            const [link] = await tx
                .select()
                .from(links)
                .where(eq(links.id, input.link.id))
                .for('update')
            const [job] = await tx
                .select()
                .from(jobs)
                .where(
                    and(
                        eq(jobs.id, input.job.id),
                        eq(jobs.status, 'RUNNING'),
                        eq(jobs.executionToken, input.job.executionToken!),
                        sql`${jobs.leaseExpiresAt} > clock_timestamp()`,
                    ),
                )
                .for('update')
            if (!link || !job) return false
            if (link.deletedAt) {
                await tx
                    .update(jobs)
                    .set({
                        status: 'CANCELLED',
                        executionToken: null,
                        leaseExpiresAt: null,
                        finishedAt: sql`clock_timestamp()`,
                        updatedAt: sql`clock_timestamp()`,
                    })
                    .where(eq(jobs.id, job.id))
                return true
            }
            const retry =
                result.failure?.retryable && job.attemptCount < JOB_MAX_ATTEMPTS
            if (retry) {
                const delay = 60 * 2 ** (job.attemptCount - 1)
                const [pending] = await tx
                    .update(jobs)
                    .set({
                        status: 'PENDING',
                        nextAttemptAt: sql`clock_timestamp() + ${delay} * interval '1 second'`,
                        executionToken: null,
                        leaseExpiresAt: null,
                        updatedAt: sql`clock_timestamp()`,
                        lastErrorCode: result.failure!.code,
                        lastErrorMessage: result.failure!.message,
                    })
                    .where(eq(jobs.id, job.id))
                    .returning()
                await tx.insert(outbox).values({
                    jobId: job.id,
                    availableAt: pending.nextAttemptAt,
                })
                return true
            }
            if (result.aiTags?.length) {
                await tx
                    .delete(tags)
                    .where(
                        and(
                            eq(tags.linkId, link.id),
                            eq(tags.userId, link.userId),
                            eq(tags.sourceType, 'ai'),
                        ),
                    )
                await tx
                    .insert(tags)
                    .values(
                        result.aiTags.map((tag) => ({
                            ...tag,
                            linkId: link.id,
                            userId: link.userId,
                            sourceType: 'ai',
                        })),
                    )
                    .onConflictDoNothing()
            }
            if (Object.keys(result.patch).length)
                await tx
                    .update(links)
                    .set({ ...result.patch, updatedAt: sql`clock_timestamp()` })
                    .where(eq(links.id, link.id))
            await tx
                .update(jobs)
                .set({
                    status: result.failure ? 'FAILED' : 'COMPLETED',
                    executionToken: null,
                    leaseExpiresAt: null,
                    finishedAt: sql`clock_timestamp()`,
                    updatedAt: sql`clock_timestamp()`,
                    lastErrorCode: result.failure?.code ?? null,
                    lastErrorMessage: result.failure?.message ?? null,
                })
                .where(eq(jobs.id, job.id))
            return true
        })
    }
}
