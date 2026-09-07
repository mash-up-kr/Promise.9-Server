import { Injectable, OnApplicationShutdown } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import {
    ChangeMessageVisibilityCommand,
    DeleteMessageCommand,
    ReceiveMessageCommand,
    SendMessageCommand,
    SQSClient,
} from '@aws-sdk/client-sqs'

import { ValidatedEnvironment } from '../../config/environment'

@Injectable()
export class SqsService implements OnApplicationShutdown {
    private readonly client: SQSClient

    constructor(config: ConfigService<ValidatedEnvironment, true>) {
        const endpoint = config.get('SQS_ENDPOINT', { infer: true })

        this.client = new SQSClient({
            region: config.get('AWS_REGION', { infer: true }),
            ...(endpoint ? { endpoint } : {}),
        })
    }

    send(command: SendMessageCommand, abortSignal?: AbortSignal) {
        return this.client.send(command, { abortSignal })
    }

    receive(command: ReceiveMessageCommand, abortSignal: AbortSignal) {
        return this.client.send(command, { abortSignal })
    }

    delete(command: DeleteMessageCommand) {
        return this.client.send(command, {
            abortSignal: AbortSignal.timeout(10_000),
        })
    }

    changeVisibility(command: ChangeMessageVisibilityCommand) {
        return this.client.send(command, {
            abortSignal: AbortSignal.timeout(10_000),
        })
    }

    // 워커가 결과 저장과 메시지 삭제를 마친 뒤 클라이언트를 닫는다.
    onApplicationShutdown(): void {
        this.client.destroy()
    }
}
