import { ConfigService } from '@nestjs/config'
import { Expo } from 'expo-server-sdk'

import { ValidatedEnvironment } from '../../config/environment'

import { PushClient, PushService } from './push.service'
import { PushMessage } from './push.type'

jest.mock('expo-server-sdk', () => ({
    Expo: Object.assign(jest.fn(), { isExpoPushToken: jest.fn() }),
}))

describe('PushService', () => {
    let service: PushService
    let client: jest.Mocked<PushClient>
    const first: PushMessage = { to: 'ExpoPushToken[first]', body: '리마인드' }
    const second: PushMessage = {
        to: 'ExpoPushToken[second]',
        body: '리마인드',
    }

    beforeEach(() => {
        jest.resetAllMocks()
        client = {
            chunkPushNotifications: jest.fn((messages) => [messages]),
            sendPushNotificationsAsync: jest.fn(),
            chunkPushNotificationReceiptIds: jest.fn((ids) => [ids]),
            getPushNotificationReceiptsAsync: jest.fn(),
        }
        jest.mocked(Expo).mockImplementation(() => client as unknown as Expo)
        jest.spyOn(Expo, 'isExpoPushToken').mockReturnValue(true)
        service = new PushService(
            new ConfigService<ValidatedEnvironment, true>({
                EXPO_ACCESS_TOKEN: 'expo-access-token',
            }),
        )
    })

    it('빈 입력이나 유효한 토큰이 없는 경우 SDK 클라이언트를 만들지 않는다', async () => {
        expect(await service.send([])).toEqual([])
        expect(await service.getReceipts([])).toEqual({})
        jest.spyOn(Expo, 'isExpoPushToken').mockReturnValue(false)
        expect(await service.send([{ to: 'invalid' }])).toEqual([
            { to: 'invalid', status: 'rejected', error: 'InvalidPushToken' },
        ])
        expect(Expo).not.toHaveBeenCalled()
    })

    it('잘못된 토큰을 제외하고도 원래 순서와 중복 토큰별 ticket을 유지한다', async () => {
        jest.spyOn(Expo, 'isExpoPushToken')
            .mockReturnValueOnce(true)
            .mockReturnValueOnce(false)
            .mockReturnValueOnce(true)
        client.sendPushNotificationsAsync.mockResolvedValueOnce([
            { status: 'ok', id: 'first-ticket' },
            { status: 'ok', id: 'second-ticket' },
        ])

        expect(
            await service.send([first, { to: 'invalid' }, { ...first }]),
        ).toEqual([
            { to: first.to, status: 'accepted', ticketId: 'first-ticket' },
            { to: 'invalid', status: 'rejected', error: 'InvalidPushToken' },
            { to: first.to, status: 'accepted', ticketId: 'second-ticket' },
        ])
        expect(client.sendPushNotificationsAsync).toHaveBeenCalledWith([
            first,
            first,
        ])
        expect(Expo).toHaveBeenCalledWith({ accessToken: 'expo-access-token' })
    })

    it('토큰별 거절 사유를 반환하고 공급자 메시지와 debug 정보를 노출하지 않는다', async () => {
        client.sendPushNotificationsAsync.mockResolvedValueOnce([
            {
                status: 'error',
                message: 'raw error containing token and payload',
                details: {
                    error: 'DeviceNotRegistered',
                    expoPushToken: first.to,
                },
                __debug: { sensitive: true },
            },
            { status: 'error', message: 'raw provider error' },
        ])

        expect(await service.send([first, second])).toEqual([
            { to: first.to, status: 'rejected', error: 'DeviceNotRegistered' },
            { to: second.to, status: 'rejected', error: 'ExpoError' },
        ])
    })

    it('한 묶음의 접수 여부를 알 수 없어도 다음 묶음을 처리한다', async () => {
        client.chunkPushNotifications.mockReturnValueOnce([[first], [second]])
        client.sendPushNotificationsAsync
            .mockRejectedValueOnce(
                new Error('timeout containing sensitive data'),
            )
            .mockResolvedValueOnce([{ status: 'ok', id: 'second-ticket' }])

        expect(await service.send([first, second])).toEqual([
            { to: first.to, status: 'unknown', error: 'REQUEST_FAILED' },
            { to: second.to, status: 'accepted', ticketId: 'second-ticket' },
        ])
        expect(client.sendPushNotificationsAsync).toHaveBeenCalledTimes(2)
    })

    it('ticket 개수가 다르면 토큰에 잘못 연결하지 않고 접수 여부를 미확정 처리한다', async () => {
        client.sendPushNotificationsAsync.mockResolvedValueOnce([
            { status: 'ok', id: 'only-ticket' },
        ])

        expect(await service.send([first, second])).toEqual([
            { to: first.to, status: 'unknown', error: 'REQUEST_FAILED' },
            { to: second.to, status: 'unknown', error: 'REQUEST_FAILED' },
        ])
    })

    it('receipt의 성공, 영구 오류, 아직 없는 결과를 구분하고 중복 ID를 제거한다', async () => {
        client.getPushNotificationReceiptsAsync.mockResolvedValueOnce({
            delivered: { status: 'ok', __debug: { sensitive: true } },
            unregistered: {
                status: 'error',
                message: 'sensitive message',
                details: { error: 'DeviceNotRegistered' },
            },
        })

        expect(
            await service.getReceipts([
                'delivered',
                'unregistered',
                'pending',
                'delivered',
            ]),
        ).toEqual({
            delivered: { status: 'ok' },
            unregistered: { status: 'error', error: 'DeviceNotRegistered' },
            pending: { status: 'pending' },
        })
        expect(client.chunkPushNotificationReceiptIds).toHaveBeenCalledWith([
            'delivered',
            'unregistered',
            'pending',
        ])
    })

    it('receipt 조회 실패를 pending과 구분하고 다음 묶음을 조회한다', async () => {
        client.chunkPushNotificationReceiptIds.mockReturnValueOnce([
            ['failed'],
            ['delivered'],
        ])
        client.getPushNotificationReceiptsAsync
            .mockRejectedValueOnce(new Error('provider error'))
            .mockResolvedValueOnce({ delivered: { status: 'ok' } })

        expect(await service.getReceipts(['failed', 'delivered'])).toEqual({
            failed: { status: 'unknown', error: 'REQUEST_FAILED' },
            delivered: { status: 'ok' },
        })
    })
})
