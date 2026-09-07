import { setTimeout as sleep } from 'node:timers/promises'

import {
    Injectable,
    Logger,
    OnModuleDestroy,
    OnModuleInit,
} from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { SendMessageCommand } from '@aws-sdk/client-sqs'

import { ValidatedEnvironment } from '../../../config/environment'
import { SqsService } from '../../../infrastructure/sqs/sqs.service'

import { LinkOutboxRepository } from './link-outbox.repository'

@Injectable()
export class LinkAnalysisQueuePublisher
    implements OnModuleInit, OnModuleDestroy
{
    private readonly logger = new Logger(LinkAnalysisQueuePublisher.name)
    private readonly abort = new AbortController()
    private task?: Promise<void>
    constructor(
        private readonly config: ConfigService<ValidatedEnvironment, true>,
        private readonly sqs: SqsService,
        private readonly outbox: LinkOutboxRepository,
    ) {}
    onModuleInit() {
        const queue = this.config.get('SQS_LINK_ANALYSIS_QUEUE_URL', {
            infer: true,
        })
        if (!queue) {
            this.logger.warn('SQS 큐 미설정: Outbox는 DB에서 대기합니다.')
            return
        }
        if (
            this.config.get('APP_ENV', { infer: true }) === 'development' &&
            !this.config.get('SQS_ENDPOINT', { infer: true }) &&
            new URL(queue).pathname.endsWith('/promise9-link-analysis')
        )
            throw new Error(
                'development 환경에서 production 큐에 발행할 수 없습니다.',
            )
        this.task = this.poll(queue)
    }
    async onModuleDestroy() {
        this.abort.abort()
        await this.task
    }
    private async poll(queue: string) {
        while (!this.abort.signal.aborted) {
            try {
                const published = await this.outbox.publishOne(
                    async (jobId) => {
                        await this.sqs.send(
                            new SendMessageCommand({
                                QueueUrl: queue,
                                MessageBody: JSON.stringify({
                                    version: 3,
                                    jobId,
                                }),
                            }),
                            AbortSignal.any([
                                this.abort.signal,
                                AbortSignal.timeout(10_000),
                            ]),
                        )
                    },
                )
                if (published) continue
            } catch {
                if (this.abort.signal.aborted) return
                this.logger.error('Outbox 발행 실패. 미발행 상태로 유지합니다.')
            }
            await sleep(1000, undefined, { signal: this.abort.signal }).catch(
                () => undefined,
            )
        }
    }
}
