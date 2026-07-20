import { Injectable, NotImplementedException } from '@nestjs/common'
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
    buildCursorPage,
    decodeCursor,
} from '../../common/pagination/cursor'
import { DatabaseService } from '../../config/database/database.service'
import { folders } from '../folder/folder.schema'
import { FOLDER_ERROR } from '../folder/folder-error.constant'

import {
    CreateLinkInput,
    ListLinksQueryInput,
    UpdateLinkInput,
} from './dto/link.dto'
import { CreateLinkTagInput } from './dto/tag.dto'
import { LinkRow, links } from './link.schema'
import { extractDomain, normalizeUrl, pickThumbnailUrl } from './link.util'
import { LINK_ERROR } from './link-error.constant'

// 목록 sortBy 값 → 실제 정렬 컬럼 매핑. viewedAt만 null 허용.
const LINK_SORT_COLUMNS: Record<ListLinksQueryInput['sortBy'], Column> = {
    savedAt: links.createdAt,
    viewedAt: links.viewedAt,
    deletedAt: links.deletedAt,
}

@Injectable()
export class LinkService {
    constructor(private readonly databaseService: DatabaseService) {}

    private get db() {
        return this.databaseService.db
    }

    async create(userId: number, input: CreateLinkInput) {
        if (input.folderId) {
            await this.assertOwnedFolder(userId, input.folderId)
        }

        const normalizedUrl = normalizeUrl(input.url)
        await this.assertNotDuplicated(userId, normalizedUrl)

        const [row] = await this.db
            .insert(links)
            .values({
                userId,
                folderId: input.folderId ?? null,
                originalUrl: input.url,
                normalizedUrl,
                domain: extractDomain(input.url),
                // 메타데이터/요약 수집은 후속 작업 — 저장 시점엔 대기 상태로 둔다.
                aiSummaryStatus: 'PENDING',
                memo: input.memo ?? null,
            })
            .returning()

        return {
            linkId: row.id,
            url: row.originalUrl,
            savedAt: row.createdAt,
        }
    }

    async detail(userId: number, linkId: number) {
        const link = await this.getOwnedLink(userId, linkId)
        const folder = await this.findFolderRef(link.folderId)
        const isProcessing = link.aiSummaryStatus === 'PENDING'

        return {
            linkId: link.id,
            url: link.originalUrl,
            folder,
            thumbnailUrl: pickThumbnailUrl(link.metadata),
            title: link.title,
            source: link.domain,
            // 발행 시각은 별도 컬럼 없이 메타데이터에서 다룰 예정 — 현재는 null
            publishedAt: null,
            savedAt: link.createdAt,
            isFavorite: link.isFavorite,
            viewedAt: link.viewedAt,
            processingStatus: link.aiSummaryStatus,
            aiSummary: link.aiSummary,
            // 처리 중 null과 처리 완료 후 빈 결과를 구분한다.
            // TODO: 태그·연관 링크 조회 로직을 연결한다.
            tags: isProcessing ? null : [],
            memo: link.memo,
            relatedLinks: isProcessing ? null : [],
        }
    }

    async update(userId: number, linkId: number, input: UpdateLinkInput) {
        await this.getOwnedLink(userId, linkId)

        const patch: Partial<typeof links.$inferInsert> = {
            updatedAt: new Date(),
        }

        if (input.folderId) {
            await this.assertOwnedFolder(userId, input.folderId)
        }

        if (input.folderId !== undefined) {
            patch.folderId = input.folderId
        }

        if (input.memo !== undefined) {
            patch.memo = input.memo
        }

        if (input.isFavorite !== undefined) {
            patch.isFavorite = input.isFavorite
        }

        const [row] = await this.db
            .update(links)
            .set(patch)
            .where(and(eq(links.id, linkId), eq(links.userId, userId)))
            .returning()

        return {
            linkId: row.id,
            folderId: row.folderId,
            memo: row.memo,
            isFavorite: row.isFavorite,
            updatedAt: row.updatedAt,
        }
    }

    async remove(userId: number, linkId: number) {
        await this.getOwnedLink(userId, linkId)

        // "최근 삭제된 항목"으로 이동 (30일 유예 후 영구 삭제 — 배치는 추후)
        await this.db
            .update(links)
            .set({ deletedAt: new Date(), updatedAt: new Date() })
            .where(and(eq(links.id, linkId), eq(links.userId, userId)))
    }

    async restore(userId: number, linkId: number) {
        // 삭제된 링크도 대상이므로 includeDeleted로 조회
        const link = await this.getOwnedLink(userId, linkId, {
            includeDeleted: true,
        })

        // 활성 링크에 복구를 호출하면 폴더가 미분류로 날아가므로 거부한다.
        if (!link.deletedAt) {
            throw new BaseException(LINK_ERROR.NOT_DELETED)
        }

        // 복구된 링크는 "미분류"로 복원
        const [row] = await this.db
            .update(links)
            .set({ deletedAt: null, folderId: null, updatedAt: new Date() })
            .where(and(eq(links.id, linkId), eq(links.userId, userId)))
            .returning()

        return {
            linkId: row.id,
            folderId: null,
            restoredAt: row.updatedAt,
        }
    }

    async markViewed(userId: number, linkId: number) {
        await this.getOwnedLink(userId, linkId)

        const now = new Date()
        await this.db
            .update(links)
            .set({ viewedAt: now, updatedAt: now })
            .where(and(eq(links.id, linkId), eq(links.userId, userId)))
    }

    createTag(
        userId: number,
        linkId: number,
        input: CreateLinkTagInput,
    ): never {
        void userId
        void linkId
        void input
        // TODO: 링크 소유권 확인, 태그명 정규화·중복 검사 후 tags row를 저장한다.
        throw new NotImplementedException(
            '링크 태그 추가 로직은 아직 구현되지 않았습니다.',
        )
    }

    removeTag(userId: number, linkId: number, tagId: number): never {
        void userId
        void linkId
        void tagId
        // TODO: 링크·태그 소유권 확인 후 해당 tags row를 삭제한다.
        throw new NotImplementedException(
            '링크 태그 삭제 로직은 아직 구현되지 않았습니다.',
        )
    }

    async list(userId: number, input: ListLinksQueryInput) {
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

        // sortBy → 실제 정렬 컬럼. viewedAt만 null 가능하고, savedAt(createdAt)과
        // deletedAt은 각 필터 조건에서 항상 not-null이라 커서 정렬이 안정적이다.
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

        const { rows: pageRows, pagination } = buildCursorPage(
            rows,
            input.limit,
            (row) => ({
                v: this.cursorValueOf(row, input.sortBy),
                id: row.id,
            }),
        )

        return {
            links: pageRows.map((row) => ({
                linkId: row.id,
                title: row.title,
                source: row.domain,
                // TODO: 태그 선정 정책에 따라 목록 카드용 대표 태그를 연결한다.
                representativeTag: null,
                thumbnailUrl: pickThumbnailUrl(row.metadata),
                savedAt: row.createdAt,
            })),
            pagination,
            totalCount,
        }
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

    // 다음 커서에 담을 정렬 기준 값. 타임스탬프는 ISO 문자열, null이면 null.
    private cursorValueOf(
        row: LinkRow,
        sortBy: ListLinksQueryInput['sortBy'],
    ): string | null {
        const value = {
            savedAt: row.createdAt,
            viewedAt: row.viewedAt,
            deletedAt: row.deletedAt,
        }[sortBy]

        return value ? value.toISOString() : null
    }

    // 화면의 전체/미분류/최근삭제 링크 목록에 표시할 수를 한 번에 계산한다.
    async getSystemFolderCounts(userId: number) {
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

        return {
            all: { linkCount: all },
            uncategorized: { linkCount: uncategorized },
            favorite: { linkCount: favorite },
            recentlyDeleted: { linkCount: recentlyDeleted },
        }
    }

    // TODO: 폴더별 links 집계 조회들(countActiveByFolder 포함)은 추후 LinkRepository 계층으로 이관한다.
    // 사용자의 폴더별 마지막 활성 링크 저장 시각을 folderId → Date 맵으로 반환한다. (미분류 제외)
    async lastSavedAtByFolder(userId: number): Promise<Map<number, Date>> {
        const rows = await this.db
            .select({
                folderId: links.folderId,
                lastSavedAt: max(links.createdAt),
            })
            .from(links)
            .where(and(eq(links.userId, userId), isNull(links.deletedAt)))
            .groupBy(links.folderId)

        return new Map(
            rows
                .filter(
                    (row) => row.folderId !== null && row.lastSavedAt !== null,
                )
                .map((row) => [
                    row.folderId as number,
                    new Date(row.lastSavedAt as string | Date),
                ]),
        )
    }

    // 사용자의 폴더별 활성 링크 수를 folderId → count 맵으로 반환한다. (미분류는 제외)
    async countActiveByFolder(userId: number): Promise<Map<number, number>> {
        const rows = await this.db
            .select({ folderId: links.folderId, linkCount: count(links.id) })
            .from(links)
            .where(and(eq(links.userId, userId), isNull(links.deletedAt)))
            .groupBy(links.folderId)

        return new Map(
            rows
                .filter((row) => row.folderId !== null)
                .map((row) => [row.folderId as number, row.linkCount]),
        )
    }

    // 조건에 맞는 링크 수를 센다. (화면의 링크 상태별 카운트용)
    private async countLinks(...conditions: SQL[]): Promise<number> {
        const [row] = await this.db
            .select({ value: count() })
            .from(links)
            .where(and(...conditions))

        return row.value
    }

    // 링크에 연결된 폴더 참조를 조회한다. 폴더가 없으면 null.
    private async findFolderRef(folderId: number | null) {
        if (!folderId) {
            return null
        }

        const [row] = await this.db
            .select()
            .from(folders)
            .where(eq(folders.id, folderId))
            .limit(1)

        return row ? { folderId: row.id, folderName: row.name } : null
    }

    // 링크 소유권을 확인하고, 없거나 타 사용자 소유면 404로 처리한다.
    private async getOwnedLink(
        userId: number,
        linkId: number,
        options: { includeDeleted?: boolean } = {},
    ): Promise<LinkRow> {
        const conditions = [eq(links.id, linkId), eq(links.userId, userId)]

        if (!options.includeDeleted) {
            conditions.push(isNull(links.deletedAt))
        }

        const [row] = await this.db
            .select()
            .from(links)
            .where(and(...conditions))
            .limit(1)

        if (!row) {
            throw new BaseException(LINK_ERROR.NOT_FOUND)
        }

        return row
    }

    // 같은 사용자가 이미 저장한(삭제되지 않은) 동일 URL(정규화 기준)이 있으면 중복 저장을 막는다.
    private async assertNotDuplicated(userId: number, normalizedUrl: string) {
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

        if (row) {
            throw new BaseException(LINK_ERROR.ALREADY_EXISTS)
        }
    }

    private async assertOwnedFolder(userId: number, folderId: number) {
        const [row] = await this.db
            .select({ id: folders.id })
            .from(folders)
            .where(and(eq(folders.id, folderId), eq(folders.userId, userId)))
            .limit(1)

        if (!row) {
            throw new BaseException(FOLDER_ERROR.NOT_FOUND)
        }
    }
}
