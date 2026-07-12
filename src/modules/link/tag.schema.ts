import {
    bigint,
    foreignKey,
    index,
    integer,
    pgTable,
    timestamp,
    uniqueIndex,
    varchar,
} from 'drizzle-orm/pg-core'

import { users } from '../user/user.schema'

import { links } from './link.schema'

// 사용자 저장 링크에 붙는 태그. 전역 태그 사전을 두지 않고 링크별로 저장한다.
// user_id는 links에서 파생 가능하지만 사용자 내부 검색/추천 쿼리를 위해 중복 저장한다.
// 상세 설계는 docs/database/tables/tags.md 참조.
export const tags = pgTable(
    'tags',
    {
        id: bigint({ mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
        userId: bigint({ mode: 'number' })
            .notNull()
            .references(() => users.id),
        linkId: bigint({ mode: 'number' }).notNull(),
        name: varchar({ length: 20 }).notNull(),
        normalizedName: varchar({ length: 20 }).notNull(),
        sourceType: varchar({ length: 10 }).notNull(), // user | rule | ai
        sortOrder: integer(),
        createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
        updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    },
    (table) => [
        // (link_id, user_id) 복합 FK — 태그 소유자와 링크 소유자가 항상 같도록 DB에서 강제
        foreignKey({
            columns: [table.linkId, table.userId],
            foreignColumns: [links.id, links.userId],
            name: 'tags_link_id_user_id_fk',
        }).onDelete('cascade'),
        // 한 저장 링크 안에서 같은 태그 중복 추가 방지
        uniqueIndex('tags_link_id_normalized_name_idx').on(
            table.linkId,
            table.normalizedName,
        ),
        // 사용자 내부 exact match 추천/검색용
        index('tags_user_id_normalized_name_idx').on(
            table.userId,
            table.normalizedName,
        ),
        // NOTE: 유사 태그 추천용 gin(normalized_name gin_trgm_ops) 인덱스는
        //       pg_trgm 확장이 필요해 검색/추천 구현 시점에 추가한다. (단순화)
    ],
)

export type TagRow = typeof tags.$inferSelect
