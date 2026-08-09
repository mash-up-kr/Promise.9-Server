import { DatabaseService } from '../../config/database/database.service'

import { RecommendationRepository } from './recommendation.repository'

const queryChain = (rows: unknown[]) => {
    const chain = {
        from: jest.fn(),
        innerJoin: jest.fn(),
        where: jest.fn(),
        groupBy: jest.fn().mockResolvedValue(rows),
    }
    chain.from.mockReturnValue(chain)
    chain.innerJoin.mockReturnValue(chain)
    chain.where.mockReturnValue(chain)
    return chain
}

describe('RecommendationRepository', () => {
    it('폴더와 태그 집계 결과를 타입별 key를 가진 flat 후보로 합친다', async () => {
        const viewedAt = new Date('2026-08-08T00:00:00.000Z')
        const folderQuery = queryChain([
            {
                folderId: 3,
                label: '디자인',
                color: '#61a8ef',
                linkCount: 4,
                lastViewedAt: viewedAt,
            },
        ])
        const tagQuery = queryChain([
            {
                normalizedTag: 'ai',
                label: 'AI',
                linkCount: 2,
                lastViewedAt: null,
            },
        ])
        const db = {
            select: jest
                .fn()
                .mockReturnValueOnce(folderQuery)
                .mockReturnValueOnce(tagQuery),
        }
        const repository = new RecommendationRepository({
            db,
        } as unknown as DatabaseService)

        await expect(repository.findCandidates(7)).resolves.toEqual([
            {
                type: 'folder',
                key: 'folder:3',
                label: '디자인',
                linkCount: 4,
                lastViewedAt: viewedAt,
                folderId: 3,
                color: '#61a8ef',
            },
            {
                type: 'tag',
                key: 'tag:ai',
                label: 'AI',
                linkCount: 2,
                lastViewedAt: null,
                normalizedTag: 'ai',
            },
        ])
        expect(db.select).toHaveBeenCalledTimes(2)
    })
})
