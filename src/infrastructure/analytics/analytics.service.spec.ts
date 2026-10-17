import { ConfigService } from '@nestjs/config'

import { ValidatedEnvironment } from '../../config/environment'

import { AnalyticsService } from './analytics.service'
import { FirehoseTransport } from './firehose.transport'

function setup(enabled = true) {
    const sendBatch = jest
        .fn<Promise<number[]>, [Buffer[], AbortSignal]>()
        .mockResolvedValue([])
    const service = new AnalyticsService(
        {
            get: (key: string) =>
                key === 'ANALYTICS_ENABLED' ? enabled : 'production',
        } as unknown as ConfigService<ValidatedEnvironment, true>,
        { sendBatch, close: jest.fn() } as unknown as FirehoseTransport,
    )
    return { service, sendBatch }
}

describe('AnalyticsService', () => {
    beforeEach(() => jest.useFakeTimers())
    afterEach(() => jest.useRealTimers())

    it('비활성화 시 전송하지 않으며 잘못된 이벤트가 비즈니스 요청을 실패시키지 않는다', async () => {
        const disabled = setup(false)
        expect(disabled.service.track({ event_name: 'test' })).toEqual({
            accepted: false,
            reason: 'disabled',
        })
        await disabled.service.flush()
        expect(disabled.sendBatch).not.toHaveBeenCalled()
        const { service } = setup()
        expect(service.track({ event_name: '' })).toEqual({
            accepted: false,
            reason: 'invalid_event',
        })
        await service.onApplicationShutdown()
    })

    it('5초 주기로 전송하고 성공한 이벤트는 다시 보내지 않는다', async () => {
        const { service, sendBatch } = setup()
        service.track({ event_name: 'test' })
        expect(sendBatch).not.toHaveBeenCalled()
        await jest.advanceTimersByTimeAsync(5_000)
        expect(sendBatch).toHaveBeenCalledTimes(1)
        await service.flush()
        expect(sendBatch).toHaveBeenCalledTimes(1)
        await service.onApplicationShutdown()
    })

    it('100개가 쌓이면 5초를 기다리지 않고 전송한다', async () => {
        const { service, sendBatch } = setup()
        for (let i = 0; i < 99; i++) service.track({ event_name: 'test' })
        expect(sendBatch).not.toHaveBeenCalled()
        service.track({ event_name: 'test' })
        expect(sendBatch).toHaveBeenCalledTimes(1)
        expect(sendBatch.mock.calls[0][0]).toHaveLength(100)
        await service.onApplicationShutdown()
    })

    it('일부 실패만 같은 payload로 재시도하고 backoff 중 새 이벤트로 재시도를 앞당기지 않는다', async () => {
        const { service, sendBatch } = setup()
        sendBatch.mockResolvedValueOnce([1])
        service.track({ event_name: 'first' })
        service.track({ event_name: 'second' })
        await service.flush()
        const failed = sendBatch.mock.calls[0][0][1]
        for (let i = 0; i < 100; i++) service.track({ event_name: 'new' })
        expect(sendBatch).toHaveBeenCalledTimes(1)
        await jest.advanceTimersByTimeAsync(5_000)
        expect(sendBatch).toHaveBeenCalledTimes(2)
        expect(sendBatch.mock.calls[1][0][0]).toEqual(failed)
        expect(sendBatch.mock.calls[1][0]).toHaveLength(101)
        await service.onApplicationShutdown()
    })

    it('전송 중 추가한 이벤트를 보존하고 중복 flush를 병렬 실행하지 않는다', async () => {
        const { service, sendBatch } = setup()
        let complete!: (failed: number[]) => void
        sendBatch.mockImplementationOnce(
            () =>
                new Promise((resolve) => {
                    complete = resolve
                }),
        )
        service.track({ event_name: 'first' })
        const firstFlush = service.flush()
        service.track({ event_name: 'second' })
        expect(service.flush()).toBe(firstFlush)
        expect(sendBatch).toHaveBeenCalledTimes(1)
        complete([])
        await firstFlush
        expect(sendBatch).toHaveBeenCalledTimes(2)
        expect(sendBatch.mock.calls[1][0]).toHaveLength(1)
        await service.onApplicationShutdown()
    })

    it('전체 실패한 배치를 보존하고 정상 종료 시 남은 이벤트를 전송한다', async () => {
        const { service, sendBatch } = setup()
        sendBatch.mockRejectedValueOnce(new Error('network'))
        service.track({ event_name: 'test' })
        await service.flush()
        await service.onApplicationShutdown()
        expect(sendBatch).toHaveBeenCalledTimes(2)
        expect(sendBatch.mock.calls[1][0]).toEqual(sendBatch.mock.calls[0][0])
        expect(service.track({ event_name: 'late' })).toEqual({
            accepted: false,
            reason: 'closing',
        })
    })

    it('취소 신호를 무시하는 전송도 5초 후 큐에 남기고 재시도한다', async () => {
        const { service, sendBatch } = setup()
        let lateSuccess!: (failed: number[]) => void
        sendBatch.mockImplementationOnce(
            () =>
                new Promise((resolve) => {
                    lateSuccess = resolve
                }),
        )
        service.track({ event_name: 'test' })
        const flush = service.flush()
        await jest.advanceTimersByTimeAsync(5_000)
        await flush
        expect(sendBatch.mock.calls[0][1].aborted).toBe(true)
        lateSuccess([])
        await jest.advanceTimersByTimeAsync(5_000)
        expect(sendBatch).toHaveBeenCalledTimes(2)
        expect(sendBatch.mock.calls[1][0]).toEqual(sendBatch.mock.calls[0][0])
        await service.onApplicationShutdown()
    })

    it('배치 전송이 계속 성공해도 종료 시 전체 대기는 15초로 제한한다', async () => {
        const { service, sendBatch } = setup()
        sendBatch.mockImplementation(
            () =>
                new Promise((resolve) => setTimeout(() => resolve([]), 4_000)),
        )
        for (let i = 0; i < 18; i++)
            service.track({
                event_name: 'test',
                properties: { data: 'x'.repeat(900_000) },
            })
        const shutdown = service.onApplicationShutdown()
        await jest.advanceTimersByTimeAsync(15_000)
        await shutdown
        expect(sendBatch).toHaveBeenCalledTimes(4)
        expect(sendBatch.mock.calls[3][1].aborted).toBe(true)
        await jest.advanceTimersByTimeAsync(60_000)
        expect(sendBatch).toHaveBeenCalledTimes(4)
    })

    it('바이트 기준으로 큐를 제한하고 기존 이벤트를 버리지 않는다', async () => {
        const { service, sendBatch } = setup()
        const input = {
            event_name: 'large',
            properties: { data: 'x'.repeat(900_000) },
        }
        let accepted = 0
        for (let i = 0; i < 19; i++)
            if (service.track(input).accepted) accepted++
        expect(accepted).toBe(18)
        await service.flush()
        expect(
            sendBatch.mock.calls.flatMap(([records]) => records),
        ).toHaveLength(18)
        expect(
            sendBatch.mock.calls.every(
                ([records]) =>
                    records.reduce((sum, data) => sum + data.length, 0) <
                    3 * 1024 * 1024,
            ),
        ).toBe(true)
        await service.onApplicationShutdown()
    })
})
