import { DatabaseService } from '../../../config/database/database.service'

import { RelatedLinkRepository } from './related-link.repository'

describe('RelatedLinkRepository', () => {
    it('후보 링크의 normalized tag를 별도 조회해 linkId별로 묶는다', async () => {
        const candidateRows = [
            {
                id: 41,
                folderId: null,
                title: 'AI 에이전트 설계',
                domain: 'example.com',
                metadata: null,
                embeddingSimilarity: null,
            },
            {
                id: 42,
                folderId: null,
                title: '제주 여행',
                domain: 'example.org',
                metadata: null,
                embeddingSimilarity: null,
            },
        ]
        const tagRows = [
            { linkId: 41, name: 'ai 에이전트' },
            { linkId: 42, name: '여행' },
            { linkId: 41, name: '개발' },
        ]
        const select = jest
            .fn()
            .mockReturnValueOnce({
                from: jest.fn().mockReturnValue({
                    where: jest.fn().mockResolvedValue(candidateRows),
                }),
            })
            .mockReturnValueOnce({
                from: jest.fn().mockReturnValue({
                    where: jest.fn().mockReturnValue({
                        orderBy: jest.fn().mockResolvedValue(tagRows),
                    }),
                }),
            })
        const repository = new RelatedLinkRepository({
            db: { select },
        } as unknown as DatabaseService)

        const result = await repository.findCandidates(7, [41, 42], null)

        expect(result).toEqual([
            {
                ...candidateRows[0],
                normalizedTags: ['ai 에이전트', '개발'],
            },
            {
                ...candidateRows[1],
                normalizedTags: ['여행'],
            },
        ])
        expect(select).toHaveBeenCalledTimes(2)
    })
})
