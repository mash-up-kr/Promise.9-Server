import { ConfigService } from '@nestjs/config'

import { ValidatedEnvironment } from '../../../config/environment'
import { SqsService } from '../../../infrastructure/sqs/sqs.service'

import { LinkAnalysisQueuePublisher } from './link-analysis.publisher'
import { LinkOutboxRepository } from './link-outbox.repository'

describe('LinkAnalysisQueuePublisher', () => {
    it('발행 성공 후에만 repository callback이 완료되며 URL 대신 jobId를 전송한다', async () => {
        let sent = false
        const sqs = {
            send: jest.fn(() => {
                sent = true
                return Promise.resolve()
            }),
        }
        let processed!: () => void
        const done = new Promise<void>((resolve) => {
            processed = resolve
        })
        const repository = {
            publishOne: jest.fn(async (send: (id: number) => Promise<void>) => {
                await send(42)
                expect(sent).toBe(true)
                processed()
                return false
            }),
        }
        const config = {
            get: (key: string) =>
                ({
                    APP_ENV: 'development',
                    SQS_ENDPOINT: 'http://localhost:4566',
                    SQS_LINK_ANALYSIS_QUEUE_URL: 'http://localhost:4566/queue',
                })[key],
        }
        const publisher = new LinkAnalysisQueuePublisher(
            config as unknown as ConfigService<ValidatedEnvironment, true>,
            sqs as unknown as SqsService,
            repository as unknown as LinkOutboxRepository,
        )
        publisher.onModuleInit()
        await done
        await publisher.onModuleDestroy()
        expect(
            JSON.parse(
                (
                    sqs.send.mock.calls[0] as unknown as [
                        { input: { MessageBody: string } },
                    ]
                )[0].input.MessageBody,
            ),
        ).toEqual({ version: 3, jobId: 42 })
    })
    it('개발 프로세스에서 운영 큐 발행을 차단한다', () => {
        const config = {
            get: (key: string) =>
                ({
                    APP_ENV: 'development',
                    SQS_LINK_ANALYSIS_QUEUE_URL:
                        'https://sqs.ap-northeast-2.amazonaws.com/123/promise9-link-analysis',
                })[key],
        }
        const publisher = new LinkAnalysisQueuePublisher(
            config as unknown as ConfigService<ValidatedEnvironment, true>,
            {} as SqsService,
            {} as LinkOutboxRepository,
        )
        expect(() => publisher.onModuleInit()).toThrow('production')
    })
})
