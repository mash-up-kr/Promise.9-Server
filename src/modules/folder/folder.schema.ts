import { sql } from 'drizzle-orm'
import {
    bigint,
    integer,
    pgTable,
    timestamp,
    uniqueIndex,
    varchar,
} from 'drizzle-orm/pg-core'

import { FOLDER_NAME_MAX_LENGTH } from './folder.constants'

// 사용자가 생성하는 실제 폴더. 화면의 전체/미분류/즐겨찾기/최근삭제는 row가 아니라 링크 조회 조건으로 처리한다.
// 폴더명 유일성은 "삭제되지 않은(deleted_at IS NULL) 폴더" 기준 partial unique index로 DB에서 보장한다.
// (soft delete 도입 시 삭제된 폴더가 이름을 점유하지 않도록. 동시 생성/rename 경쟁도 DB에서 차단)
export const folders = pgTable(
    'folders',
    {
        id: bigint({ mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
        userId: bigint({ mode: 'number' }).notNull(),
        name: varchar({ length: FOLDER_NAME_MAX_LENGTH }).notNull(),
        sortOrder: integer(),
        createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
        updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
        deletedAt: timestamp({ withTimezone: true }),
    },
    (table) => [
        // 활성 폴더는 (user_id, name) 유니크 — 사용자별 폴더명 중복 방지
        uniqueIndex('folders_user_id_name_active_idx')
            .on(table.userId, table.name)
            .where(sql`${table.deletedAt} is null`),
    ],
)

export type FolderRow = typeof folders.$inferSelect
