import { RecommendationRepository } from './recommendation.repository'
import { RecommendationService } from './recommendation.service'

describe('RecommendationService', () => {
    it('인증 사용자 범위 후보를 조회하고 요청 limit만큼 반환한다', async () => {
        const repository: jest.Mocked<
            Pick<RecommendationRepository, 'findCandidates'>
        > = {
            findCandidates: jest.fn().mockResolvedValue([
                {
                    type: 'folder',
                    key: 'folder:3',
                    label: '디자인',
                    linkCount: 5,
                    lastViewedAt: null,
                    folderId: 3,
                    color: '#61a8ef',
                },
                {
                    type: 'tag',
                    key: 'tag:ai',
                    label: 'AI',
                    linkCount: 3,
                    lastViewedAt: null,
                    normalizedTag: 'ai',
                },
                {
                    type: 'tag',
                    key: 'tag:backend',
                    label: 'Backend',
                    linkCount: 2,
                    lastViewedAt: null,
                    normalizedTag: 'backend',
                },
                {
                    type: 'folder',
                    key: 'folder:4',
                    label: '읽을거리',
                    linkCount: 3,
                    lastViewedAt: null,
                    folderId: 4,
                    color: '#000000',
                },
            ]),
        }
        const service = new RecommendationService(
            repository as unknown as RecommendationRepository,
        )

        await expect(service.list(7, { limit: 1 })).resolves.toEqual({
            items: [
                {
                    key: 'folder:3',
                    type: 'folder',
                    label: '디자인',
                    linkCount: 5,
                    lastViewedAt: null,
                    folderId: 3,
                    color: '#61a8ef',
                },
            ],
        })
        expect(repository.findCandidates).toHaveBeenCalledWith(7)
    })

    it('폴더와 태그 후보를 합쳐 3개 이하면 null을 반환한다', async () => {
        const repository: jest.Mocked<
            Pick<RecommendationRepository, 'findCandidates'>
        > = {
            findCandidates: jest.fn().mockResolvedValue([
                {
                    type: 'folder',
                    key: 'folder:3',
                    label: '디자인',
                    linkCount: 5,
                    lastViewedAt: null,
                    folderId: 3,
                    color: '#61a8ef',
                },
                {
                    type: 'tag',
                    key: 'tag:ai',
                    label: 'AI',
                    linkCount: 3,
                    lastViewedAt: null,
                    normalizedTag: 'ai',
                },
                {
                    type: 'tag',
                    key: 'tag:backend',
                    label: 'Backend',
                    linkCount: 3,
                    lastViewedAt: null,
                    normalizedTag: 'backend',
                },
            ]),
        }
        const service = new RecommendationService(
            repository as unknown as RecommendationRepository,
        )

        await expect(service.list(7, { limit: 12 })).resolves.toBeNull()
    })
})
