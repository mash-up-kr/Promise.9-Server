import { Logger } from '@nestjs/common'

import { LinkContentRefreshScheduler } from './link-content-refresh.scheduler'
import { LinkContentRefreshService } from './link-content-refresh.service'

describe('LinkContentRefreshScheduler', () => {
    it('갱신 대상 건수를 기록한다', async () => {
        const contentRefreshService = {
            refreshDueLinks: jest.fn().mockResolvedValue(3),
        }
        const loggerSpy = jest
            .spyOn(Logger.prototype, 'log')
            .mockImplementation()
        const scheduler = new LinkContentRefreshScheduler(
            contentRefreshService as unknown as LinkContentRefreshService,
        )

        await scheduler.refreshDueLinks()

        expect(contentRefreshService.refreshDueLinks).toHaveBeenCalledTimes(1)
        expect(loggerSpy).toHaveBeenCalledWith(
            'CONTENT 재수집 대상을 갱신 예약했습니다. target=3',
        )

        loggerSpy.mockRestore()
    })

    it('실행 실패를 기록하고 다음 실행을 위해 예외를 삼킨다', async () => {
        const contentRefreshService = {
            refreshDueLinks: jest.fn().mockRejectedValue(new Error('DB error')),
        }
        const loggerSpy = jest
            .spyOn(Logger.prototype, 'error')
            .mockImplementation()
        const scheduler = new LinkContentRefreshScheduler(
            contentRefreshService as unknown as LinkContentRefreshService,
        )

        await expect(scheduler.refreshDueLinks()).resolves.toBeUndefined()
        expect(loggerSpy).toHaveBeenCalledWith(
            '콘텐츠 갱신 스케줄러 실행에 실패했습니다. error=DB error',
            expect.any(String),
        )

        loggerSpy.mockRestore()
    })
})
