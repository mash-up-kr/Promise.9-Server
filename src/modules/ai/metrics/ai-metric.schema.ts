import {
    bigint,
    index,
    integer,
    jsonb,
    pgTable,
    text,
    timestamp,
    uniqueIndex,
    uuid,
    varchar,
} from 'drizzle-orm/pg-core'

import { AiMetricStatus, AiTaskType } from '../ai.constants'

import { AiMetricGeneratedResult } from './ai-metric.type'

export const aiMetrics = pgTable(
    'ai_metrics',
    {
        id: uuid().primaryKey(),
        userLinkId: bigint({ mode: 'number' }).notNull(),
        taskType: varchar({ length: 50 }).$type<AiTaskType>().notNull(),
        attemptNumber: integer().notNull(),
        status: varchar({ length: 30 }).$type<AiMetricStatus>().notNull(),
        modelProvider: varchar({ length: 50 }).notNull(),
        modelName: varchar({ length: 120 }).notNull(),
        promptKey: varchar({ length: 120 }),
        inputTokens: integer(),
        outputTokens: integer(),
        generatedResult: jsonb().$type<AiMetricGeneratedResult | null>(),
        ttlbMs: integer().notNull(),
        errorCode: text(),
        errorMessage: text(),
        createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    },
    (table) => [
        uniqueIndex('ai_metrics_user_link_task_attempt_idx').on(
            table.userLinkId,
            table.taskType,
            table.attemptNumber,
        ),
        index('ai_metrics_user_link_task_status_idx').on(
            table.userLinkId,
            table.taskType,
            table.status,
        ),
    ],
)

export type AiMetricRow = typeof aiMetrics.$inferSelect
