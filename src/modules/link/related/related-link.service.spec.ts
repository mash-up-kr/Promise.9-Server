import { beforeEach, describe, expect, it, jest } from 'bun:test'

import type { BunMocked } from '../../../../test/bun-test.type'

import {
    RelatedLinkCandidate,
    RelatedLinkRepository,
} from './related-link.repository'
import { RelatedLinkService, RelatedLinkSource } from './related-link.service'

type RepositoryMock = BunMocked<
    Pick<
        RelatedLinkRepository,
        | 'findFolderCandidateIds'
        | 'findExactTagCandidateIds'
        | 'findTitleCandidateIds'
        | 'findVectorCandidateIds'
        | 'findCandidates'
    >
>

const source = (
    values: Partial<RelatedLinkSource> = {},
): RelatedLinkSource => ({
    id: 10,
    folderId: 3,
    title: 'NestJS access control',
    normalizedTags: ['nestjs', 'access control'],
    embedding: [1, 0],
    ...values,
})

const candidate = (
    values: Partial<RelatedLinkCandidate> & { id: number },
): RelatedLinkCandidate => ({
    folderId: 3,
    title: 'NestJS access control',
    domain: 'example.com',
    metadata: null,
    normalizedTags: ['nestjs', 'access control'],
    embeddingSimilarity: 0.5,
    ...values,
    id: values.id,
})

describe('RelatedLinkService', () => {
    let repository: RepositoryMock
    let service: RelatedLinkService

    beforeEach(() => {
        repository = {
            findFolderCandidateIds: jest.fn(),
            findExactTagCandidateIds: jest.fn(),
            findTitleCandidateIds: jest.fn(),
            findVectorCandidateIds: jest.fn(),
            findCandidates: jest.fn(),
        }
        service = new RelatedLinkService(
            repository as unknown as RelatedLinkRepository,
        )
    })

    it('관련 링크는 신호별 후보를 10개씩 조회하고 최종 5개만 반환한다', async () => {
        const rankingSource = source()
        const ids = [1, 2, 3, 4, 5, 6]
        repository.findFolderCandidateIds.mockResolvedValue([1, 2, 3])
        repository.findExactTagCandidateIds.mockResolvedValue([2, 4, 5])
        repository.findTitleCandidateIds.mockResolvedValue([3, 5, 6])
        repository.findVectorCandidateIds.mockResolvedValue([1, 4, 6])
        repository.findCandidates.mockResolvedValue(
            ids.map((id) =>
                candidate({ id, embeddingSimilarity: (7 - id) / 10 }),
            ),
        )

        const result = await service.relatedLinks(7, rankingSource)
        const options = { limit: 10, excludeLinkId: 10 }

        expect(repository.findFolderCandidateIds).toHaveBeenCalledWith(
            7,
            3,
            options,
        )
        expect(repository.findExactTagCandidateIds).toHaveBeenCalledWith(
            7,
            ['nestjs', 'access control'],
            options,
        )
        expect(repository.findTitleCandidateIds).toHaveBeenCalledWith(
            7,
            ['nestjs', 'access', 'control'],
            options,
        )
        expect(repository.findVectorCandidateIds).toHaveBeenCalledWith(
            7,
            [1, 0],
            options,
        )
        expect(repository.findCandidates).toHaveBeenCalledWith(7, ids, [1, 0])
        expect(result).toHaveLength(5)
        expect(result.map(({ linkId }) => linkId)).toEqual([1, 2, 3, 4, 5])
    })

    it('원본 링크에 임베딩이 없으면 벡터 후보 조회를 생략한다', async () => {
        const rankingSource = source({ embedding: null })
        repository.findFolderCandidateIds.mockResolvedValue([])
        repository.findExactTagCandidateIds.mockResolvedValue([])
        repository.findTitleCandidateIds.mockResolvedValue([])
        repository.findCandidates.mockResolvedValue([])

        await expect(service.relatedLinks(7, rankingSource)).resolves.toEqual(
            [],
        )
        expect(repository.findVectorCandidateIds).not.toHaveBeenCalled()
        expect(repository.findCandidates).toHaveBeenCalledWith(7, [], null)
    })

    it('후보 조회에 포함됐어도 최종 관련도 점수가 0이면 반환하지 않는다', async () => {
        const rankingSource = source({
            folderId: null,
            title: 'AI',
            normalizedTags: [],
            embedding: null,
        })
        repository.findFolderCandidateIds.mockResolvedValue([])
        repository.findExactTagCandidateIds.mockResolvedValue([])
        repository.findTitleCandidateIds.mockResolvedValue([1])
        repository.findCandidates.mockResolvedValue([
            candidate({
                id: 1,
                folderId: null,
                title: 'Paid marketing',
                normalizedTags: [],
                embeddingSimilarity: null,
            }),
        ])

        await expect(service.relatedLinks(7, rankingSource)).resolves.toEqual(
            [],
        )
    })
})
