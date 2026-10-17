import { ConfigService } from '@nestjs/config'
import { FirehoseClient, PutRecordBatchCommand } from '@aws-sdk/client-firehose'

import { ValidatedEnvironment } from '../../config/environment'

import { FIREHOSE_LIMITS } from './analytics.constants'
import { FirehoseTransport } from './firehose.transport'

jest.mock('@aws-sdk/client-firehose', () => {
    const actual = jest.requireActual<
        typeof import('@aws-sdk/client-firehose')
    >('@aws-sdk/client-firehose')
    return { ...actual, FirehoseClient: jest.fn() }
})

describe('FirehoseTransport', () => {
    const send = jest.fn<
        Promise<{
            RequestResponses?: { RecordId?: string; ErrorCode?: string }[]
        }>,
        [PutRecordBatchCommand, { abortSignal: AbortSignal }]
    >()
    const destroy = jest.fn()
    let transport: FirehoseTransport

    beforeEach(() => {
        jest.clearAllMocks()
        ;(FirehoseClient as unknown as jest.Mock).mockImplementation(() => ({
            send,
            destroy,
        }))
        transport = new FirehoseTransport({
            get: (key: string) =>
                ({
                    AWS_REGION: 'ap-northeast-2',
                    ANALYTICS_FIREHOSE_STREAM_NAME: 'test-events',
                })[key],
        } as unknown as ConfigService<ValidatedEnvironment, true>)
    })

    it('부분 실패와 누락된 응답만 재시도 대상으로 반환한다', async () => {
        send.mockResolvedValueOnce({
            RequestResponses: [
                { RecordId: 'ok' },
                { ErrorCode: 'InternalFailure' },
            ],
        })
        const signal = new AbortController().signal
        expect(
            await transport.sendBatch(
                [Buffer.from('a'), Buffer.from('b'), Buffer.from('c')],
                signal,
            ),
        ).toEqual([1, 2])
        expect(send.mock.calls[0][0]).toBeInstanceOf(PutRecordBatchCommand)
        expect(send.mock.calls[0][0].input.DeliveryStreamName).toBe(
            'test-events',
        )
        expect(send.mock.calls[0][1].abortSignal).toBe(signal)
    })

    it('요청 전체 실패는 호출자에게 전달해 배치를 보존하게 한다', async () => {
        send.mockRejectedValueOnce(new Error('timeout'))
        await expect(
            transport.sendBatch(
                [Buffer.from('a')],
                new AbortController().signal,
            ),
        ).rejects.toThrow('timeout')
    })

    it('레코드 수와 바이트 제한을 전송 전에 검증한다', async () => {
        const signal = new AbortController().signal
        await expect(
            transport.sendBatch(
                Array.from({ length: 501 }, () => Buffer.from('a')),
                signal,
            ),
        ).rejects.toThrow('limits')
        await expect(
            transport.sendBatch(
                [Buffer.alloc(FIREHOSE_LIMITS.maxBatchBytes)],
                signal,
            ),
        ).rejects.toThrow('limits')
        expect(send).not.toHaveBeenCalled()
    })
})
