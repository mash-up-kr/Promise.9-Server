import { Injectable } from '@nestjs/common'
import {
    and,
    AnyColumn,
    asc,
    Column,
    cosineDistance,
    count,
    desc,
    eq,
    getTableColumns,
    gt,
    inArray,
    isNotNull,
    isNull,
    lt,
    max,
    or,
    SQL,
    sql,
} from 'drizzle-orm'

import { BaseException } from '../../common/exception/base.exception'
import { CursorPayload, decodeCursor } from '../../common/pagination/cursor'
import { DatabaseService } from '../../config/database/database.service'
import { FolderRow, folders } from '../folder/folder.schema'

import { ListLinksQueryInput } from './dto/link.dto'
import { LINK_SEARCH_CANDIDATE_LIMIT } from './link.constants'
import { LinkRow, links } from './link.schema'
import { LINK_ERROR } from './link-error.constant'
import { TagRow, tags } from './tag.schema'

// 링크 부분 수정 시 반영할 컬럼 집합 (undefined 필드는 호출부에서 제외한다)
export type LinkUpdatePatch = Partial<typeof links.$inferInsert>

export type LinkAiTagValue = Pick<
    typeof tags.$inferInsert,
    'name' | 'normalizedName' | 'sortOrder'
>

export type LinkListRow = LinkRow & {
    cursorValue: string | null
}

// 목록 sortBy 값 → 실제 정렬 컬럼 매핑. viewedAt만 null 허용.
const LINK_SORT_COLUMNS: Record<ListLinksQueryInput['sortBy'], Column> = {
    savedAt: links.createdAt,
    viewedAt: links.viewedAt,
    deletedAt: links.deletedAt,
}

// 커서 이후 행을 걸러내는 조건을 만든다.
// 정렬은 (sortColumn <dir>, idColumn <dir>)이며 null 위치는 Postgres 기본값
// (DESC → NULLS FIRST, ASC → NULLS LAST)을 그대로 따른다.
function buildCursorCondition(
    sortColumn: Column,
    idColumn: Column,
    order: 'asc' | 'desc',
    cursor: CursorPayload,
    value: SQL | null,
): SQL | undefined {
    if (order === 'desc') {
        // DESC → NULLS FIRST
        if (value === null) {
            // 커서가 null 블록(맨 앞) 안에 있음: 더 뒤의 null 또는 모든 비-null
            return or(
                isNotNull(sortColumn),
                and(isNull(sortColumn), lt(idColumn, cursor.id)),
            )
        }
        return and(
            isNotNull(sortColumn),
            or(
                lt(sortColumn, value),
                and(eq(sortColumn, value), lt(idColumn, cursor.id)),
            ),
        )
    }

    // ASC → NULLS LAST
    if (value === null) {
        return and(isNull(sortColumn), gt(idColumn, cursor.id))
    }
    return or(
        isNull(sortColumn),
        and(
            isNotNull(sortColumn),
            or(
                gt(sortColumn, value),
                and(eq(sortColumn, value), gt(idColumn, cursor.id)),
            ),
        ),
    )
}

// 커서 페이지네이션용 orderBy (정렬 컬럼 + tiebreaker id, 같은 방향).
function buildCursorOrderBy(
    sortColumn: Column,
    idColumn: Column,
    order: 'asc' | 'desc',
): SQL[] {
    const direction = order === 'desc' ? desc : asc
    return [direction(sortColumn), direction(idColumn)]
}

function parseCursorTimestamp(raw: string): SQL {
    const match = raw.match(
        /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})\.(\d{3,6})Z$/,
    )

    if (!match || match[1] === '0000') {
        throw new BaseException(LINK_ERROR.INVALID_CURSOR)
    }

    const [, year, month, day, hour, minute, second, fraction] = match
    const millisecondTimestamp = `${year}-${month}-${day}T${hour}:${minute}:${second}.${fraction.slice(0, 3)}Z`
    const date = new Date(millisecondTimestamp)

    if (
        Number.isNaN(date.getTime()) ||
        date.toISOString() !== millisecondTimestamp
    ) {
        throw new BaseException(LINK_ERROR.INVALID_CURSOR)
    }

    return sql`${raw}::timestamptz`
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

    // 삭제되지 않은 링크의 분석 결과만 갱신한다.
    async updateActive(
        userId: number,
        linkId: number,
        patch: LinkUpdatePatch,
    ): Promise<void> {
        await this.db
            .update(links)
            .set(patch)
            .where(
                and(
                    eq(links.id, linkId),
                    eq(links.userId, userId),
                    isNull(links.deletedAt),
                ),
            )
    }

    // 수집한 description을 기존 metadata와 병합하기 위해 현재 metadata만 조회한다.
    async findAnalysisMetadata(
        userId: number,
        linkId: number,
    ): Promise<Pick<LinkRow, 'metadata'> | undefined> {
        const [row] = await this.db
            .select({ metadata: links.metadata })
            .from(links)
            .where(
                and(
                    eq(links.id, linkId),
                    eq(links.userId, userId),
                    isNull(links.deletedAt),
                ),
            )
            .limit(1)

        return row
    }

    // 링크에 연결된 전체 태그를 표시 순서와 생성 순서대로 조회한다.
    findTags(userId: number, linkId: number): Promise<TagRow[]> {
        return this.db
            .select()
            .from(tags)
            .where(and(eq(tags.userId, userId), eq(tags.linkId, linkId)))
            .orderBy(asc(tags.sortOrder), asc(tags.id))
    }

    // 사용자·규칙 태그는 보존하고 AI 태그만 transaction 안에서 교체한다.
    async replaceAiTags(
        userId: number,
        linkId: number,
        generatedTags: LinkAiTagValue[],
    ): Promise<void> {
        await this.db.transaction(async (tx) => {
            const [link] = await tx
                .select({ id: links.id })
                .from(links)
                .where(
                    and(
                        eq(links.id, linkId),
                        eq(links.userId, userId),
                        isNull(links.deletedAt),
                    ),
                )
                .limit(1)

            if (!link) return

            await tx
                .delete(tags)
                .where(
                    and(
                        eq(tags.linkId, linkId),
                        eq(tags.userId, userId),
                        eq(tags.sourceType, 'ai'),
                    ),
                )

            await tx
                .insert(tags)
                .values(
                    generatedTags.map((tag) => ({
                        userId,
                        linkId,
                        ...tag,
                        sourceType: 'ai',
                    })),
                )
                .onConflictDoNothing()
        })
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

    // 검색(q)이 없는 목록 조회. 폴더·미분류·삭제·즐겨찾기 필터와 커서 페이지네이션을 적용한다.
    // 검색은 점수 순 정렬이라 search/SearchService의 다중 신호 경로로 처리한다.
    // 다음 페이지 판단을 위해 rows는 limit + 1개, totalCount는 커서와 무관한 전체 수다.
    async list(
        userId: number,
        input: ListLinksQueryInput,
    ): Promise<{ rows: LinkListRow[]; totalCount: number }> {
        const conditions = this.buildScopeConditions(userId, input)

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
                .select({
                    ...getTableColumns(links),
                    // JS Date는 PostgreSQL microsecond를 millisecond로 잘라 같은 1ms 안의
                    // 행이 다음 페이지에서 누락될 수 있다. DB가 만든 정밀 시각 문자열을
                    // 커서에 그대로 사용해 정렬 조건과 값을 일치시킨다.
                    cursorValue: sql<string | null>`to_char(
                        ${sortColumn} at time zone 'UTC',
                        'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'
                    )`,
                })
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

    // 코사인 유사도 상위 벡터 후보를 조회한다.
    async findVectorCandidates(
        userId: number,
        input: ListLinksQueryInput,
        queryEmbedding: number[],
    ): Promise<Array<{ id: number; score: number }>> {
        const scope = this.buildScopeConditions(userId, input)
        const distance = cosineDistance(links.embedding, queryEmbedding)
        const similarity = sql<number>`1 - (${distance})`

        return this.db
            .select({ id: links.id, score: similarity })
            .from(links)
            .where(and(...scope, isNotNull(links.embedding)))
            .orderBy(distance)
            .limit(LINK_SEARCH_CANDIDATE_LIMIT)
    }

    // 키워드 일치 후보를 최신 저장순으로 조회한다.
    async findKeywordCandidateIds(
        userId: number,
        input: ListLinksQueryInput,
    ): Promise<number[]> {
        const keyword = this.buildKeywordCondition(input.q ?? '')

        if (!keyword) {
            return []
        }

        const rows = await this.db
            .select({ id: links.id })
            .from(links)
            .where(and(...this.buildScopeConditions(userId, input), keyword))
            .orderBy(desc(links.createdAt))
            .limit(LINK_SEARCH_CANDIDATE_LIMIT)

        return rows.map((row) => row.id)
    }

    // 임베딩 벡터를 저장한다.
    async updateEmbedding(
        source: Pick<
            LinkRow,
            'id' | 'title' | 'aiSummary' | 'memo' | 'domain' | 'metadata'
        >,
        embedding: number[],
    ): Promise<void> {
        await this.db
            .update(links)
            .set({ embedding })
            .where(
                and(
                    eq(links.id, source.id),
                    sql`${links.title} is not distinct from ${source.title}`,
                    sql`${links.aiSummary} is not distinct from ${source.aiSummary}`,
                    sql`${links.memo} is not distinct from ${source.memo}`,
                    sql`${links.domain} is not distinct from ${source.domain}`,
                    sql`${links.metadata} is not distinct from ${source.metadata}`,
                ),
            )
    }

    // 사용자 범위와 목록 필터의 공통 조건을 만든다.
    private buildScopeConditions(
        userId: number,
        input: ListLinksQueryInput,
    ): SQL[] {
        const conditions: SQL[] = [
            eq(links.userId, userId),
            input.deleted
                ? isNotNull(links.deletedAt)
                : isNull(links.deletedAt),
        ]

        if (input.folderId) {
            conditions.push(eq(links.folderId, input.folderId))
        }

        if (input.unassigned) {
            conditions.push(isNull(links.folderId))
        }

        if (input.favorite) {
            conditions.push(eq(links.isFavorite, true))
        }

        if (input.sortBy === 'viewedAt') {
            conditions.push(isNotNull(links.viewedAt))
        }

        return conditions
    }

    // 키워드 부분일치 조건(title·domain·url·요약·메모). 빈 검색어면 undefined.
    // 한글 띄어쓰기/대소문자 불일치를 흡수하기 위해 양쪽을 공백 제거·소문자로 정규화 후 비교한다.
    private buildKeywordCondition(q: string): SQL | undefined {
        const normalized = q.toLowerCase().replace(/\s/g, '')

        if (!normalized) {
            return undefined
        }

        const keyword = `%${normalized}%`
        const columns = [
            links.title,
            links.domain,
            links.originalUrl,
            links.finalUrl,
            links.aiSummary,
            links.memo,
        ]

        return or(
            ...columns.map((column) => this.normalizedLike(column, keyword)),
        )
    }

    // 컬럼값을 공백 제거·소문자로 정규화한 뒤 부분일치시킨다(인덱스 미사용, 후보 스코프 내 스캔).
    private normalizedLike(column: AnyColumn, keyword: string): SQL {
        return sql`regexp_replace(lower(${column}), ${'\\s'}, '', 'g') like ${keyword}`
    }

    // 주어진 id 순서를 유지해 링크 행을 조회한다.
    async findByIdsInOrder(ids: number[]): Promise<LinkRow[]> {
        if (ids.length === 0) {
            return []
        }

        const rows = await this.db
            .select()
            .from(links)
            .where(inArray(links.id, ids))
        const rowById = new Map(rows.map((row) => [row.id, row]))

        return ids
            .map((id) => rowById.get(id))
            .filter((row): row is LinkRow => row !== undefined)
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

        const cursorValue =
            decoded.v === null ? null : parseCursorTimestamp(decoded.v)

        return buildCursorCondition(
            sortColumn,
            links.id,
            order,
            decoded,
            cursorValue,
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
