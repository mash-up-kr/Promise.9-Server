import {
    bigint,
    pgTable,
    timestamp,
    unique,
    varchar,
} from 'drizzle-orm/pg-core'

// 회원 계정 기준 테이블. 상세 설계는 docs/database/tables/users.md 참조.
// 처음에는 단순하게 — 대표 이메일 + 타임스탬프 + 소프트 삭제만 둔다.
export const users = pgTable(
    'users',
    {
        id: bigint({ mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
        email: varchar({ length: 320 }).notNull(),
        createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
        updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
        deletedAt: timestamp({ withTimezone: true }),
    },
    (table) => [unique('users_email_unique').on(table.email)],
)

export type UserRow = typeof users.$inferSelect
