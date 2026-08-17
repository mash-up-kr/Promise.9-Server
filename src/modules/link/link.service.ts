import { Injectable, NotImplementedException } from '@nestjs/common'

import { BaseException } from '../../common/exception/base.exception'
import { buildCursorPage } from '../../common/pagination/cursor'
import { FOLDER_ERROR } from '../folder/folder-error.constant'

import { LinkAnalysisDispatcher } from './analysis/link-analysis.dispatcher'
import {
    CreateLinkInput,
    ListLinksQueryInput,
    UpdateLinkInput,
} from './dto/link.dto'
import { CreateLinkTagInput } from './dto/tag.dto'
import { SearchService } from './search/search.service'
import { toSearchCursorPayload } from './search/search.util'
import { LinkRepository, LinkUpdatePatch } from './link.repository'
import { LinkRow } from './link.schema'
import { extractDomain, normalizeUrl, pickThumbnailUrl } from './link.util'
import { LINK_ERROR } from './link-error.constant'

@Injectable()
export class LinkService {
    constructor(
        private readonly linkRepository: LinkRepository,
        private readonly searchService: SearchService,
        private readonly linkAnalysisDispatcher: LinkAnalysisDispatcher,
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
        })

        // 정보 수집·AI 요약·태그·임베딩은 저장 응답을 막지 않도록 dispatcher에 넘긴다.
        // 임베딩은 제목·요약이 저장된 뒤 실행되므로 여기서 따로 호출하지 않는다.
        this.linkAnalysisDispatcher.dispatch({
            linkId: row.id,
            userId,
            url: row.originalUrl,
        })

        return {
            linkId: row.id,
            url: row.originalUrl,
            savedAt: row.createdAt,
        }
    }

    async detail(userId: number, linkId: number) {
        const link = await this.getOwnedLink(userId, linkId)
        const [folder, linkTags] = await Promise.all([
            this.findFolderRef(link.folderId),
            this.findTags(userId, linkId),
        ])

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
            tags: linkTags,
            memo: link.memo,
            relatedLinks: [],
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

        if (input.isFavorite !== undefined) {
            patch.isFavorite = input.isFavorite
        }

        const row = await this.linkRepository.update(userId, linkId, patch)

        // 메모가 바뀌면 임베딩 대상 텍스트가 달라지므로 임베딩만 다시 실행한다.
        // create와 같은 dispatcher를 거치므로 실패 시 재시도도 동일하게 적용된다.
        if (input.memo !== undefined) {
            this.linkAnalysisDispatcher.dispatch(
                { linkId: row.id, userId, url: row.originalUrl },
                ['EMBEDDING'],
            )
        }

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
        await this.getOwnedLink(userId, linkId)

        const now = new Date()
        await this.linkRepository.update(userId, linkId, {
            viewedAt: now,
            updatedAt: now,
        })
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
                v: this.cursorValueOf(row, input.sortBy),
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
        results: Array<{ row: LinkRow; score: number | null }>,
    ) {
        return results.map(({ row, score }) => ({
            linkId: row.id,
            title: row.title,
            source: row.domain,
            // TODO: 태그 선정 정책에 따라 목록 카드용 대표 태그를 연결한다.
            representativeTag: null,
            thumbnailUrl: pickThumbnailUrl(row.metadata),
            savedAt: row.createdAt,
            // 점수 반올림은 커서 비교와 값을 맞추기 위해 search/search.util이 담당한다.
            score,
        }))
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

    // 링크에 연결된 폴더 참조를 조회한다. 폴더가 없으면 null.
    private async findFolderRef(folderId: number | null) {
        if (!folderId) {
            return null
        }

        const folder = await this.linkRepository.findFolder(folderId)

        return folder ? { folderId: folder.id, folderName: folder.name } : null
    }

    // 링크에 저장된 사용자·규칙·AI 태그를 표시 순서와 생성 순서대로 반환한다.
    private async findTags(userId: number, linkId: number) {
        const rows = await this.linkRepository.findTags(userId, linkId)

        return rows.map((row) => ({
            tagId: row.id,
            name: row.name,
            sourceType: row.sourceType,
            sortOrder: row.sortOrder,
        }))
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
