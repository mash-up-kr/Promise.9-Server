import {
    Injectable,
    Logger,
    OnModuleDestroy,
    OnModuleInit,
} from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import {
    DeleteMessageCommand,
    Message,
    ReceiveMessageCommand,
} from '@aws-sdk/client-sqs'
import { z } from 'zod'

import {
    describeError,
    describeErrorStack,
} from '../../../common/exception/error.util'
import { ValidatedEnvironment } from '../../../config/environment'
import { SqsService } from '../../../infrastructure/sqs/sqs.service'

import { LinkAnalysisDispatcher } from './link-analysis.dispatcher'
import {
    LINK_ANALYSIS_MESSAGE_VERSION,
    LINK_ANALYSIS_TASKS,
    LinkAnalysisRetryMessage,
} from './link-analysis.type'

const linkAnalysisMessageSchema = z.object({
    version: z.literal(LINK_ANALYSIS_MESSAGE_VERSION),
    linkId: z.number().int().positive(),
    userId: z.number().int().positive(),
    url: z.url(),
    tasks: z.array(z.enum(LINK_ANALYSIS_TASKS)).min(1),
    attempt: z.number().int().positive(),
})

@Injectable()
export class LinkAnalysisQueueConsumer
    implements OnModuleInit, OnModuleDestroy
{
    private readonly logger = new Logger(LinkAnalysisQueueConsumer.name)
    private readonly queueUrl?: string
    private readonly enabled: boolean
    private readonly waitTimeSeconds: number
    private readonly visibilityTimeoutSeconds: number
    private readonly abortController = new AbortController()
    private consumerTask?: Promise<void>

    constructor(
        config: ConfigService<ValidatedEnvironment, true>,
        private readonly sqsService: SqsService,
        private readonly dispatcher: LinkAnalysisDispatcher,
    ) {
        this.queueUrl = config.get('SQS_LINK_ANALYSIS_QUEUE_URL', {
            infer: true,
        })
        this.enabled = config.get('SQS_CONSUMER_ENABLED', { infer: true })
        this.waitTimeSeconds = config.get('SQS_WAIT_TIME_SECONDS', {
            infer: true,
        })
        this.visibilityTimeoutSeconds = config.get(
            'SQS_VISIBILITY_TIMEOUT_SECONDS',
            { infer: true },
        )
    }

    onModuleInit(): void {
        if (!this.enabled) {
            this.logger.log('SQS 링크 분석 consumer가 비활성화되었습니다.')
            return
        }

        if (!this.queueUrl) {
            this.logger.warn(
                'SQS_LINK_ANALYSIS_QUEUE_URL이 없어 링크 분석 consumer를 시작하지 않습니다.',
            )
            return
        }

        this.consumerTask = this.poll()
        this.consumerTask.catch((error: unknown) => {
            this.logger.error(
                `SQS consumer가 중단되었습니다: ${describeError(error)}`,
                describeErrorStack(error),
            )
        })
    }

    async onModuleDestroy(): Promise<void> {
        this.abortController.abort()
        await this.consumerTask
    }

    private async poll(): Promise<void> {
        while (!this.abortController.signal.aborted) {
            try {
                const result = await this.sqsService.receive(
                    new ReceiveMessageCommand({
                        QueueUrl: this.queueUrl,
                        MaxNumberOfMessages: 1,
                        WaitTimeSeconds: this.waitTimeSeconds,
                        VisibilityTimeout: this.visibilityTimeoutSeconds,
                        MessageSystemAttributeNames: [
                            'ApproximateReceiveCount',
                        ],
                    }),
                    this.abortController.signal,
                )

                for (const message of result.Messages ?? []) {
                    await this.process(message)
                }
            } catch (error) {
                if (this.abortController.signal.aborted) return

                this.logger.error(
                    `SQS 메시지 수신에 실패했습니다: ${describeError(error)}`,
                    describeErrorStack(error),
                )
                await this.delay(1_000)
            }
        }
    }

    // 처리에 성공한 메시지만 삭제한다. 실패한 메시지는 visibility timeout 이후 다시
    // 전달되고, maxReceiveCount를 넘기면 DLQ로 이동한다.
    private async process(message: Message): Promise<void> {
        try {
            const retryMessage = this.parseMessage(message.Body)

            await this.dispatcher.handleRetry(retryMessage)
            await this.deleteMessage(message.ReceiptHandle)

            this.logger.log(
                `링크 분석 재시도를 처리했습니다. messageId=${message.MessageId ?? 'unknown'}, linkId=${retryMessage.linkId}, tasks=${retryMessage.tasks.join(',')}`,
            )
        } catch (error) {
            this.logger.error(
                `링크 분석 재시도 처리에 실패했습니다. messageId=${message.MessageId ?? 'unknown'}, receiveCount=${message.Attributes?.ApproximateReceiveCount ?? 'unknown'}: ${describeError(error)}`,
                describeErrorStack(error),
            )
        }
    }

    private parseMessage(body: string | undefined): LinkAnalysisRetryMessage {
        if (!body) {
            throw new Error('SQS 메시지 본문이 비어 있습니다.')
        }

        const parsed: unknown = JSON.parse(body)

        return linkAnalysisMessageSchema.parse(parsed)
    }

    private async deleteMessage(receiptHandle: string | undefined) {
        if (!receiptHandle) {
            throw new Error('SQS 메시지 ReceiptHandle이 없습니다.')
        }

        await this.sqsService.delete(
            new DeleteMessageCommand({
                QueueUrl: this.queueUrl,
                ReceiptHandle: receiptHandle,
            }),
        )
    }

    private delay(milliseconds: number): Promise<void> {
        return new Promise((resolve) => setTimeout(resolve, milliseconds))
    }
}
