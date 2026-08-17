import { Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { Message } from '@aws-sdk/client-sqs'

import { ValidatedEnvironment } from '../../../config/environment'
import { SqsService } from '../../../infrastructure/sqs/sqs.service'

import { LinkAnalysisQueueConsumer } from './link-analysis.consumer'
import { LinkAnalysisDispatcher } from './link-analysis.dispatcher'
import { LinkAnalysisRetryMessage } from './link-analysis.type'

const QUEUE_URL =
    'https://sqs.ap-northeast-2.amazonaws.com/123456789012/link-analysis'

const RETRY_MESSAGE: LinkAnalysisRetryMessage = {
    version: 2,
    linkId: 1,
    userId: 2,
    url: 'https://example.com/article',
    tasks: ['SUMMARY'],
    attempt: 2,
}

function createConfig(
    overrides: Partial<ValidatedEnvironment> = {},
): ConfigService<ValidatedEnvironment, true> {
    const values = {
        SQS_LINK_ANALYSIS_QUEUE_URL: QUEUE_URL,
        SQS_CONSUMER_ENABLED: false,
        SQS_WAIT_TIME_SECONDS: 20,
        SQS_VISIBILITY_TIMEOUT_SECONDS: 300,
        ...overrides,
    }

    return {
        get: jest.fn((key: keyof typeof values) => values[key]),
    } as unknown as ConfigService<ValidatedEnvironment, true>
}

describe('LinkAnalysisQueueConsumer', () => {
    let sqsService: jest.Mocked<Pick<SqsService, 'delete'>>
    let dispatcher: jest.Mocked<Pick<LinkAnalysisDispatcher, 'handleRetry'>>
    let consumer: LinkAnalysisQueueConsumer
    let loggerErrorSpy: jest.SpyInstance

    beforeEach(() => {
        sqsService = {
            delete: jest.fn().mockResolvedValue({}),
        }
        dispatcher = {
            handleRetry: jest.fn().mockResolvedValue(undefined),
        }
        loggerErrorSpy = jest
            .spyOn(Logger.prototype, 'error')
            .mockImplementation()
        consumer = new LinkAnalysisQueueConsumer(
            createConfig(),
            sqsService as unknown as SqsService,
            dispatcher as unknown as LinkAnalysisDispatcher,
        )
    })

    afterEach(() => {
        loggerErrorSpy.mockRestore()
    })

    it('유효한 메시지를 처리하고 성공한 뒤 큐에서 삭제한다', async () => {
        await processMessage(consumer, {
            MessageId: 'message-1',
            ReceiptHandle: 'receipt-1',
            Body: JSON.stringify(RETRY_MESSAGE),
        })

        expect(dispatcher.handleRetry).toHaveBeenCalledWith(RETRY_MESSAGE)
        expect(sqsService.delete.mock.calls[0][0].input).toEqual({
            QueueUrl: QUEUE_URL,
            ReceiptHandle: 'receipt-1',
        })
    })

    it('처리에 실패한 메시지는 삭제하지 않아 재전달되게 한다', async () => {
        dispatcher.handleRetry.mockRejectedValueOnce(new Error('retry failed'))

        await processMessage(consumer, {
            MessageId: 'message-1',
            ReceiptHandle: 'receipt-1',
            Body: JSON.stringify(RETRY_MESSAGE),
        })

        expect(sqsService.delete).not.toHaveBeenCalled()
    })

    it('v1 메시지처럼 스키마가 다른 메시지는 처리하거나 삭제하지 않는다', async () => {
        await processMessage(consumer, {
            MessageId: 'message-1',
            ReceiptHandle: 'receipt-1',
            Body: JSON.stringify({
                version: 1,
                linkId: 1,
                userId: 2,
                url: 'https://example.com/article',
            }),
        })

        expect(dispatcher.handleRetry).not.toHaveBeenCalled()
        expect(sqsService.delete).not.toHaveBeenCalled()
    })

    it('빈 tasks 배열은 유효하지 않은 메시지로 본다', async () => {
        await processMessage(consumer, {
            MessageId: 'message-1',
            ReceiptHandle: 'receipt-1',
            Body: JSON.stringify({ ...RETRY_MESSAGE, tasks: [] }),
        })

        expect(dispatcher.handleRetry).not.toHaveBeenCalled()
        expect(sqsService.delete).not.toHaveBeenCalled()
    })

    // 큐 URL·IAM 오류로 수신이 계속 실패할 때 로그가 초당 한 번씩 쌓이지 않게 한다.
    it('연속 수신 실패에 백오프를 적용하고 상한을 넘기지 않는다', () => {
        const delays = [1, 2, 3, 6, 20].map((failures) =>
            resolveRetryDelay(consumer, failures),
        )

        expect(delays).toEqual([1_000, 2_000, 4_000, 30_000, 30_000])
    })
})

function processMessage(
    consumer: LinkAnalysisQueueConsumer,
    message: Message,
): Promise<void> {
    return (
        consumer as unknown as {
            process(message: Message): Promise<void>
        }
    ).process(message)
}

function resolveRetryDelay(
    consumer: LinkAnalysisQueueConsumer,
    consecutiveFailures: number,
): number {
    return (
        consumer as unknown as {
            resolveRetryDelay(consecutiveFailures: number): number
        }
    ).resolveRetryDelay(consecutiveFailures)
}
