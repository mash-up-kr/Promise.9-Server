import { sql } from 'drizzle-orm'
import {
    bigint,
    pgTable,
    timestamp,
    uniqueIndex,
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
    (table) => [
        // 활성 회원만 이메일 유니크 — 탈퇴(soft delete)한 행은 이메일을 그대로 남겨두므로
        // 전역 유니크로 두면 같은 이메일로 재가입하는 INSERT가 항상 제약 위반으로 깨진다.
        uniqueIndex('users_email_active_unique')
            .on(table.email)
            .where(sql`${table.deletedAt} is null`),
    ],
)

export type UserRow = typeof users.$inferSelect
