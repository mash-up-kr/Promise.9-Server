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
    SendMessageCommand,
} from '@aws-sdk/client-sqs'
import { z } from 'zod'

import { ValidatedEnvironment } from '../../../config/environment'
import { SqsService } from '../../../infrastructure/sqs/sqs.service'

import { LinkAnalysisService } from './link-analysis.service'
import { LinkAnalysisInput } from './link-analysis.type'

const LINK_ANALYSIS_MESSAGE_VERSION = 1 as const

const linkAnalysisMessageSchema = z.object({
    version: z.literal(LINK_ANALYSIS_MESSAGE_VERSION),
    linkId: z.number().int().positive(),
    userId: z.number().int().positive(),
    url: z.url(),
})

type LinkAnalysisMessage = z.infer<typeof linkAnalysisMessageSchema>

@Injectable()
export class LinkAnalysisQueuePublisher {
    private readonly queueUrl?: string

    constructor(
        config: ConfigService<ValidatedEnvironment, true>,
        private readonly sqsService: SqsService,
    ) {
        this.queueUrl = config.get('SQS_LINK_ANALYSIS_QUEUE_URL', {
            infer: true,
        })
    }

    async publish(input: LinkAnalysisInput): Promise<void> {
        if (!this.queueUrl) {
            throw new Error(
                'SQS_LINK_ANALYSIS_QUEUE_URL 환경변수가 필요합니다.',
            )
        }

        const message: LinkAnalysisMessage = {
            version: LINK_ANALYSIS_MESSAGE_VERSION,
            ...input,
        }

        await this.sqsService.send(
            new SendMessageCommand({
                QueueUrl: this.queueUrl,
                MessageBody: JSON.stringify(message),
            }),
        )
    }
}

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
        private readonly linkAnalysisService: LinkAnalysisService,
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
            const message =
                error instanceof Error ? error.message : String(error)
            const stack = error instanceof Error ? error.stack : undefined

            this.logger.error(
                `SQS consumer가 중단되었습니다: ${message}`,
                stack,
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

                const message =
                    error instanceof Error ? error.message : String(error)
                const stack = error instanceof Error ? error.stack : undefined

                this.logger.error(
                    `SQS 메시지 수신에 실패했습니다: ${message}`,
                    stack,
                )
                await this.delay(1_000)
            }
        }
    }

    private async process(message: Message): Promise<void> {
        try {
            const input = this.parseMessage(message.Body)

            await this.linkAnalysisService.analyze(input)
            await this.deleteMessage(message.ReceiptHandle)

            this.logger.log(
                `링크 분석 메시지를 처리했습니다. messageId=${message.MessageId ?? 'unknown'}, linkId=${input.linkId}`,
            )
        } catch (error) {
            const errorMessage =
                error instanceof Error ? error.message : String(error)
            const errorStack = error instanceof Error ? error.stack : undefined
            const receiveCount =
                message.Attributes?.ApproximateReceiveCount ?? 'unknown'

            this.logger.error(
                `링크 분석 메시지 처리에 실패했습니다. messageId=${message.MessageId ?? 'unknown'}, receiveCount=${receiveCount}: ${errorMessage}`,
                errorStack,
            )
        }
    }

    private parseMessage(body: string | undefined): LinkAnalysisInput {
        if (!body) {
            throw new Error('SQS 메시지 본문이 비어 있습니다.')
        }

        const parsed: unknown = JSON.parse(body)
        const message = linkAnalysisMessageSchema.parse(parsed)

        return {
            linkId: message.linkId,
            userId: message.userId,
            url: message.url,
        }
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
