import { FirehoseClient, PutRecordBatchCommand } from '@aws-sdk/client-firehose'

import { withAnalyticsTimeout } from './analytics-timeout'

describe('withAnalyticsTimeout', () => {
    beforeEach(() => jest.useFakeTimers())
    afterEach(() => jest.useRealTimers())

    it('실제 SDK가 자격 증명에서 멈춰도 제한 시간에 대기를 끝낸다', async () => {
        let notifyStarted!: () => void
        const credentialStarted = new Promise<void>((resolve) => {
            notifyStarted = resolve
        })
        const credentials = jest.fn(() => {
            notifyStarted()
            return new Promise<never>(() => {})
        })
        const handle = jest.fn(() =>
            Promise.reject(new Error('Network must not be used')),
        )
        const client = new FirehoseClient({
            region: 'ap-northeast-2',
            credentials,
            requestHandler: { handle },
            maxAttempts: 1,
        })
        try {
            const result = withAnalyticsTimeout(
                (signal) =>
                    client.send(
                        new PutRecordBatchCommand({
                            DeliveryStreamName: 'test-events',
                            Records: [{ Data: Buffer.from('{}') }],
                        }),
                        { abortSignal: signal },
                    ),
                5_000,
                new AbortController().signal,
            )
            const assertion = expect(result).rejects.toMatchObject({
                name: 'TimeoutError',
            })
            await credentialStarted
            expect(credentials).toHaveBeenCalled()
            await jest.advanceTimersByTimeAsync(5_000)
            await assertion
            expect(handle).not.toHaveBeenCalled()
            expect(jest.getTimerCount()).toBe(0)
        } finally {
            client.destroy()
        }
    })

    it('이미 종료된 상태에서는 전송을 시작하지 않는다', async () => {
        const shutdown = new AbortController()
        shutdown.abort()
        const operation = jest.fn(() => Promise.resolve())
        await expect(
            withAnalyticsTimeout(operation, 5_000, shutdown.signal),
        ).rejects.toMatchObject({ name: 'AbortError' })
        expect(operation).not.toHaveBeenCalled()
        expect(jest.getTimerCount()).toBe(0)
    })
})
