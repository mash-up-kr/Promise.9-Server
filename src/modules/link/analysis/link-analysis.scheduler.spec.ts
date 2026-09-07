import { Logger } from '@nestjs/common'

import { LinkRepository } from '../link.repository'

import { LinkAnalysisScheduler } from './link-analysis.scheduler'

describe('LinkAnalysisScheduler', () => {
    afterEach(() => {
        jest.useRealTimers()
        jest.restoreAllMocks()
    })

    it('현재 시각에서 5분 전을 기준으로 대기 중인 링크를 정리한다', async () => {
        jest.useFakeTimers().setSystemTime(new Date('2026-09-07T12:00:00Z'))
        const repository = {
            failStalePendingAnalysis: jest.fn().mockResolvedValue(2),
        }
        const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation()
        const scheduler = new LinkAnalysisScheduler(
            repository as unknown as LinkRepository,
        )

        await scheduler.failStalePendingAnalysis()

        expect(repository.failStalePendingAnalysis).toHaveBeenCalledWith(
            new Date('2026-09-07T11:55:00Z'),
        )
        expect(warn).toHaveBeenCalledWith(expect.stringContaining('count=2'))
    })

    it('DB 장애로 실패해도 다음 실행에서 다시 정리한다', async () => {
        const repository = {
            failStalePendingAnalysis: jest
                .fn()
                .mockRejectedValueOnce(new Error('DB unavailable'))
                .mockResolvedValueOnce(0),
        }
        const error = jest.spyOn(Logger.prototype, 'error').mockImplementation()
        const scheduler = new LinkAnalysisScheduler(
            repository as unknown as LinkRepository,
        )

        await expect(
            scheduler.failStalePendingAnalysis(),
        ).resolves.toBeUndefined()
        await expect(
            scheduler.failStalePendingAnalysis(),
        ).resolves.toBeUndefined()

        expect(repository.failStalePendingAnalysis).toHaveBeenCalledTimes(2)
        expect(error).toHaveBeenCalledTimes(1)
    })
})
