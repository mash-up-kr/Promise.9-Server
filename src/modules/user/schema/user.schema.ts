import { isNull } from 'drizzle-orm'
import {
    bigint,
    jsonb,
    pgTable,
    timestamp,
    uniqueIndex,
    varchar,
} from 'drizzle-orm/pg-core'

import type { MarketingTouch } from '../user-attribution'

// 회원 계정 기준 테이블. 상세 설계는 docs/database/tables/users.md 참조.
export const users = pgTable(
    'users',
    {
        id: bigint({ mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
        email: varchar({ length: 320 }).notNull(),
        firstMarketingTouch: jsonb().$type<MarketingTouch>(),
        lastMarketingTouch: jsonb().$type<MarketingTouch>(),
        createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
        updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
        deletedAt: timestamp({ withTimezone: true }),
    },
    (table) => [
        uniqueIndex('users_active_email_unique')
            .on(table.email)
            .where(isNull(table.deletedAt)),
    ],
)

export type UserRow = typeof users.$inferSelect
