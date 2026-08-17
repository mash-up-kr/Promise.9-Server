import { ConfigService } from '@nestjs/config'
import { SendMessageCommand } from '@aws-sdk/client-sqs'

import { ValidatedEnvironment } from '../../../config/environment'
import { SqsService } from '../../../infrastructure/sqs/sqs.service'

import { LinkAnalysisQueuePublisher } from './link-analysis.publisher'
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

describe('LinkAnalysisQueuePublisher', () => {
    it('실패한 작업만 담은 재시도 메시지를 지연 발행한다', async () => {
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

        await publisher.publishRetry(RETRY_MESSAGE)

        expect(sentCommand?.input).toEqual({
            QueueUrl: QUEUE_URL,
            MessageBody: JSON.stringify(RETRY_MESSAGE),
            DelaySeconds: 60,
        })
    })

    it('시도 횟수가 늘면 지연을 두 배로 늘리고 상한을 넘지 않는다', async () => {
        const delays: Array<number | undefined> = []
        const sqsService = {
            send: jest.fn((command: SendMessageCommand) => {
                delays.push(command.input.DelaySeconds)
                return Promise.resolve({})
            }),
        }
        const publisher = new LinkAnalysisQueuePublisher(
            createConfig(),
            sqsService as unknown as SqsService,
        )

        for (const attempt of [2, 3, 4, 20]) {
            await publisher.publishRetry({ ...RETRY_MESSAGE, attempt })
        }

        expect(delays).toEqual([60, 120, 240, 900])
    })

    it('queue URL이 없으면 발행을 거부한다', async () => {
        const sqsService = { send: jest.fn() }
        const publisher = new LinkAnalysisQueuePublisher(
            createConfig({ SQS_LINK_ANALYSIS_QUEUE_URL: undefined }),
            sqsService as unknown as SqsService,
        )

        await expect(publisher.publishRetry(RETRY_MESSAGE)).rejects.toThrow(
            'SQS_LINK_ANALYSIS_QUEUE_URL 환경변수가 필요합니다.',
        )
        expect(sqsService.send).not.toHaveBeenCalled()
    })
})
