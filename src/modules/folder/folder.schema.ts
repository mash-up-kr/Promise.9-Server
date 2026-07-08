import {
    bigint,
    integer,
    pgTable,
    timestamp,
    varchar,
} from 'drizzle-orm/pg-core'

import { FOLDER_NAME_MAX_LENGTH } from './folder.constants'

// 사용자가 생성하는 일반 폴더. 시스템 폴더(전체/미분류/최근삭제)는 row가 아니라 계산값으로 처리한다.
// 폴더명 유일성은 DB 유니크 제약이 아니라 애플리케이션에서 "삭제되지 않은(deleted_at IS NULL) 폴더"
// 기준으로 검증한다. (soft delete 도입 시 삭제된 폴더가 이름을 점유하지 않도록)
export const folders = pgTable('folders', {
    id: bigint({ mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
    userId: bigint({ mode: 'number' }).notNull(),
    name: varchar({ length: FOLDER_NAME_MAX_LENGTH }).notNull(),
    sortOrder: integer(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp({ withTimezone: true }),
})

export type FolderRow = typeof folders.$inferSelect
