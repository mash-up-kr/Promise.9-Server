import { ConfigService } from '@nestjs/config'
import { Message, SendMessageCommand } from '@aws-sdk/client-sqs'

import { ValidatedEnvironment } from '../../../config/environment'
import { SqsService } from '../../../infrastructure/sqs/sqs.service'

import {
    LinkAnalysisQueueConsumer,
    LinkAnalysisQueuePublisher,
} from './link-analysis.queue'
import { LinkAnalysisService } from './link-analysis.service'

const QUEUE_URL =
    'https://sqs.ap-northeast-2.amazonaws.com/123456789012/link-analysis'

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

describe('LinkAnalysisQueuePublisher', () => {
    it('버전이 포함된 링크 분석 메시지를 발행한다', async () => {
        let sentCommand: SendMessageCommand | undefined
        const sqsService = {
            send: jest.fn((command: SendMessageCommand) => {
                sentCommand = command
                return Promise.resolve({ MessageId: 'message-1' })
            }),
        }
        const publisher = new LinkAnalysisQueuePublisher(
            createConfig(),
            sqsService as unknown as SqsService,
        )

        await publisher.publish({
            linkId: 1,
            userId: 2,
            url: 'https://example.com/article',
        })

        expect(sentCommand?.input).toEqual({
            QueueUrl: QUEUE_URL,
            MessageBody: JSON.stringify({
                version: 1,
                linkId: 1,
                userId: 2,
                url: 'https://example.com/article',
            }),
        })
    })

    it('queue URL이 없으면 발행을 거부한다', async () => {
        const sqsService = { send: jest.fn() }
        const publisher = new LinkAnalysisQueuePublisher(
            createConfig({ SQS_LINK_ANALYSIS_QUEUE_URL: undefined }),
            sqsService as unknown as SqsService,
        )

        await expect(
            publisher.publish({
                linkId: 1,
                userId: 2,
                url: 'https://example.com/article',
            }),
        ).rejects.toThrow('SQS_LINK_ANALYSIS_QUEUE_URL 환경변수가 필요합니다.')
        expect(sqsService.send).not.toHaveBeenCalled()
    })
})

describe('LinkAnalysisQueueConsumer', () => {
    let sqsService: jest.Mocked<Pick<SqsService, 'delete'>>
    let linkAnalysisService: jest.Mocked<Pick<LinkAnalysisService, 'analyze'>>
    let consumer: LinkAnalysisQueueConsumer

    beforeEach(() => {
        sqsService = {
            delete: jest.fn().mockResolvedValue({}),
        }
        linkAnalysisService = {
            analyze: jest.fn().mockResolvedValue(undefined),
        }
        consumer = new LinkAnalysisQueueConsumer(
            createConfig(),
            sqsService as unknown as SqsService,
            linkAnalysisService as unknown as LinkAnalysisService,
        )
    })

    it('유효한 메시지를 분석하고 성공한 뒤 큐에서 삭제한다', async () => {
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

        expect(linkAnalysisService.analyze).toHaveBeenCalledWith({
            linkId: 1,
            userId: 2,
            url: 'https://example.com/article',
        })
        const command = sqsService.delete.mock.calls[0][0]
        expect(command.input).toEqual({
            QueueUrl: QUEUE_URL,
            ReceiptHandle: 'receipt-1',
        })
    })

    it('분석에 실패한 메시지는 삭제하지 않아 재시도할 수 있게 한다', async () => {
        linkAnalysisService.analyze.mockRejectedValueOnce(
            new Error('analysis failed'),
        )

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

        expect(sqsService.delete).not.toHaveBeenCalled()
    })

    it('스키마가 잘못된 메시지는 분석하거나 삭제하지 않는다', async () => {
        await processMessage(consumer, {
            MessageId: 'message-1',
            ReceiptHandle: 'receipt-1',
            Body: JSON.stringify({ version: 2, linkId: 1 }),
        })

        expect(linkAnalysisService.analyze).not.toHaveBeenCalled()
        expect(sqsService.delete).not.toHaveBeenCalled()
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
