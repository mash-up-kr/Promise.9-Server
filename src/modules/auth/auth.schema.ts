import {
    bigint,
    bigserial,
    index,
    pgTable,
    timestamp,
    unique,
    uniqueIndex,
    uuid,
    varchar,
} from 'drizzle-orm/pg-core'

import { users } from '../users/users.schema'

// Google, Kakao 등 소셜 로그인 계정을 회원과 연결하는 테이블.
// 상세 설계는 docs/database/tables/social_accounts.md 참조.
export const socialAccounts = pgTable(
    'social_accounts',
    {
        id: bigint({ mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
        userId: bigint({ mode: 'number' })
            .notNull()
            .references(() => users.id),
        provider: varchar({ length: 20 }).notNull(), // 예: google, kakao
        providerUserId: varchar({ length: 255 }).notNull(),
        providerEmail: varchar({ length: 320 }),
        createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
        updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    },
    (table) => [
        // provider + provider_user_id 유니크 (제공자 내 계정 식별)
        unique('social_accounts_provider_provider_user_id_unique').on(
            table.provider,
            table.providerUserId,
        ),
        // 한 회원은 동일 제공자를 하나만 연결할 수 있다.
        unique('social_accounts_user_id_provider_unique').on(
            table.userId,
            table.provider,
        ),
    ],
)

export type SocialAccountRow = typeof socialAccounts.$inferSelect

// 상세 설계는 docs/database/tables/refresh_tokens.md 참조.
export const refreshTokens = pgTable(
    'refresh_tokens',
    {
        id: bigserial({ mode: 'number' }).primaryKey(),
        userId: bigint({ mode: 'number' })
            .notNull()
            .references(() => users.id, { onDelete: 'cascade' }),
        tokenHash: varchar({ length: 64 }).notNull(), // sha256(token)
        tokenFamily: uuid().notNull(), // rotation 체인 식별
        expiresAt: timestamp({ withTimezone: true }).notNull(),
        revokedAt: timestamp({ withTimezone: true }), // null=유효
        createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    },
    (table) => [
        uniqueIndex('refresh_tokens_token_hash_idx').on(table.tokenHash),
        index('refresh_tokens_user_id_idx').on(table.userId),
        index('refresh_tokens_family_idx').on(table.tokenFamily),
    ],
)

export type RefreshTokenRow = typeof refreshTokens.$inferSelect
