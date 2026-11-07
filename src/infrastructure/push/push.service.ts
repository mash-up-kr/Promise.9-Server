import { Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { Expo } from 'expo-server-sdk'

import { ValidatedEnvironment } from '../../config/environment'

import { PushMessage, PushReceiptResult, PushSendResult } from './push.type'

export type PushClient = Pick<
    Expo,
    | 'chunkPushNotifications'
    | 'sendPushNotificationsAsync'
    | 'chunkPushNotificationReceiptIds'
    | 'getPushNotificationReceiptsAsync'
>

@Injectable()
export class PushService {
    private client?: PushClient

    constructor(
        private readonly config: ConfigService<ValidatedEnvironment, true>,
    ) {}

    async send(messages: readonly PushMessage[]): Promise<PushSendResult[]> {
        if (messages.length === 0) return []

        const results: PushSendResult[] = messages.map(({ to }) => ({
            to,
            status: 'rejected',
            error: 'InvalidPushToken',
        }))
        const validIndexes: number[] = []
        const validMessages = messages.filter((message, index) => {
            if (!Expo.isExpoPushToken(message.to)) return false

            validIndexes.push(index)
            return true
        })

        if (validMessages.length === 0) return results

        const client = this.getClient()
        const chunks = client.chunkPushNotifications(validMessages)
        let offset = 0

        for (const chunk of chunks) {
            let chunkResults: PushSendResult[]

            try {
                const tickets = await client.sendPushNotificationsAsync(chunk)

                if (tickets.length !== chunk.length) {
                    throw new Error('Unexpected Expo ticket count')
                }

                chunkResults = tickets.map((ticket, index) => {
                    const to = validMessages[offset + index].to

                    return ticket.status === 'ok' && ticket.id
                        ? { to, status: 'accepted', ticketId: ticket.id }
                        : ticket.status === 'error'
                          ? {
                                to,
                                status: 'rejected',
                                error: ticket.details?.error ?? 'ExpoError',
                            }
                          : { to, status: 'unknown', error: 'REQUEST_FAILED' }
                })
            } catch {
                // SDK 예외에 포함될 수 있는 토큰과 본문을 외부에 노출하지 않는다.
                chunkResults = chunk.map((_, index) => ({
                    to: validMessages[offset + index].to,
                    status: 'unknown',
                    error: 'REQUEST_FAILED',
                }))
            }

            for (const [index, result] of chunkResults.entries()) {
                results[validIndexes[offset + index]] = result
            }
            offset += chunk.length
        }

        return results
    }

    async getReceipts(
        ticketIds: readonly string[],
    ): Promise<Record<string, PushReceiptResult>> {
        if (ticketIds.length === 0) return {}

        const client = this.getClient()
        const results: Record<string, PushReceiptResult> = {}

        for (const chunk of client.chunkPushNotificationReceiptIds([
            ...new Set(ticketIds),
        ])) {
            try {
                const receipts =
                    await client.getPushNotificationReceiptsAsync(chunk)

                for (const id of chunk) {
                    const receipt = receipts[id]

                    results[id] = !receipt
                        ? { status: 'pending' }
                        : receipt.status === 'ok'
                          ? { status: 'ok' }
                          : {
                                status: 'error',
                                error: receipt.details?.error ?? 'ExpoError',
                            }
                }
            } catch {
                for (const id of chunk) {
                    results[id] = { status: 'unknown', error: 'REQUEST_FAILED' }
                }
            }
        }

        return results
    }

    protected createClient(): PushClient {
        return new Expo({
            accessToken: this.config.get('EXPO_ACCESS_TOKEN', { infer: true }),
        })
    }

    private getClient(): PushClient {
        this.client ??= this.createClient()

        return this.client
    }
}
