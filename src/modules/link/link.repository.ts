import { Injectable } from '@nestjs/common'
import {
    and,
    Column,
    count,
    eq,
    ilike,
    isNotNull,
    isNull,
    max,
    or,
    SQL,
} from 'drizzle-orm'

import { BaseException } from '../../common/exception/base.exception'
import {
    buildCursorCondition,
    buildCursorOrderBy,
    decodeCursor,
} from '../../common/pagination/cursor'
import { DatabaseService } from '../../config/database/database.service'
import { FolderRow, folders } from '../folder/folder.schema'

import { ListLinksQueryInput } from './dto/link.dto'
import { LinkRow, links } from './link.schema'
import { LINK_ERROR } from './link-error.constant'

// 링크 부분 수정 시 반영할 컬럼 집합 (undefined 필드는 호출부에서 제외한다)
export type LinkUpdatePatch = Partial<typeof links.$inferInsert>

// 목록 sortBy 값 → 실제 정렬 컬럼 매핑. viewedAt만 null 허용.
const LINK_SORT_COLUMNS: Record<ListLinksQueryInput['sortBy'], Column> = {
    savedAt: links.createdAt,
    viewedAt: links.viewedAt,
    deletedAt: links.deletedAt,
}

@Injectable()
export class LinkRepository {
    constructor(private readonly databaseService: DatabaseService) {}

    private get db() {
        return this.databaseService.db
    }

    async insert(values: typeof links.$inferInsert): Promise<LinkRow> {
        const [row] = await this.throwOnDuplicateUrl(() =>
            this.db.insert(links).values(values).returning(),
        )

        return row
    }

    // 소유권 확인용 단건 조회 (없으면 undefined, 도메인 예외는 서비스가 담당).
    async findOwned(
        userId: number,
        linkId: number,
        options: { includeDeleted?: boolean } = {},
    ): Promise<LinkRow | undefined> {
        const conditions = [eq(links.id, linkId), eq(links.userId, userId)]

        if (!options.includeDeleted) {
            conditions.push(isNull(links.deletedAt))
        }

        const [row] = await this.db
            .select()
            .from(links)
            .where(and(...conditions))
            .limit(1)

        return row
    }

    async update(
        userId: number,
        linkId: number,
        patch: LinkUpdatePatch,
    ): Promise<LinkRow> {
        const [row] = await this.db
            .update(links)
            .set(patch)
            .where(and(eq(links.id, linkId), eq(links.userId, userId)))
            .returning()

        return row
    }

    // 같은 사용자가 저장한(삭제되지 않은) 동일 정규화 URL이 있는지 조회한다.
    async findActiveByNormalizedUrl(
        userId: number,
        normalizedUrl: string,
    ): Promise<Pick<LinkRow, 'id'> | undefined> {
        const [row] = await this.db
            .select({ id: links.id })
            .from(links)
            .where(
                and(
                    eq(links.userId, userId),
                    eq(links.normalizedUrl, normalizedUrl),
                    isNull(links.deletedAt),
                ),
            )
            .limit(1)

        return row
    }

    // 목록 조회. 검색·폴더·미분류·삭제·즐겨찾기 필터와 커서 페이지네이션을 적용한다.
    // 다음 페이지 판단을 위해 rows는 limit + 1개, totalCount는 커서와 무관한 전체 수다.
    async list(
        userId: number,
        input: ListLinksQueryInput,
    ): Promise<{ rows: LinkRow[]; totalCount: number }> {
        const conditions = [
            eq(links.userId, userId),
            input.deleted
                ? isNotNull(links.deletedAt)
                : isNull(links.deletedAt),
        ]

        if (input.q) {
            const keyword = `%${input.q}%`
            // 검색 대상: title, domain, original_url, final_url, ai_summary, memo
            const searchCondition = or(
                ilike(links.title, keyword),
                ilike(links.domain, keyword),
                ilike(links.originalUrl, keyword),
                ilike(links.finalUrl, keyword),
                ilike(links.aiSummary, keyword),
                ilike(links.memo, keyword),
            )

            if (searchCondition) {
                conditions.push(searchCondition)
            }
        }

        if (input.folderId) {
            conditions.push(eq(links.folderId, input.folderId))
        }

        if (input.unassigned) {
            conditions.push(isNull(links.folderId))
        }

        if (input.favorite) {
            conditions.push(eq(links.isFavorite, true))
        }

        // "최근 본" 정렬은 조회 이력이 있는 링크만 대상으로 한다.
        // (계약: sortBy=viewedAt일 때 viewedAt=null 링크는 결과에서 제외)
        if (input.sortBy === 'viewedAt') {
            conditions.push(isNotNull(links.viewedAt))
        }

        // sortBy → 실제 정렬 컬럼. 위 조건들로 정렬 컬럼은 항상 not-null이 보장돼
        // (savedAt=createdAt, deletedAt은 deleted 필터, viewedAt은 위 제외 조건)
        // 커서 정렬이 안정적이다.
        const sortColumn = LINK_SORT_COLUMNS[input.sortBy]

        // 커서 조건은 목록 조회에만 적용하고 totalCount 집계에서는 제외한다.
        const cursorCondition = input.cursor
            ? this.resolveCursorCondition(input.cursor, sortColumn, input.order)
            : undefined

        const [totalCount, rows] = await Promise.all([
            this.countLinks(...conditions),
            this.db
                .select()
                .from(links)
                .where(
                    and(
                        ...conditions,
                        ...(cursorCondition ? [cursorCondition] : []),
                    ),
                )
                .orderBy(
                    ...buildCursorOrderBy(sortColumn, links.id, input.order),
                )
                // 다음 페이지 존재 여부 판단을 위해 limit + 1개를 조회한다.
                .limit(input.limit + 1),
        ])

        return { rows, totalCount }
    }

    // 요청 cursor를 목록 쿼리 조건으로 변환한다. 형식이 어긋나면 400.
    private resolveCursorCondition(
        cursor: string,
        sortColumn: Column,
        order: 'asc' | 'desc',
    ): SQL | undefined {
        const decoded = decodeCursor(cursor)
        if (!decoded) {
            throw new BaseException(LINK_ERROR.INVALID_CURSOR)
        }

        return buildCursorCondition(
            sortColumn,
            links.id,
            order,
            decoded,
            (raw) => {
                const date = new Date(raw)
                if (Number.isNaN(date.getTime())) {
                    throw new BaseException(LINK_ERROR.INVALID_CURSOR)
                }
                return date
            },
        )
    }

    // 전체/미분류/즐겨찾기/최근삭제 링크 수를 한 번에 계산한다.
    async countSystemFolders(userId: number) {
        const owned = eq(links.userId, userId)

        const [all, uncategorized, favorite, recentlyDeleted] =
            await Promise.all([
                this.countLinks(owned, isNull(links.deletedAt)),
                this.countLinks(
                    owned,
                    isNull(links.folderId),
                    isNull(links.deletedAt),
                ),
                this.countLinks(
                    owned,
                    eq(links.isFavorite, true),
                    isNull(links.deletedAt),
                ),
                this.countLinks(owned, isNotNull(links.deletedAt)),
            ])

        return { all, uncategorized, favorite, recentlyDeleted }
    }

    // 폴더별 활성 링크 수를 그룹 조회한다. (미분류 folderId=null 포함, 맵 변환은 서비스가 담당)
    async countActiveGroupedByFolder(
        userId: number,
    ): Promise<{ folderId: number | null; linkCount: number }[]> {
        return this.db
            .select({ folderId: links.folderId, linkCount: count(links.id) })
            .from(links)
            .where(and(eq(links.userId, userId), isNull(links.deletedAt)))
            .groupBy(links.folderId)
    }

    // 폴더별 마지막 활성 링크 저장 시각을 그룹 조회한다. (미분류 folderId=null 포함, 맵 변환은 서비스가 담당)
    async lastSavedAtGroupedByFolder(userId: number): Promise<
        {
            folderId: number | null
            lastSavedAt: string | Date | null
        }[]
    > {
        return this.db
            .select({
                folderId: links.folderId,
                lastSavedAt: max(links.createdAt),
            })
            .from(links)
            .where(and(eq(links.userId, userId), isNull(links.deletedAt)))
            .groupBy(links.folderId)
    }

    // 링크에 연결된 폴더 참조를 조회한다 (소유권 확인 없이 id·name만).
    async findFolder(
        folderId: number,
    ): Promise<Pick<FolderRow, 'id' | 'name'> | undefined> {
        const [row] = await this.db
            .select({ id: folders.id, name: folders.name })
            .from(folders)
            .where(eq(folders.id, folderId))
            .limit(1)

        return row
    }

    // 해당 사용자가 소유한 폴더인지 확인용 조회 (없으면 undefined).
    async findFolderOwnedBy(
        userId: number,
        folderId: number,
    ): Promise<Pick<FolderRow, 'id'> | undefined> {
        const [row] = await this.db
            .select({ id: folders.id })
            .from(folders)
            .where(and(eq(folders.id, folderId), eq(folders.userId, userId)))
            .limit(1)

        return row
    }

    // 조건에 맞는 링크 수를 센다.
    private async countLinks(...conditions: SQL[]): Promise<number> {
        const [row] = await this.db
            .select({ value: count() })
            .from(links)
            .where(and(...conditions))

        return row.value
    }

    // 선검사와 저장 사이의 경합으로 partial unique index를 위반할 때 나는 23505를 도메인 예외로 변환한다.
    private async throwOnDuplicateUrl<T>(run: () => Promise<T>): Promise<T> {
        try {
            return await run()
        } catch (error) {
            if (
                error instanceof Error &&
                'code' in error &&
                error.code === '23505'
            ) {
                throw new BaseException(LINK_ERROR.ALREADY_EXISTS)
            }
            throw error
        }
    }
}
