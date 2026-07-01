import {
    bigint,
    pgTable,
    timestamp,
    unique,
    varchar,
} from 'drizzle-orm/pg-core'

import { FOLDER_NAME_MAX_LENGTH } from './folder.constants'

// 사용자가 생성하는 일반 폴더. 시스템 폴더(전체/미분류/최근삭제)는 row가 아니라 계산값으로 처리한다.
// 한 사용자 안에서 폴더 이름은 유일하다(하드 삭제라 삭제 시 이름이 곧바로 풀린다).
export const folders = pgTable(
    'folders',
    {
        id: bigint({ mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
        userId: bigint({ mode: 'number' }).notNull(),
        name: varchar({ length: FOLDER_NAME_MAX_LENGTH }).notNull(),
        createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
        updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    },
    (table) => [
        unique('folders_user_id_name_unique').on(table.userId, table.name),
    ],
)

export type FolderRow = typeof folders.$inferSelect
