import { sql } from 'drizzle-orm'
import {
    bigint,
    boolean,
    index,
    jsonb,
    pgTable,
    text,
    timestamp,
    unique,
    uniqueIndex,
    varchar,
} from 'drizzle-orm/pg-core'

import { folders } from '../folder/folder.schema'

// links.metadata(jsonb) 구조. 최상위에 version을 두고 버전별 처리기가 파싱한다.
// (docs/database/tables/user_links.md 의 metadata 구조 참조. 테이블명은 links로 구현)
export type LinkMetadata = {
    version: number
    description?: string
    faviconUrl?: string
    images?: Array<{
        url: string
        source?: string
        width?: number
        height?: number
        dominantColor?: string
    }>
}

// 사용자가 저장한 링크. URL·수집 메타데이터·AI 요약·상태를 한 테이블에 통합한다(비정규화).
// 같은 URL을 여러 사용자가 저장해도 행은 독립적으로 생성한다.
// 상세 설계는 docs/database/tables/user_links.md 참조.
export const links = pgTable(
    'links',
    {
        id: bigint({ mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
        // FK to users는 인증/사용자 시딩 도입 시 추가 (현재는 DEV_USER_ID 사용)
        userId: bigint({ mode: 'number' }).notNull(),
        // 미분류면 null. 폴더 삭제 시 set null.
        folderId: bigint({ mode: 'number' }).references(() => folders.id, {
            onDelete: 'set null',
        }),
        originalUrl: text().notNull(),
        // 사용자별 중복 저장 판단 키 (final_url 우선, 실패 시 original_url 정규화)
        normalizedUrl: text().notNull(),
        finalUrl: text(),
        domain: varchar({ length: 255 }),
        title: varchar({ length: 512 }),
        // OG/favicon/description/이미지/색상 등 확장 메타데이터
        metadata: jsonb().$type<LinkMetadata>(),
        aiSummary: text(),
        // 저장 링크 단위 대표 상태: PENDING | SUCCESS | NEEDS_REVIEW | FAILED
        aiSummaryStatus: varchar({ length: 20 }).notNull().default('PENDING'),
        memo: text(),
        isFavorite: boolean().notNull().default(false),
        // 상세 화면이 실제 노출됐을 때 POST /links/:linkId/view로 갱신한다.
        viewedAt: timestamp({ withTimezone: true }),
        deletedAt: timestamp({ withTimezone: true }),
        createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
        updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    },
    (table) => [
        // tags의 (link_id, user_id) 복합 FK 타겟 — 태그·링크 소유자 정합성 보장용
        unique('links_id_user_id_unique').on(table.id, table.userId),
        // 활성 링크는 (user_id, normalized_url) 유니크 — 사용자별 중복 저장 방지
        uniqueIndex('links_user_id_normalized_url_active_idx')
            .on(table.userId, table.normalizedUrl)
            .where(sql`${table.deletedAt} is null`),
        // 내 링크 목록 최신순
        index('links_user_id_created_at_idx').on(
            table.userId,
            table.createdAt.desc(),
        ),
        // 폴더별 링크 목록
        index('links_user_id_folder_id_created_at_idx')
            .on(table.userId, table.folderId, table.createdAt.desc())
            .where(sql`${table.deletedAt} is null`),
        // 최근 삭제된 항목 조회
        index('links_user_id_deleted_at_idx').on(table.userId, table.deletedAt),
        // 영구 삭제 배치 대상 조회
        index('links_deleted_at_idx')
            .on(table.deletedAt)
            .where(sql`${table.deletedAt} is not null`),
    ],
)

export type LinkRow = typeof links.$inferSelect
