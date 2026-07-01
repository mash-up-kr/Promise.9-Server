import { bigint, pgTable, text, timestamp } from 'drizzle-orm/pg-core'

import { folders } from '../folder/folder.schema'

// 사용자가 저장한 링크.
// - folderId가 null이면 "미분류"
// - deletedAt이 not null이면 "최근 삭제된 항목"(30일 유예 후 영구 삭제 — 배치는 추후)
export const links = pgTable('links', {
    id: bigint({ mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
    userId: bigint({ mode: 'number' }).notNull(),
    folderId: bigint({ mode: 'number' }).references(() => folders.id, {
        onDelete: 'set null',
    }),
    url: text().notNull(),
    title: text(),
    source: text(),
    thumbnailUrl: text(),
    publishedAt: timestamp({ withTimezone: true }),
    memo: text(),
    aiSummary: text(),
    savedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp({ withTimezone: true }),
})

export type LinkRow = typeof links.$inferSelect
