import {
    bigint,
    index,
    pgTable,
    timestamp,
    uniqueIndex,
    uuid,
    varchar,
} from 'drizzle-orm/pg-core'

import { users } from './user.schema'

// 리프레시 토큰 저장 테이블. 원문 대신 해시만 보관하고 RTR(rotation)로 재사용을 탐지한다.
// tokenFamily는 회전 체인을 묶는 식별자 — 탈취 감지 시 family 전체를 revoke한다.
export const refreshTokens = pgTable(
    'refresh_tokens',
    {
        id: bigint({ mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
        userId: bigint({ mode: 'number' })
            .notNull()
            .references(() => users.id, { onDelete: 'cascade' }),
        // 토큰 원문의 sha256 hex (64자)
        tokenHash: varchar({ length: 64 }).notNull(),
        // 회전 체인 식별자
        tokenFamily: uuid().notNull(),
        expiresAt: timestamp({ withTimezone: true }).notNull(),
        // null이면 유효, 값이 있으면 폐기됨
        revokedAt: timestamp({ withTimezone: true }),
        createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    },
    (table) => [
        // 토큰 해시로 단건 조회 (유일)
        uniqueIndex('refresh_tokens_token_hash_idx').on(table.tokenHash),
        // 사용자별 토큰 조회
        index('refresh_tokens_user_id_idx').on(table.userId),
        // family 단위 일괄 revoke
        index('refresh_tokens_family_idx').on(table.tokenFamily),
    ],
)

export type RefreshTokenRow = typeof refreshTokens.$inferSelect
