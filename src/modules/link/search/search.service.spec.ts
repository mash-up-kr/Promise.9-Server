import { buildCursorPage } from '../../../common/pagination/cursor'
import { ListLinksQueryInput } from '../dto/link.dto'
import { EmbeddingService } from '../embedding/embedding.service'

import { SearchLinkCandidate, SearchRepository } from './search.repository'
import { SearchService } from './search.service'
import { roundSearchScore, toSearchCursorPayload } from './search.util'
import { SEARCH_RANKING_WEIGHTS } from './search-ranking.constant'

type RepositoryMock = jest.Mocked<
    Pick<
        SearchRepository,
        | 'findTitleCandidateIds'
        | 'findFolderKeywordCandidateIds'
        | 'findTagKeywordCandidateIds'
        | 'findContentCandidateIds'
        | 'findVectorCandidateIds'
        | 'findCandidates'
    >
>

const candidate = (
    values: Partial<SearchLinkCandidate> & { id: number },
): SearchLinkCandidate => ({
    title: null,
    domain: null,
    originalUrl: `https://example.com/${values.id}`,
    finalUrl: null,
    aiSummary: null,
    memo: null,
    metadata: null,
    createdAt: new Date('2026-08-08T00:00:00.000Z'),
    reminderAt: null,
    description: null,
    folderName: null,
    tags: [],
    embeddingSimilarity: null,
    ...values,
    id: values.id,
})

const searchInput = (
    values: Partial<ListLinksQueryInput> = {},
): ListLinksQueryInput => ({
    q: 'NestJS 인증',
    unassigned: false,
    favorite: false,
    reminder: false,
    deleted: false,
    sortBy: 'savedAt',
    order: 'desc',
    limit: 9,
    ...values,
})

const deferred = <T>() => {
    let resolve!: (value: T | PromiseLike<T>) => void
    const promise = new Promise<T>((promiseResolve) => {
        resolve = promiseResolve
    })

    return { promise, resolve }
}

describe('SearchService', () => {
    let repository: RepositoryMock
    let embeddingService: jest.Mocked<Pick<EmbeddingService, 'embedQuery'>>
    let service: SearchService

    beforeEach(() => {
        repository = {
            findTitleCandidateIds: jest.fn(),
            findFolderKeywordCandidateIds: jest.fn(),
            findTagKeywordCandidateIds: jest.fn(),
            findContentCandidateIds: jest.fn(),
            findVectorCandidateIds: jest.fn(),
            findCandidates: jest.fn(),
        }
        embeddingService = { embedQuery: jest.fn() }
        service = new SearchService(
            embeddingService as unknown as EmbeddingService,
            repository as unknown as SearchRepository,
        )
    })

    it('신호별 후보를 30개씩 조회하고 합집합을 실제 검색 범위로 hydrate한다', async () => {
        const input = searchInput({ folderId: 3 })
        const embedding = [1, 0]
        embeddingService.embedQuery.mockResolvedValue(embedding)
        repository.findTitleCandidateIds.mockResolvedValue([1])
        repository.findFolderKeywordCandidateIds.mockResolvedValue([3])
        repository.findTagKeywordCandidateIds.mockResolvedValue([2])
        repository.findContentCandidateIds.mockResolvedValue([1])
        repository.findVectorCandidateIds.mockResolvedValue([2])
        repository.findCandidates.mockResolvedValue([
            candidate({
                id: 1,
                title: 'NestJS 인증',
                embeddingSimilarity: 0.5,
            }),
            candidate({
                id: 2,
                title: '백엔드 가이드',
                tags: ['NestJS', '인증'],
                embeddingSimilarity: 0.9,
            }),
            candidate({
                id: 3,
                title: '유틸 모음',
                folderName: 'NestJS 인증',
            }),
        ])

        const result = await service.search(7, input)
        const options = { limit: 30, scope: input }

        expect(repository.findTitleCandidateIds).toHaveBeenCalledWith(
            7,
            ['nestjs', '인증'],
            options,
        )
        expect(repository.findTagKeywordCandidateIds).toHaveBeenCalledWith(
            7,
            ['nestjs', '인증'],
            options,
        )
        expect(repository.findFolderKeywordCandidateIds).toHaveBeenCalledWith(
            7,
            ['nestjs', '인증'],
            options,
        )
        expect(repository.findContentCandidateIds).toHaveBeenCalledWith(
            7,
            ['nestjs', '인증'],
            options,
        )
        expect(repository.findVectorCandidateIds).toHaveBeenCalledWith(
            7,
            embedding,
            options,
        )
        expect(repository.findCandidates).toHaveBeenCalledWith(
            7,
            [1, 3, 2],
            embedding,
            input,
        )
        expect(result.totalCount).toBe(3)
        expect(result.rows.map(({ row }) => row.id)).toEqual(
            expect.arrayContaining([1, 2, 3]),
        )
    })

    it('운영 검색 결과 집합은 관련도 상위 30개로 제한한다', async () => {
        const input = searchInput({ q: '검색', limit: 30 })
        const ids = Array.from({ length: 40 }, (_, index) => index + 1)
        embeddingService.embedQuery.mockResolvedValue([1])
        repository.findTitleCandidateIds.mockResolvedValue(ids)
        repository.findFolderKeywordCandidateIds.mockResolvedValue([])
        repository.findTagKeywordCandidateIds.mockResolvedValue([])
        repository.findContentCandidateIds.mockResolvedValue([])
        repository.findVectorCandidateIds.mockResolvedValue([])
        repository.findCandidates.mockResolvedValue(
            ids.map((id) => candidate({ id, title: '검색' })),
        )

        const result = await service.search(7, input)

        expect(result.totalCount).toBe(30)
        expect(result.rows).toHaveLength(30)
        expect(result.rows.map(({ row }) => row.id)).toEqual(
            Array.from({ length: 30 }, (_, index) => 40 - index),
        )
    })

    it('폴더명만 검색어와 일치해도 해당 폴더의 링크를 반환한다', async () => {
        const input = searchInput({ q: '유틸리티' })
        embeddingService.embedQuery.mockResolvedValue([1])
        repository.findTitleCandidateIds.mockResolvedValue([])
        repository.findFolderKeywordCandidateIds.mockResolvedValue([11])
        repository.findTagKeywordCandidateIds.mockResolvedValue([])
        repository.findContentCandidateIds.mockResolvedValue([])
        repository.findVectorCandidateIds.mockResolvedValue([])
        repository.findCandidates.mockResolvedValue([
            candidate({ id: 11, folderName: '개발 유틸리티' }),
        ])

        const result = await service.search(7, input)

        expect(repository.findCandidates).toHaveBeenCalledWith(
            7,
            [11],
            [1],
            input,
        )
        expect(result.rows).toHaveLength(1)
        expect(result.rows[0]).toMatchObject({ row: { id: 11 } })
        expect(result.rows[0].score).toBe(
            roundSearchScore(
                SEARCH_RANKING_WEIGHTS.folderKeyword /
                    (1 - SEARCH_RANKING_WEIGHTS.embedding),
            ),
        )
    })

    it('후보 조회와 점수 계산에 동일한 상위 12개 검색 토큰을 사용한다', async () => {
        const queryTokens = Array.from(
            { length: 13 },
            (_, index) => `token${index + 1}`,
        )
        const input = searchInput({ q: queryTokens.join(' ') })
        const rankingTokens = queryTokens.slice(0, 12)
        embeddingService.embedQuery.mockResolvedValue([1])
        repository.findTitleCandidateIds.mockResolvedValue([1])
        repository.findFolderKeywordCandidateIds.mockResolvedValue([])
        repository.findTagKeywordCandidateIds.mockResolvedValue([])
        repository.findContentCandidateIds.mockResolvedValue([])
        repository.findVectorCandidateIds.mockResolvedValue([])
        repository.findCandidates.mockResolvedValue([
            candidate({ id: 1, title: rankingTokens.join(' ') }),
        ])

        const result = await service.search(7, input)

        expect(repository.findTitleCandidateIds).toHaveBeenCalledWith(
            7,
            rankingTokens,
            { limit: 30, scope: input },
        )
        expect(result.rows).toHaveLength(1)
        expect(result.rows[0].score).toBe(
            roundSearchScore(
                SEARCH_RANKING_WEIGHTS.titleKeyword /
                    (1 - SEARCH_RANKING_WEIGHTS.embedding),
            ),
        )
    })

    it('반올림 후 동점인 후보를 id로 재정렬해 다음 cursor 페이지까지 누락 없이 반환한다', async () => {
        const input = searchInput({ q: '검색', limit: 1 })
        embeddingService.embedQuery.mockResolvedValue([1])
        repository.findTitleCandidateIds.mockResolvedValue([])
        repository.findFolderKeywordCandidateIds.mockResolvedValue([])
        repository.findTagKeywordCandidateIds.mockResolvedValue([])
        repository.findContentCandidateIds.mockResolvedValue([])
        repository.findVectorCandidateIds.mockResolvedValue([1, 2])
        repository.findCandidates.mockResolvedValue([
            candidate({ id: 1, embeddingSimilarity: 0.500014 }),
            candidate({ id: 2, embeddingSimilarity: 0.500013 }),
        ])

        const firstResult = await service.search(7, input)
        const firstPage = buildCursorPage(
            firstResult.rows,
            input.limit,
            ({ row, score }) => toSearchCursorPayload({ id: row.id, score }),
        )

        expect(firstPage.rows.map(({ row }) => row.id)).toEqual([2])
        expect(firstPage.pagination.nextCursor).not.toBeNull()

        const secondResult = await service.search(7, {
            ...input,
            cursor: firstPage.pagination.nextCursor!,
        })

        expect(secondResult.rows.map(({ row }) => row.id)).toEqual([1])
    })

    it('query embedding을 기다리는 동안 lexical 후보를 조회하고 완료 즉시 vector 조회를 시작한다', async () => {
        const input = searchInput({ q: 'NestJS' })
        const embedding = deferred<number[]>()
        const lexical = deferred<number[]>()
        embeddingService.embedQuery.mockReturnValue(embedding.promise)
        repository.findTitleCandidateIds.mockReturnValue(lexical.promise)
        repository.findFolderKeywordCandidateIds.mockReturnValue(
            lexical.promise,
        )
        repository.findTagKeywordCandidateIds.mockReturnValue(lexical.promise)
        repository.findContentCandidateIds.mockReturnValue(lexical.promise)
        repository.findVectorCandidateIds.mockResolvedValue([])
        repository.findCandidates.mockResolvedValue([])

        const resultPromise = service.search(7, input)

        expect(repository.findTitleCandidateIds).toHaveBeenCalledTimes(1)
        expect(repository.findFolderKeywordCandidateIds).toHaveBeenCalledTimes(
            1,
        )
        expect(repository.findTagKeywordCandidateIds).toHaveBeenCalledTimes(1)
        expect(repository.findContentCandidateIds).toHaveBeenCalledTimes(1)
        expect(repository.findVectorCandidateIds).not.toHaveBeenCalled()

        embedding.resolve([1, 0])
        await new Promise<void>((resolve) => setImmediate(resolve))

        expect(repository.findVectorCandidateIds).toHaveBeenCalledWith(
            7,
            [1, 0],
            { limit: 30, scope: input },
        )

        lexical.resolve([])
        await expect(resultPromise).resolves.toMatchObject({ totalCount: 0 })
    })

    it('쿼리 임베딩 실패 시 벡터 후보 없이 키워드 검색을 계속한다', async () => {
        const input = searchInput({ q: 'NestJS' })
        embeddingService.embedQuery.mockRejectedValue(new Error('API down'))
        repository.findTitleCandidateIds.mockResolvedValue([1])
        repository.findFolderKeywordCandidateIds.mockResolvedValue([])
        repository.findTagKeywordCandidateIds.mockResolvedValue([])
        repository.findContentCandidateIds.mockResolvedValue([])
        repository.findCandidates.mockResolvedValue([
            candidate({ id: 1, title: 'NestJS' }),
        ])

        await expect(service.search(7, input)).resolves.toMatchObject({
            totalCount: 1,
        })
        expect(repository.findVectorCandidateIds).not.toHaveBeenCalled()
        expect(repository.findCandidates).toHaveBeenCalledWith(
            7,
            [1],
            null,
            input,
        )
    })
})
