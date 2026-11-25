import { Test } from '@nestjs/testing'

import { PushService } from '../../infrastructure/push/push.service'
import {
    PushReceiptResult,
    PushSendResult,
} from '../../infrastructure/push/push.type'
import { PushTokenRepository } from '../user/push-token/push-token.repository'

import { NotificationPushService } from './notification-push.service'

jest.mock('expo-server-sdk', () => ({ Expo: jest.fn() }))

describe('NotificationPushService', () => {
    let service: NotificationPushService
    const send = jest.fn<Promise<PushSendResult[]>, [unknown]>()
    const getReceipts = jest.fn<
        Promise<Record<string, PushReceiptResult>>,
        [unknown]
    >()
    const deleteByUserAndToken = jest.fn()

    beforeAll(async () => {
        const module = await Test.createTestingModule({
            providers: [
                NotificationPushService,
                { provide: PushService, useValue: { send, getReceipts } },
                {
                    provide: PushTokenRepository,
                    useValue: { deleteByUserAndToken },
                },
            ],
        }).compile()
        service = module.get(NotificationPushService)
    })

    beforeEach(() => jest.resetAllMocks())

    it('ticket의 DeviceNotRegistered만 원래 사용자와 해당 토큰 조건으로 삭제한다', async () => {
        const results: PushSendResult[] = [
            {
                to: 'removed-token',
                status: 'rejected',
                error: 'DeviceNotRegistered',
            },
            { to: 'large-token', status: 'rejected', error: 'MessageTooBig' },
            {
                to: 'auth-token',
                status: 'rejected',
                error: 'InvalidCredentials',
            },
            {
                to: 'invalid-token',
                status: 'rejected',
                error: 'InvalidPushToken',
            },
            { to: 'unknown-token', status: 'unknown', error: 'REQUEST_FAILED' },
            { to: 'accepted-token', status: 'accepted', ticketId: 'ticket' },
        ]
        const messages = results.map(({ to }) => ({ to, body: '리마인드' }))
        send.mockResolvedValue(results)

        expect(await service.send(7, messages)).toEqual(results)
        expect(send).toHaveBeenCalledWith(messages)
        expect(deleteByUserAndToken).toHaveBeenCalledTimes(1)
        expect(deleteByUserAndToken).toHaveBeenCalledWith(7, 'removed-token')
    })

    it('receipt의 DeviceNotRegistered는 저장된 ticket·토큰 쌍으로 삭제하고 다른 오류는 유지한다', async () => {
        const receipts: Record<string, PushReceiptResult> = {
            removed: { status: 'error', error: 'DeviceNotRegistered' },
            large: { status: 'error', error: 'MessageTooBig' },
            auth: { status: 'error', error: 'InvalidCredentials' },
            ok: { status: 'ok' },
            pending: { status: 'pending' },
            unknown: { status: 'unknown', error: 'REQUEST_FAILED' },
        }
        const tickets = [...Object.keys(receipts), 'missing'].map(
            (ticketId) => ({
                ticketId,
                token: ticketId + '-token',
            }),
        )
        getReceipts.mockResolvedValue(receipts)

        expect(await service.getReceipts(7, tickets)).toEqual(receipts)
        expect(getReceipts).toHaveBeenCalledWith(
            tickets.map(({ ticketId }) => ticketId),
        )
        expect(deleteByUserAndToken).toHaveBeenCalledTimes(1)
        expect(deleteByUserAndToken).toHaveBeenCalledWith(7, 'removed-token')
    })

    it('등록 해제 오류의 토큰이 이미 없어도 반복 정리할 수 있다', async () => {
        send.mockResolvedValue([
            {
                to: 'removed-token',
                status: 'rejected',
                error: 'DeviceNotRegistered',
            },
        ])
        for (let retry = 0; retry < 2; retry++) {
            await service.send(7, [{ to: 'removed-token' }])
        }
        expect(deleteByUserAndToken).toHaveBeenCalledTimes(2)
    })

    it('토큰 정리 DB 오류를 발송 실패로 바꾸거나 자동 재발송하지 않는다', async () => {
        send.mockResolvedValue([
            {
                to: 'removed-token',
                status: 'rejected',
                error: 'DeviceNotRegistered',
            },
        ])
        deleteByUserAndToken.mockRejectedValueOnce(new Error('cleanup failed'))
        await expect(
            service.send(7, [{ to: 'removed-token' }]),
        ).rejects.toThrow('cleanup failed')
        expect(send).toHaveBeenCalledTimes(1)
    })
})
