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
    private readonly client: PushClient

    /** 서비스에서 재사용할 Expo SDK 클라이언트를 한 번 생성한다. */
    constructor(config: ConfigService<ValidatedEnvironment, true>) {
        this.client = new Expo({
            accessToken: config.get('EXPO_ACCESS_TOKEN', { infer: true }),
        })
    }

    /** 푸시를 Expo에 접수하고 입력 순서대로 토큰별 접수 결과를 반환한다. */
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

        const chunks = this.client.chunkPushNotifications(validMessages)
        let offset = 0

        for (const chunk of chunks) {
            let chunkResults: PushSendResult[]

            try {
                const tickets =
                    await this.client.sendPushNotificationsAsync(chunk)

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

    /** ticket별 전달 결과를 조회한다. 응답에 없는 ID는 pending으로 반환한다. */
    async getReceipts(
        ticketIds: readonly string[],
    ): Promise<Record<string, PushReceiptResult>> {
        if (ticketIds.length === 0) return {}

        const receiptIds = [...new Set(ticketIds)]
        const chunks = this.client.chunkPushNotificationReceiptIds(receiptIds)
        const results: Record<string, PushReceiptResult> = {}

        for (const chunk of chunks) {
            try {
                const receipts =
                    await this.client.getPushNotificationReceiptsAsync(chunk)

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
}
