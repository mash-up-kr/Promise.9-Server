import { sql } from 'drizzle-orm'
import {
    bigint,
    check,
    foreignKey,
    index,
    integer,
    pgTable,
    text,
    timestamp,
    uniqueIndex,
    uuid,
    varchar,
} from 'drizzle-orm/pg-core'

import { links } from '../link.schema'

export const LINK_JOB_TYPES = ['ANALYZE', 'EMBEDDING'] as const
export const LINK_JOB_STATUSES = [
    'PENDING',
    'RUNNING',
    'COMPLETED',
    'FAILED',
    'CANCELLED',
] as const

export const linkProcessingJobs = pgTable(
    'link_processing_jobs',
    {
        id: bigint({ mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
        linkId: bigint({ mode: 'number' }).notNull(),
        userId: bigint({ mode: 'number' }).notNull(),
        jobType: varchar({ length: 20 })
            .$type<(typeof LINK_JOB_TYPES)[number]>()
            .notNull(),
        status: varchar({ length: 20 })
            .$type<(typeof LINK_JOB_STATUSES)[number]>()
            .notNull()
            .default('PENDING'),
        attemptCount: integer().notNull().default(0),
        nextAttemptAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
        executionToken: uuid(),
        leaseExpiresAt: timestamp({ withTimezone: true }),
        workerId: varchar({ length: 128 }),
        lastErrorCode: varchar({ length: 100 }),
        lastErrorMessage: text(),
        createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
        updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
        finishedAt: timestamp({ withTimezone: true }),
    },
    (t) => [
        foreignKey({
            columns: [t.linkId, t.userId],
            foreignColumns: [links.id, links.userId],
            name: 'link_jobs_link_owner_fk',
        }).onDelete('cascade'),
        check(
            'link_jobs_type_check',
            sql`${t.jobType} in ('ANALYZE', 'EMBEDDING')`,
        ),
        check(
            'link_jobs_status_check',
            sql`${t.status} in ('PENDING', 'RUNNING', 'COMPLETED', 'FAILED', 'CANCELLED')`,
        ),
        check('link_jobs_attempt_check', sql`${t.attemptCount} >= 0`),
        index('link_jobs_active_link_idx')
            .on(t.linkId, t.id)
            .where(sql`${t.status} in ('PENDING', 'RUNNING')`),
        uniqueIndex('link_jobs_running_link_idx')
            .on(t.linkId)
            .where(sql`${t.status} = 'RUNNING'`),
        index('link_jobs_expired_lease_idx')
            .on(t.leaseExpiresAt)
            .where(sql`${t.status} = 'RUNNING'`),
    ],
)

export const linkAnalysisOutbox = pgTable(
    'link_analysis_outbox',
    {
        id: bigint({ mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
        jobId: bigint({ mode: 'number' })
            .notNull()
            .references(() => linkProcessingJobs.id, { onDelete: 'cascade' }),
        availableAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
        publishedAt: timestamp({ withTimezone: true }),
        createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    },
    (t) => [
        index('link_outbox_publishable_idx')
            .on(t.availableAt, t.id)
            .where(sql`${t.publishedAt} is null`),
    ],
)

export type LinkJob = typeof linkProcessingJobs.$inferSelect
export type LinkJobType = (typeof LINK_JOB_TYPES)[number]
