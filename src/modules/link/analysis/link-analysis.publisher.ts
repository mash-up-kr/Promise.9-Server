import { Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { SendMessageCommand } from '@aws-sdk/client-sqs'

import { ValidatedEnvironment } from '../../../config/environment'
import { SqsService } from '../../../infrastructure/sqs/sqs.service'

import { LinkAnalysisRetryMessage } from './link-analysis.type'

// SQS DelaySeconds 상한. 시도 횟수가 늘수록 지연을 두 배로 늘려 백오프를 만든다.
const MAX_DELAY_SECONDS = 900
const BASE_DELAY_SECONDS = 60

// consumer는 dispatcher를 의존하고 dispatcher는 이 publisher를 의존한다.
// 순환 참조를 만들지 않기 위해 consumer는 link-analysis.consumer.ts에 둔다.
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

    // 시도 횟수에 따라 지연을 두고 발행해, 일시적인 provider 장애가 회복될 시간을 준다.
    async publishRetry(message: LinkAnalysisRetryMessage): Promise<void> {
        if (!this.queueUrl) {
            throw new Error(
                'SQS_LINK_ANALYSIS_QUEUE_URL 환경변수가 필요합니다.',
            )
        }

        await this.sqsService.send(
            new SendMessageCommand({
                QueueUrl: this.queueUrl,
                MessageBody: JSON.stringify(message),
                DelaySeconds: this.resolveDelaySeconds(message.attempt),
            }),
        )
    }

    private resolveDelaySeconds(attempt: number): number {
        const delay = BASE_DELAY_SECONDS * 2 ** Math.max(0, attempt - 2)

        return Math.min(delay, MAX_DELAY_SECONDS)
    }
}
