import {
    bigint,
    pgTable,
    timestamp,
    unique,
    varchar,
} from 'drizzle-orm/pg-core'

import { users } from './user.schema'

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
