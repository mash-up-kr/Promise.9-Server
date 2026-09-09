import { LinkRepository } from '../link.repository'

import { LinkAnalysisDispatcher } from './link-analysis.dispatcher'
import { LinkContentRefreshService } from './link-content-refresh.service'

describe('LinkContentRefreshService', () => {
    it('갱신 기한이 임박한 링크마다 CONTENT 작업만 재실행한다', async () => {
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
        }
        const linkAnalysisDispatcher = {
            dispatch: jest.fn(),
        }
        const service = new LinkContentRefreshService(
            linkRepository as unknown as LinkRepository,
            linkAnalysisDispatcher as unknown as LinkAnalysisDispatcher,
        )

        const targetCount = await service.refreshDueLinks(now)

        expect(
            linkRepository.findLinksDueForContentRefresh,
        ).toHaveBeenCalledWith(new Date('2026-09-11T00:00:00.000Z'), 500)
        expect(linkAnalysisDispatcher.dispatch).toHaveBeenCalledTimes(2)
        expect(linkAnalysisDispatcher.dispatch).toHaveBeenNthCalledWith(
            1,
            {
                linkId: 1,
                userId: 10,
                url: 'https://instagram.com/p/final',
            },
            ['CONTENT'],
        )
        expect(linkAnalysisDispatcher.dispatch).toHaveBeenNthCalledWith(
            2,
            {
                linkId: 2,
                userId: 20,
                url: 'https://youtube.com/watch?v=abcdefghijk',
            },
            ['CONTENT'],
        )
        expect(targetCount).toBe(2)
    })

    it('갱신 대상이 없으면 dispatcher를 호출하지 않는다', async () => {
        const linkRepository = {
            findLinksDueForContentRefresh: jest.fn().mockResolvedValue([]),
        }
        const linkAnalysisDispatcher = {
            dispatch: jest.fn(),
        }
        const service = new LinkContentRefreshService(
            linkRepository as unknown as LinkRepository,
            linkAnalysisDispatcher as unknown as LinkAnalysisDispatcher,
        )

        const targetCount = await service.refreshDueLinks()

        expect(linkAnalysisDispatcher.dispatch).not.toHaveBeenCalled()
        expect(targetCount).toBe(0)
    })
})
