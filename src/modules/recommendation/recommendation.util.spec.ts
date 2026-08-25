import { RecommendationAggregate } from './recommendation.type'
import { rankRecommendationCandidates } from './recommendation.util'

const NOW = new Date('2026-08-08T00:00:00.000Z')

describe('recommendation.util', () => {
    it('폴더와 태그를 구분하지 않고 링크 수가 많은 순서로 정렬한다', () => {
        const candidates: RecommendationAggregate[] = [
            {
                type: 'folder',
                key: 'folder:1',
                label: '개발',
                linkCount: 9,
                lastViewedAt: NOW,
                folderId: 1,
                color: '#000000',
            },
            {
                type: 'folder',
                key: 'folder:2',
                label: '읽을거리',
                linkCount: 1,
                lastViewedAt: null,
                folderId: 2,
                color: '#ffffff',
            },
            {
                type: 'tag',
                key: 'tag:ai',
                label: 'AI',
                linkCount: 3,
                lastViewedAt: null,
                normalizedTag: 'ai',
            },
        ]

        const result = rankRecommendationCandidates(candidates, 10)

        expect(result.map((item) => item.key)).toEqual([
            'folder:1',
            'tag:ai',
            'folder:2',
        ])
        expect(result[0]).toMatchObject({ folderId: 1 })
        expect(result[1]).toMatchObject({ normalizedTag: 'ai' })
        expect(result[1]).not.toHaveProperty('folderId')
        expect(result[0]).not.toHaveProperty('normalizedTag')
    })

    it('링크 수가 같으면 최근 조회, 타입, key 순으로 안정 정렬한 뒤 limit을 적용한다', () => {
        const candidates: RecommendationAggregate[] = [
            {
                type: 'tag',
                key: 'tag:b',
                label: 'B',
                linkCount: 1,
                lastViewedAt: new Date('2026-08-07T00:00:00.000Z'),
                normalizedTag: 'b',
            },
            {
                type: 'folder',
                key: 'folder:2',
                label: 'F2',
                linkCount: 1,
                lastViewedAt: NOW,
                folderId: 2,
                color: '#000000',
            },
            {
                type: 'folder',
                key: 'folder:1',
                label: 'F1',
                linkCount: 1,
                lastViewedAt: NOW,
                folderId: 1,
                color: '#000000',
            },
            {
                type: 'tag',
                key: 'tag:a',
                label: 'A',
                linkCount: 1,
                lastViewedAt: new Date('2026-08-07T00:00:00.000Z'),
                normalizedTag: 'a',
            },
        ]

        expect(
            rankRecommendationCandidates(candidates, 3).map(
                (candidate) => candidate.key,
            ),
        ).toEqual(['folder:1', 'folder:2', 'tag:a'])
    })
})
