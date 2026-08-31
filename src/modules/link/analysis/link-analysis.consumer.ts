import { setTimeout as sleep } from 'node:timers/promises'

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

import {
    LINK_ANALYSIS_MESSAGE_VERSION,
    LINK_ANALYSIS_TASKS,
} from './link-analysis.constant'
import { LinkAnalysisDispatcher } from './link-analysis.dispatcher'
import { LinkAnalysisRetryMessage } from './link-analysis.type'

// 큐 URL 오류나 IAM 권한 누락처럼 계속 실패하는 상황에서 초당 한 번씩 로그를 쌓지 않도록
// 연속 실패에 백오프를 준다. 수신이 한 번 성공하면 다시 최소 간격으로 돌아간다.
const RECEIVE_RETRY_MIN_DELAY_MS = 1_000
const RECEIVE_RETRY_MAX_DELAY_MS = 30_000

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
        let consecutiveFailures = 0

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

                consecutiveFailures = 0

                for (const message of result.Messages ?? []) {
                    await this.process(message)
                }
            } catch (error) {
                if (this.abortController.signal.aborted) return

                consecutiveFailures += 1

                this.logger.error(
                    `SQS 메시지 수신에 실패했습니다. 연속 실패=${consecutiveFailures}: ${describeError(error)}`,
                    describeErrorStack(error),
                )
                await this.delay(this.resolveRetryDelay(consecutiveFailures))
            }
        }
    }

    private resolveRetryDelay(consecutiveFailures: number): number {
        const delay =
            RECEIVE_RETRY_MIN_DELAY_MS * 2 ** (consecutiveFailures - 1)

        return Math.min(delay, RECEIVE_RETRY_MAX_DELAY_MS)
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

    // 종료 신호가 오면 대기 중이라도 즉시 깨어나야 프로세스 종료가 밀리지 않는다.
    private async delay(milliseconds: number): Promise<void> {
        try {
            await sleep(milliseconds, undefined, {
                signal: this.abortController.signal,
            })
        } catch {
            // abort로 끊긴 대기는 정상 종료 경로다.
        }
    }
}
