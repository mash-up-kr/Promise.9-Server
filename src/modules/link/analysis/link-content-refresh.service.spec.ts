import { LinkRepository } from '../link.repository'

import { LinkAnalysisDispatcher } from './link-analysis.dispatcher'
import { LinkContentRefreshService } from './link-content-refresh.service'

describe('LinkContentRefreshService', () => {
    it('갱신 기한이 임박한 링크마다 CONTENT와 EMBEDDING을 재실행한다', async () => {
        const now = new Date('2026-09-10T00:00:00.000Z')
        const targets = [
            {
                id: 1,
                userId: 10,
                originalUrl: 'https://instagram.com/p/original',
                finalUrl: 'https://instagram.com/p/final',
            },
            {
                id: 2,
                userId: 20,
                originalUrl: 'https://youtube.com/watch?v=abcdefghijk',
                finalUrl: null,
            },
        ]
        const linkRepository = {
            findLinksDueForContentRefresh: jest.fn().mockResolvedValue(targets),
            postponeContentRefresh: jest.fn().mockResolvedValue(undefined),
        }
        const linkAnalysisDispatcher = {
            dispatchAwaited: jest.fn().mockResolvedValue(undefined),
        }
        const service = new LinkContentRefreshService(
            linkRepository as unknown as LinkRepository,
            linkAnalysisDispatcher as unknown as LinkAnalysisDispatcher,
        )

        const targetCount = await service.refreshDueLinks(now)

        expect(
            linkRepository.findLinksDueForContentRefresh,
        ).toHaveBeenCalledWith(new Date('2026-09-11T00:00:00.000Z'), 500)
        expect(linkAnalysisDispatcher.dispatchAwaited).toHaveBeenCalledTimes(2)
        expect(linkAnalysisDispatcher.dispatchAwaited).toHaveBeenNthCalledWith(
            1,
            {
                linkId: 1,
                userId: 10,
                url: 'https://instagram.com/p/final',
            },
            ['CONTENT', 'EMBEDDING'],
        )
        expect(linkAnalysisDispatcher.dispatchAwaited).toHaveBeenNthCalledWith(
            2,
            {
                linkId: 2,
                userId: 20,
                url: 'https://youtube.com/watch?v=abcdefghijk',
            },
            ['CONTENT', 'EMBEDDING'],
        )
        expect(targetCount).toBe(2)
    })

    // 수집이 실패해도 같은 링크가 매 실행마다 앞줄을 차지하지 않아야 한다.
    it('재실행을 던지기 전에 다음 기한을 쿨다운만큼 미뤄둔다', async () => {
        const now = new Date('2026-09-10T00:00:00.000Z')
        const callOrder: string[] = []
        const linkRepository = {
            findLinksDueForContentRefresh: jest.fn().mockResolvedValue([
                {
                    id: 1,
                    userId: 10,
                    originalUrl: 'https://a.com',
                    finalUrl: null,
                },
                {
                    id: 2,
                    userId: 10,
                    originalUrl: 'https://b.com',
                    finalUrl: null,
                },
            ]),
            postponeContentRefresh: jest.fn().mockImplementation(() => {
                callOrder.push('postpone')
                return Promise.resolve()
            }),
        }
        const linkAnalysisDispatcher = {
            dispatchAwaited: jest.fn().mockImplementation(() => {
                callOrder.push('dispatch')
                return Promise.resolve()
            }),
        }
        const service = new LinkContentRefreshService(
            linkRepository as unknown as LinkRepository,
            linkAnalysisDispatcher as unknown as LinkAnalysisDispatcher,
        )

        await service.refreshDueLinks(now)

        expect(linkRepository.postponeContentRefresh).toHaveBeenCalledWith(
            [1, 2],
            new Date('2026-09-12T00:00:00.000Z'),
        )
        expect(callOrder).toEqual(['postpone', 'dispatch', 'dispatch'])
    })

    // 외부 스크래핑 API에 한꺼번에 몰리지 않아야 한다.
    it('동시 실행 수를 제한해 나눠 처리한다', async () => {
        const targets = Array.from({ length: 12 }, (_, index) => ({
            id: index + 1,
            userId: 10,
            originalUrl: `https://example.com/${index}`,
            finalUrl: null,
        }))
        let running = 0
        let maxRunning = 0
        const linkRepository = {
            findLinksDueForContentRefresh: jest.fn().mockResolvedValue(targets),
            postponeContentRefresh: jest.fn().mockResolvedValue(undefined),
        }
        const linkAnalysisDispatcher = {
            dispatchAwaited: jest.fn().mockImplementation(async () => {
                running += 1
                maxRunning = Math.max(maxRunning, running)
                await Promise.resolve()
                running -= 1
            }),
        }
        const service = new LinkContentRefreshService(
            linkRepository as unknown as LinkRepository,
            linkAnalysisDispatcher as unknown as LinkAnalysisDispatcher,
        )

        const targetCount = await service.refreshDueLinks()

        expect(maxRunning).toBeLessThanOrEqual(2)
        expect(targetCount).toBe(12)
    })

    it('갱신 대상이 없으면 dispatcher를 호출하지 않는다', async () => {
        const linkRepository = {
            findLinksDueForContentRefresh: jest.fn().mockResolvedValue([]),
            postponeContentRefresh: jest.fn().mockResolvedValue(undefined),
        }
        const linkAnalysisDispatcher = {
            dispatchAwaited: jest.fn(),
        }
        const service = new LinkContentRefreshService(
            linkRepository as unknown as LinkRepository,
            linkAnalysisDispatcher as unknown as LinkAnalysisDispatcher,
        )

        const targetCount = await service.refreshDueLinks()

        expect(linkAnalysisDispatcher.dispatchAwaited).not.toHaveBeenCalled()
        expect(targetCount).toBe(0)
    })
})
