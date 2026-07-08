import {
    bigint,
    index,
    integer,
    numeric,
    pgTable,
    text,
    timestamp,
    uniqueIndex,
    uuid,
    varchar,
} from 'drizzle-orm/pg-core'

// AI 요약 시도별 메트릭(실행 이력·관측 데이터). 실패 기록 보장을 위해 물리 FK 없이
// user_link_id로 논리 참조한다. 서비스 반영 최종 요약은 user_links.ai_summary에 복사한다.
// 상세 설계는 docs/database/tables/ai_summary_metrics.md 참조.
export const aiSummaryMetrics = pgTable(
    'ai_summary_metrics',
    {
        // 비동기 작업 추적을 위해 애플리케이션에서 선발급 가능 (기본값은 DB 생성)
        id: uuid().primaryKey().defaultRandom(),
        linkId: bigint({ mode: 'number' }).notNull(), // links.id 논리 참조 (물리 FK 없음)
        attemptNumber: integer().notNull(), // 최초 시도는 1
        status: varchar({ length: 20 }).notNull(), // PENDING | SUCCESS | NEEDS_REVIEW | FAILED
        modelProvider: varchar({ length: 50 }).notNull(),
        modelName: varchar({ length: 100 }).notNull(),
        promptKey: varchar({ length: 100 }),
        inputTokens: integer(),
        outputTokens: integer(),
        generatedSummary: text(),
        inputCost: numeric({ precision: 12, scale: 6 }),
        outputCost: numeric({ precision: 12, scale: 6 }),
        currency: varchar({ length: 10 }), // 예: USD, KRW
        ttlbMs: integer(),
        errorCode: text(),
        errorMessage: text(),
        completedAt: timestamp({ withTimezone: true }),
        createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    },
    (table) => [
        // 같은 저장 링크의 재시도 순번 중복 방지
        uniqueIndex('ai_summary_metrics_link_attempt_idx').on(
            table.linkId,
            table.attemptNumber,
        ),
        // 특정 저장 링크의 성공/실패 시도 조회
        index('ai_summary_metrics_link_status_idx').on(
            table.linkId,
            table.status,
        ),
        // 모델별 비용/성능 집계
        index('ai_summary_metrics_model_created_at_idx').on(
            table.modelProvider,
            table.modelName,
            table.createdAt,
        ),
    ],
)

export type AiSummaryMetricRow = typeof aiSummaryMetrics.$inferSelect
