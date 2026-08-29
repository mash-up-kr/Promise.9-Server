import { Injectable, Logger, NotImplementedException } from '@nestjs/common'

import { BaseException } from '../../common/exception/base.exception'
import { buildCursorPage } from '../../common/pagination/cursor'
import { FOLDER_ERROR } from '../folder/folder-error.constant'

import { LinkAnalysisService } from './analysis/link-analysis.service'
import { LinkAnalysisInput } from './analysis/link-analysis.type'
import {
    CreateLinkInput,
    ListLinksQueryInput,
    MoveLinksToFolderInput,
    UpdateLinkInput,
} from './dto/link.dto'
import { CreateLinkTagInput } from './dto/tag.dto'
import { RelatedLinkService } from './related/related-link.service'
import { SearchResultRow, SearchService } from './search/search.service'
import { toSearchCursorPayload } from './search/search.util'
import { LinkRepository, LinkUpdatePatch } from './link.repository'
import { LinkRow } from './link.schema'
import { extractDomain, normalizeUrl, pickThumbnailUrl } from './link.util'
import { LINK_ERROR } from './link-error.constant'

@Injectable()
export class LinkService {
    private readonly logger = new Logger(LinkService.name)

    constructor(
        private readonly linkRepository: LinkRepository,
        private readonly searchService: SearchService,
        private readonly linkAnalysisService: LinkAnalysisService,
        private readonly relatedLinkService: RelatedLinkService,
    ) {}

    async create(userId: number, input: CreateLinkInput) {
        if (input.folderId) {
            await this.assertOwnedFolder(userId, input.folderId)
        }

        const normalizedUrl = normalizeUrl(input.url)
        await this.assertNotDuplicated(userId, normalizedUrl)

        const row = await this.linkRepository.insert({
            userId,
            folderId: input.folderId ?? null,
            originalUrl: input.url,
            normalizedUrl,
            domain: extractDomain(input.url),
            // 링크 정보와 AI 요약은 저장 이후 비동기로 생성하므로 대기 상태로 둔다.
            aiSummaryStatus: 'PENDING',
            memo: input.memo ?? null,
            reminderAt: input.reminderAt ? new Date(input.reminderAt) : null,
        })

        this.startLinkAnalysis({
            linkId: row.id,
            userId,
            url: row.originalUrl,
        })

        return {
            linkId: row.id,
            url: row.originalUrl,
            savedAt: row.createdAt,
            reminderAt: row.reminderAt,
        }
    }

    async detail(userId: number, linkId: number) {
        const link = await this.getOwnedLink(userId, linkId)
        const [folder, tagRows] = await Promise.all([
            this.findFolderRef(link.folderId),
            this.linkRepository.findTags(userId, linkId),
        ])
        const relatedLinks = await this.findRelatedLinks(
            userId,
            link,
            tagRows.map((tag) => tag.normalizedName),
        )

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
            tags: this.toTagResponses(tagRows),
            memo: link.memo,
            reminderAt: link.reminderAt,
            relatedLinks,
        }
    }

    async update(userId: number, linkId: number, input: UpdateLinkInput) {
        await this.getOwnedLink(userId, linkId)

        const patch: LinkUpdatePatch = {
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

        if (input.reminderAt !== undefined) {
            patch.reminderAt = input.reminderAt
                ? new Date(input.reminderAt)
                : null
        }

        if (input.isFavorite !== undefined) {
            patch.isFavorite = input.isFavorite
        }

        const row = await this.linkRepository.update(userId, linkId, patch)

        return {
            linkId: row.id,
            folderId: row.folderId,
            memo: row.memo,
            reminderAt: row.reminderAt,
            isFavorite: row.isFavorite,
            updatedAt: row.updatedAt,
        }
    }

    moveToFolder(userId: number, input: MoveLinksToFolderInput) {
        return this.linkRepository.moveToFolder(
            userId,
            input.linkIds,
            input.folderId,
        )
    }

    async remove(userId: number, linkId: number) {
        await this.getOwnedLink(userId, linkId)

        // "최근 삭제된 항목"으로 이동 (30일 유예 후 영구 삭제 — 배치는 추후)
        await this.linkRepository.update(userId, linkId, {
            deletedAt: new Date(),
            updatedAt: new Date(),
        })
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
        const row = await this.linkRepository.update(userId, linkId, {
            deletedAt: null,
            folderId: null,
            updatedAt: new Date(),
        })

        return {
            linkId: row.id,
            folderId: null,
            restoredAt: row.updatedAt,
        }
    }

    async markViewed(userId: number, linkId: number) {
        const link = await this.linkRepository.markViewed(
            userId,
            linkId,
            new Date(),
        )

        if (!link) {
            throw new BaseException(LINK_ERROR.NOT_FOUND)
        }
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
        if (input.q) {
            // 검색은 점수 순 정렬이라 커서도 (점수, id) 기준이다.
            const { rows, totalCount } = await this.searchService.search(
                userId,
                input,
            )
            const { rows: pageRows, pagination } = buildCursorPage(
                rows,
                input.limit,
                ({ row, score }) =>
                    toSearchCursorPayload({ id: row.id, score }),
            )

            return {
                links: this.toListItems(pageRows),
                pagination,
                totalCount,
            }
        }

        // 일반 목록의 필터·정렬·커서 조회는 repository가 담당한다.
        const { rows, totalCount } = await this.linkRepository.list(
            userId,
            input,
        )
        const { rows: pageRows, pagination } = buildCursorPage(
            rows,
            input.limit,
            (row) => ({
                v: row.cursorValue,
                id: row.id,
            }),
        )

        return {
            links: this.toListItems(
                pageRows.map((row) => ({ row, score: null })),
            ),
            pagination,
            totalCount,
        }
    }

    private toListItems(
        results: Array<{
            row: LinkRow | SearchResultRow
            score: number | null
        }>,
    ) {
        return results.map(({ row, score }) => ({
            linkId: row.id,
            title: row.title,
            source: row.domain,
            // TODO: 태그 선정 정책에 따라 목록 카드용 대표 태그를 연결한다.
            representativeTag: null,
            thumbnailUrl: pickThumbnailUrl(row.metadata),
            savedAt: row.createdAt,
            reminderAt: row.reminderAt,
            // 점수 반올림은 커서 비교와 값을 맞추기 위해 search/search.util이 담당한다.
            score,
        }))
    }

    // 화면의 전체/미분류/즐겨찾기/최근삭제 링크 목록에 표시할 수를 한 번에 계산한다.
    async getSystemFolderCounts(userId: number) {
        const { all, uncategorized, favorite, recentlyDeleted } =
            await this.linkRepository.countSystemFolders(userId)

        return {
            all: { linkCount: all },
            uncategorized: { linkCount: uncategorized },
            favorite: { linkCount: favorite },
            recentlyDeleted: { linkCount: recentlyDeleted },
        }
    }

    // 사용자의 폴더별 마지막 활성 링크 저장 시각을 folderId → Date 맵으로 반환한다. (미분류 제외)
    async lastSavedAtByFolder(userId: number): Promise<Map<number, Date>> {
        const rows =
            await this.linkRepository.lastSavedAtGroupedByFolder(userId)

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
        const rows =
            await this.linkRepository.countActiveGroupedByFolder(userId)

        return new Map(
            rows
                .filter((row) => row.folderId !== null)
                .map((row) => [row.folderId as number, row.linkCount]),
        )
    }

    // 링크 저장 응답과 분석 작업을 분리하고, 현재 프로세스의 예상 밖 실패를 안전하게 기록한다.
    private startLinkAnalysis(input: LinkAnalysisInput): void {
        this.linkAnalysisService.analyze(input).catch((error: unknown) => {
            const errorMessage =
                error instanceof Error ? error.message : String(error)
            const errorStack = error instanceof Error ? error.stack : undefined

            this.logger.error(
                `링크 분석 작업이 중단되었습니다. linkId=${input.linkId}: ${errorMessage}`,
                errorStack,
            )
        })
    }

    // 링크에 연결된 폴더 참조를 조회한다. 폴더가 없으면 null.
    private async findFolderRef(folderId: number | null) {
        if (!folderId) {
            return null
        }

        const folder = await this.linkRepository.findFolder(folderId)

        return folder
            ? {
                  folderId: folder.id,
                  folderName: folder.name,
                  color: folder.color,
              }
            : null
    }

    // 링크에 저장된 사용자·규칙·AI 태그를 API 응답 shape으로 바꾼다.
    private toTagResponses(
        rows: Awaited<ReturnType<LinkRepository['findTags']>>,
    ) {
        return rows.map((row) => ({
            tagId: row.id,
            name: row.name,
            sourceType: row.sourceType,
            sortOrder: row.sortOrder,
        }))
    }

    // 관련 링크는 상세의 부가 결과다. 후보 조회가 실패해도 링크 본문은 반환한다.
    private async findRelatedLinks(
        userId: number,
        link: LinkRow,
        normalizedTags: string[],
    ) {
        try {
            return await this.relatedLinkService.relatedLinks(userId, {
                id: link.id,
                folderId: link.folderId,
                title: link.title,
                embedding: link.embedding,
                normalizedTags,
            })
        } catch (error) {
            const message =
                error instanceof Error ? error.message : String(error)

            this.logger.warn(
                `관련 링크 조회에 실패해 빈 목록을 반환합니다. linkId=${link.id} error=${message}`,
            )

            return []
        }
    }

    // 링크 소유권을 확인하고, 없거나 타 사용자 소유면 404로 처리한다.
    private async getOwnedLink(
        userId: number,
        linkId: number,
        options: { includeDeleted?: boolean } = {},
    ): Promise<LinkRow> {
        const row = await this.linkRepository.findOwned(userId, linkId, options)

        if (!row) {
            throw new BaseException(LINK_ERROR.NOT_FOUND)
        }

        return row
    }

    // 같은 사용자가 이미 저장한(삭제되지 않은) 동일 URL(정규화 기준)이 있으면 중복 저장을 막는다.
    private async assertNotDuplicated(userId: number, normalizedUrl: string) {
        const existing = await this.linkRepository.findActiveByNormalizedUrl(
            userId,
            normalizedUrl,
        )

        if (existing) {
            throw new BaseException(LINK_ERROR.ALREADY_EXISTS)
        }
    }

    private async assertOwnedFolder(userId: number, folderId: number) {
        const folder = await this.linkRepository.findFolderOwnedBy(
            userId,
            folderId,
        )

        if (!folder) {
            throw new BaseException(FOLDER_ERROR.NOT_FOUND)
        }
    }
}
