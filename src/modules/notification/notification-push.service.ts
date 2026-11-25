import { Injectable } from '@nestjs/common'

import { PushService } from '../../infrastructure/push/push.service'
import {
    PushMessage,
    PushReceiptResult,
    PushSendResult,
} from '../../infrastructure/push/push.type'
import { PushTokenRepository } from '../user/push-token/push-token.repository'

/** 발송 당시 소유자와 함께 영속 저장한 ticket·토큰 쌍을 사용한다. */
export interface NotificationPushTicket {
    ticketId: string
    token: string
}

@Injectable()
export class NotificationPushService {
    constructor(
        private readonly pushService: PushService,
        private readonly pushTokenRepository: PushTokenRepository,
    ) {}

    /** Expo ticket의 영구적인 등록 해제 오류가 확인된 토큰만 정리한다. */
    async send(
        userId: number,
        messages: readonly PushMessage[],
    ): Promise<PushSendResult[]> {
        const results = await this.pushService.send(messages)

        for (const result of results) {
            if (
                result.status === 'rejected' &&
                result.error === 'DeviceNotRegistered'
            ) {
                await this.pushTokenRepository.deleteByUserAndToken(
                    userId,
                    result.to,
                )
            }
        }

        return results
    }

    /** 발송 당시의 ticket·토큰 쌍으로 조회해 다른 기기의 토큰을 잘못 삭제하지 않는다. */
    async getReceipts(
        userId: number,
        tickets: readonly NotificationPushTicket[],
    ): Promise<Record<string, PushReceiptResult>> {
        const receipts = await this.pushService.getReceipts(
            tickets.map(({ ticketId }) => ticketId),
        )

        for (const { ticketId, token } of tickets) {
            const receipt = receipts[ticketId]
            if (
                receipt?.status === 'error' &&
                receipt.error === 'DeviceNotRegistered'
            ) {
                await this.pushTokenRepository.deleteByUserAndToken(
                    userId,
                    token,
                )
            }
        }

        return receipts
    }
}
