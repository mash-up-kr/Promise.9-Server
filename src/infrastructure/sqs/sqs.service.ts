import { Injectable, OnModuleDestroy } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import {
    DeleteMessageCommand,
    ReceiveMessageCommand,
    SendMessageCommand,
    SQSClient,
} from '@aws-sdk/client-sqs'

import { ValidatedEnvironment } from '../../config/environment'

@Injectable()
export class SqsService implements OnModuleDestroy {
    private readonly client: SQSClient

    constructor(config: ConfigService<ValidatedEnvironment, true>) {
        const endpoint = config.get('SQS_ENDPOINT', { infer: true })

        this.client = new SQSClient({
            region: config.get('AWS_REGION', { infer: true }),
            ...(endpoint ? { endpoint } : {}),
        })
    }

    send(command: SendMessageCommand) {
        return this.client.send(command)
    }

    receive(command: ReceiveMessageCommand, abortSignal: AbortSignal) {
        return this.client.send(command, { abortSignal })
    }

    delete(command: DeleteMessageCommand) {
        return this.client.send(command)
    }

    onModuleDestroy(): void {
        this.client.destroy()
    }
}
