import { pgTable, timestamp, uuid, varchar } from 'drizzle-orm/pg-core'

// 사용자가 생성하는 일반 폴더. 시스템 폴더(전체/미분류/최근삭제)는 row가 아니라 계산값으로 처리한다.
export const folders = pgTable('folders', {
    id: uuid().primaryKey().defaultRandom(),
    userId: uuid().notNull(),
    name: varchar({ length: 255 }).notNull(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
})

export type FolderRow = typeof folders.$inferSelect
