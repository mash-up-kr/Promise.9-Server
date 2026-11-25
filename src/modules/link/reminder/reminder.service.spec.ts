import { Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { BulkEmailEntryResult } from '@aws-sdk/client-sesv2'

import { UrlSecurityService } from '../../../common/security/url-security/url-security.service'
import { EmailService } from '../../../infrastructure/email/email.service'
import { SendBulkEmailInput } from '../../../infrastructure/email/email.type'
import { PushService } from '../../../infrastructure/push/push.service'
import {
    PushMessage,
    PushReceiptResult,
    PushSendResult,
} from '../../../infrastructure/push/push.type'

import { ReminderRepository } from './reminder.repository'
import { ReminderService } from './reminder.service'
import { PushReceiptTarget, ReminderTarget } from './reminder.type'

// 실제 SDK는 ESM이라 jest에서 불러오지 않는다.
jest.mock('expo-server-sdk', () => ({ Expo: jest.fn() }))

const now = new Date('2026-11-26T03:15:00.000Z')
const firstAttemptAt = new Date('2026-11-26T03:00:30.000Z')
const expiredAttemptAt = new Date('2026-11-26T02:15:00.000Z')

const createTarget = (
    values: Partial<ReminderTarget> = {},
): ReminderTarget => ({
    linkId: 1,
    userId: 10,
    occurrenceId: 'occurrence-1',
    reminderAt: new Date('2026-11-26T03:00:00.000Z'),
    recipientEmail: 'user@example.com',
    title: '읽어볼 링크',
    originalUrl: 'https://example.com/original',
    finalUrl: 'https://example.com/final',
    createdAt: new Date('2026-06-19T00:00:00.000Z'),
    memo: 'UT 준비할 때 참고하기',
    folderName: '디자인',
    folderColor: '#d5d76a',
    emailHistory: null,
    pushTokens: [{ id: 100, token: 'ExponentPushToken[first]' }],
    pushHistories: [],
    ...values,
})

const failedHistory = (
    id: number,
    values: { errorCode?: string | null; createdAt?: Date } = {},
) => ({
    id,
    status: 'FAILED' as const,
    errorCode: null,
    createdAt: firstAttemptAt,
    ...values,
})

const setup = (
    targets: ReminderTarget[],
    {
        emailResults,
        pushResults,
        disabled = {},
    }: {
        emailResults?: (input: SendBulkEmailInput) => BulkEmailEntryResult[]
        pushResults?: (messages: readonly PushMessage[]) => PushSendResult[]
        // 채널별로 수신을 끈 사용자 ID
        disabled?: { email?: number[]; push?: number[] }
    } = {},
) => {
    let historyId = 1000
    const repository = {
        assignOccurrences: jest.fn().mockResolvedValue(undefined),
        findTargets: jest.fn().mockResolvedValue(targets),
        // 기본값은 조회 때와 같은 소유자다.
        findPushTokenOwners: jest.fn((tokenIds: number[]) =>
            Promise.resolve(
                targets.flatMap((target) =>
                    target.pushTokens
                        .filter((token) => tokenIds.includes(token.id))
                        .map((token) => ({
                            id: token.id,
                            userId: target.userId,
                        })),
                ),
            ),
        ),
        findDisabledUserIds: jest.fn(
            (userIds: number[], channel: 'email' | 'push') =>
                Promise.resolve(
                    (disabled[channel] ?? []).filter((id) =>
                        userIds.includes(id),
                    ),
                ),
        ),
        insertEmailHistory: jest.fn(() => Promise.resolve(++historyId)),
        insertPushHistory: jest.fn(() => Promise.resolve(++historyId)),
        retryEmailHistory: jest.fn().mockResolvedValue(true),
        retryPushHistory: jest.fn().mockResolvedValue(true),
        recordEmail: jest.fn().mockResolvedValue(undefined),
        recordPush: jest.fn().mockResolvedValue(undefined),
        deletePushToken: jest.fn().mockResolvedValue(undefined),
        markSent: jest.fn().mockResolvedValue(true),
        finishExpired: jest.fn().mockResolvedValue(0),
        findReceiptTargets: jest.fn().mockResolvedValue([]),
    }
    const sendBulk = jest.fn((input: SendBulkEmailInput) =>
        Promise.resolve(
            emailResults?.(input) ??
                input.entries.map((_, index) => ({
                    Status: 'SUCCESS' as const,
                    MessageId: `message-${index}`,
                })),
        ),
    )
    const pushService = {
        send: jest.fn((messages: readonly PushMessage[]) =>
            Promise.resolve(
                pushResults?.(messages) ??
                    messages.map((message, index) => ({
                        to: message.to,
                        status: 'accepted' as const,
                        ticketId: `ticket-${index}`,
                    })),
            ),
        ),
        getReceipts: jest.fn(),
    }
    const service = new ReminderService(
        repository as unknown as ReminderRepository,
        { sendBulk } as unknown as EmailService,
        pushService as unknown as PushService,
        new UrlSecurityService(),
        new ConfigService(),
    )

    return { service, repository, sendBulk, pushService }
}

describe('ReminderService', () => {
    let loggerErrorSpy: jest.SpyInstance

    beforeEach(() => {
        loggerErrorSpy = jest
            .spyOn(Logger.prototype, 'error')
            .mockImplementation()
    })

    afterEach(() => loggerErrorSpy.mockRestore())

    it('발송 시각이 된 리마인드를 이메일과 등록된 모든 기기로 보내고 일정을 마친다', async () => {
        const target = createTarget({
            pushTokens: [
                { id: 100, token: 'ExponentPushToken[first]' },
                { id: 101, token: 'ExponentPushToken[second]' },
            ],
        })
        const { service, repository, sendBulk, pushService } = setup([target])
        jest.useFakeTimers({
            now: new Date('2026-11-26T03:16:00.000Z'),
            doNotFake: ['nextTick', 'setImmediate', 'queueMicrotask'],
        })

        const result = await service
            .sendReminders(now)
            .finally(() => jest.useRealTimers())

        expect(repository.assignOccurrences).toHaveBeenCalledWith(now)
        expect(repository.findTargets).toHaveBeenCalledWith(
            now,
            expiredAttemptAt,
        )
        expect(sendBulk.mock.calls[0]?.[0].entries).toEqual([
            expect.objectContaining({ to: 'user@example.com' }),
        ])
        expect(sendBulk.mock.calls[0]?.[0].subject).toBe(
            '저장해둔 링크 지금 볼까요?',
        )
        expect(pushService.send).toHaveBeenCalledWith([
            expect.objectContaining({
                to: 'ExponentPushToken[first]',
                body: '읽어볼 링크',
                data: { type: 'LINK_REMINDER', linkId: 1 },
            }),
            expect.objectContaining({ to: 'ExponentPushToken[second]' }),
        ])
        expect(repository.insertPushHistory).toHaveBeenCalledWith(
            target,
            100,
            now,
        )
        expect(repository.insertPushHistory).toHaveBeenCalledWith(
            target,
            101,
            now,
        )
        expect(repository.recordEmail).toHaveBeenCalledWith(
            1001,
            'message-0',
            now,
        )
        expect(repository.recordPush).toHaveBeenCalledWith(
            1002,
            { status: 'ACCEPTED', ticketId: 'ticket-0' },
            now,
        )
        expect(repository.markSent).toHaveBeenCalledTimes(1)
        expect(repository.markSent).toHaveBeenCalledWith(
            1,
            'occurrence-1',
            expect.any(Date),
        )
        // 배치 중 사용자가 바꾼 더 최근 수정 시각을 되돌리지 않도록 해제하는 시점의 시각을 쓴다.
        const [, , finishedAt] = repository.markSent.mock.calls[0] as [
            number,
            string,
            Date,
        ]
        expect(finishedAt.getTime()).toBeGreaterThan(now.getTime())
        expect(repository.finishExpired).toHaveBeenCalledWith(
            expiredAttemptAt,
            expect.any(Date),
        )
        expect(result).toEqual({
            targetCount: 1,
            finishedCount: 1,
            skippedCount: 0,
            email: { sent: 1, failed: 0 },
            push: { sent: 2, failed: 0 },
        })
    })

    it('다른 실행이 먼저 선점한 채널·기기는 보내지 않는다', async () => {
        const target = createTarget({
            pushTokens: [
                { id: 100, token: 'ExponentPushToken[first]' },
                { id: 101, token: 'ExponentPushToken[second]' },
            ],
        })
        const { service, repository, sendBulk, pushService } = setup([target])
        repository.insertEmailHistory.mockResolvedValueOnce(undefined as never)
        repository.insertPushHistory.mockResolvedValueOnce(undefined as never)

        await service.sendReminders(now)

        expect(sendBulk).not.toHaveBeenCalled()
        expect(pushService.send).toHaveBeenCalledWith([
            expect.objectContaining({ to: 'ExponentPushToken[second]' }),
        ])
    })

    it('이메일이 실패해도 푸시를 보내고, 한 채널로 보냈으면 일정을 마친다', async () => {
        const { service, repository, pushService } = setup([createTarget()], {
            emailResults: () => [{ Status: 'TRANSIENT_FAILURE' }],
        })

        const result = await service.sendReminders(now)

        expect(repository.recordEmail).toHaveBeenCalledWith(1001, null, now)
        expect(pushService.send).toHaveBeenCalledTimes(1)
        expect(repository.markSent).toHaveBeenCalledTimes(1)
        expect(result.email).toEqual({ sent: 0, failed: 1 })
        expect(loggerErrorSpy).toHaveBeenCalledWith(
            expect.stringContaining('linkId=1'),
        )
    })

    it('한 채널의 발송 요청이 예외로 끝나도 다른 채널은 보낸다', async () => {
        const { service, repository, sendBulk, pushService } = setup([
            createTarget(),
        ])
        sendBulk.mockRejectedValueOnce(new Error('SES down'))

        await service.sendReminders(now)
        expect(pushService.send).toHaveBeenCalledTimes(1)
        expect(repository.markSent).toHaveBeenCalledTimes(1)

        pushService.send.mockRejectedValueOnce(new Error('Expo down'))
        repository.markSent.mockClear()
        await service.sendReminders(now)
        expect(sendBulk).toHaveBeenCalledTimes(2)
        expect(repository.markSent).toHaveBeenCalledTimes(1)
    })

    it('모든 채널이 실패하면 일정을 남겨 다음 실행에서 다시 보낸다', async () => {
        const { service, repository } = setup([createTarget()], {
            emailResults: () => [{ Status: 'FAILED' }],
            pushResults: (messages) =>
                messages.map(({ to }) => ({
                    to,
                    status: 'rejected',
                    error: 'MessageRateExceeded',
                })),
        })

        const result = await service.sendReminders(now)

        expect(repository.recordPush).toHaveBeenCalledWith(
            1002,
            { status: 'FAILED', errorCode: 'MessageRateExceeded' },
            now,
        )
        expect(repository.markSent).not.toHaveBeenCalled()
        expect(result.finishedCount).toBe(0)
    })

    it('일정을 마친 뒤에는 기한 안의 실패한 채널만 다시 보내고 보낸 채널은 다시 보내지 않는다', async () => {
        const target = createTarget({
            reminderAt: null,
            emailHistory: failedHistory(7),
            pushHistories: [
                {
                    id: 8,
                    pushTokenId: 100,
                    status: 'ACCEPTED',
                    errorCode: null,
                    createdAt: firstAttemptAt,
                },
            ],
        })
        const { service, repository, sendBulk, pushService } = setup([target])

        await service.sendReminders(now)

        expect(repository.retryEmailHistory).toHaveBeenCalledWith(7, now)
        expect(sendBulk).toHaveBeenCalledTimes(1)
        // 재시도 메일은 마친 일정 대신 첫 시도 시각을 보여 준다.
        expect(
            sendBulk.mock.calls[0]?.[0].entries[0]?.templateData.reminderDate,
        ).toBe('2026년 11월 26일 오후 12:00')
        expect(repository.recordEmail).toHaveBeenCalledWith(7, 'message-0', now)
        expect(repository.insertPushHistory).not.toHaveBeenCalled()
        expect(pushService.send).not.toHaveBeenCalled()
        expect(repository.markSent).not.toHaveBeenCalled()
    })

    it('재시도는 기한·재시도할 오류·선점·지금 수신 설정을 모두 만족할 때만 한다', async () => {
        const pushHistory = (
            id: number,
            pushTokenId: number,
            errorCode: string,
        ) => ({
            ...failedHistory(id, { errorCode }),
            pushTokenId,
        })
        const targets = [
            createTarget({
                linkId: 1,
                reminderAt: null,
                emailHistory: failedHistory(1, {
                    createdAt: expiredAttemptAt,
                }),
                pushTokens: [
                    { id: 100, token: 'ExponentPushToken[rate]' },
                    { id: 101, token: 'ExponentPushToken[gone]' },
                    { id: 102, token: 'ExponentPushToken[taken]' },
                ],
                pushHistories: [
                    pushHistory(2, 100, 'MessageRateExceeded'),
                    pushHistory(3, 101, 'DeviceNotRegistered'),
                    pushHistory(4, 102, 'MessageRateExceeded'),
                ],
            }),
            createTarget({
                linkId: 2,
                userId: 20,
                reminderAt: null,
                emailHistory: failedHistory(5),
                pushTokens: [],
            }),
        ]
        const { service, repository, sendBulk, pushService } = setup(targets, {
            disabled: { email: [20] },
        })
        repository.retryPushHistory.mockImplementation((id: number) =>
            Promise.resolve(id !== 4),
        )

        await service.sendReminders(now)

        expect(repository.retryEmailHistory).not.toHaveBeenCalled()
        expect(sendBulk).not.toHaveBeenCalled()
        expect(repository.retryPushHistory).toHaveBeenCalledTimes(2)
        expect(pushService.send).toHaveBeenCalledWith([
            expect.objectContaining({ to: 'ExponentPushToken[rate]' }),
        ])
    })

    it.each([
        ['이메일·푸시 수신을 모두 껐으면', {}, { email: [10], push: [10] }],
        [
            '이메일을 끄고 푸시를 받을 기기가 없으면',
            { pushTokens: [] },
            { email: [10] },
        ],
    ])('%s 보내지 않고 일정을 마친다', async (_, values, disabled) => {
        const { service, repository, sendBulk, pushService } = setup(
            [createTarget(values)],
            { disabled },
        )

        const result = await service.sendReminders(now)

        expect(repository.insertEmailHistory).not.toHaveBeenCalled()
        expect(repository.insertPushHistory).not.toHaveBeenCalled()
        expect(sendBulk).not.toHaveBeenCalled()
        expect(pushService.send).not.toHaveBeenCalled()
        expect(repository.markSent).toHaveBeenCalledWith(
            1,
            'occurrence-1',
            expect.any(Date),
        )
        expect(result).toMatchObject({ finishedCount: 1, skippedCount: 1 })
    })

    it('건너뛰려던 일정이 그사이 바뀌어 해제하지 못하면 건너뜀으로 세지 않는다', async () => {
        const { service, repository } = setup([createTarget()], {
            disabled: { email: [10], push: [10] },
        })
        repository.markSent.mockResolvedValue(false)

        const result = await service.sendReminders(now)

        expect(result).toMatchObject({ finishedCount: 0, skippedCount: 0 })
    })

    it('50건 묶음마다 보내기 직전에 수신 설정을 다시 읽어, 대상 조회 뒤 끈 채널로는 보내지 않는다', async () => {
        const targets = Array.from({ length: 51 }, (_, index) =>
            createTarget({
                linkId: index + 1,
                userId: index + 1,
                occurrenceId: `occurrence-${index + 1}`,
                pushTokens: [
                    {
                        id: 100 + index,
                        token: `ExponentPushToken[${index}]`,
                    },
                ],
            }),
        )
        const { service, repository, sendBulk, pushService } = setup(targets, {
            disabled: { email: [51], push: [2] },
        })

        const result = await service.sendReminders(now)

        expect(repository.findDisabledUserIds.mock.calls).toEqual([
            [targets.slice(0, 50).map((target) => target.userId), 'email'],
            [targets.slice(0, 50).map((target) => target.userId), 'push'],
            [[51], 'email'],
            [[51], 'push'],
        ])
        expect(
            sendBulk.mock.calls.map(([input]) => input.entries.length),
        ).toEqual([50])
        expect(
            pushService.send.mock.calls.map(([messages]) => messages.length),
        ).toEqual([49, 1])
        expect(result).toMatchObject({
            finishedCount: 51,
            skippedCount: 0,
            email: { sent: 50, failed: 0 },
            push: { sent: 50, failed: 0 },
        })
    })

    it('이메일 수신을 꺼도 푸시를 받을 기기가 있으면 푸시만 보낸다', async () => {
        const { service, repository, sendBulk, pushService } = setup(
            [createTarget()],
            { disabled: { email: [10] } },
        )

        await service.sendReminders(now)

        expect(sendBulk).not.toHaveBeenCalled()
        expect(pushService.send).toHaveBeenCalledTimes(1)
        expect(repository.markSent).toHaveBeenCalledTimes(1)
    })

    it('보내기 직전에 토큰이 지워졌거나 다른 계정으로 옮겨갔으면 보내지 않고 다시 보내지 않게 끝낸다', async () => {
        const { service, repository, pushService } = setup(
            [
                createTarget({
                    pushTokens: [
                        { id: 100, token: 'ExponentPushToken[kept]' },
                        { id: 101, token: 'ExponentPushToken[moved]' },
                        { id: 102, token: 'ExponentPushToken[deleted]' },
                    ],
                }),
            ],
            { disabled: { email: [10] } },
        )
        repository.findPushTokenOwners.mockResolvedValue([
            { id: 100, userId: 10 },
            { id: 101, userId: 99 },
        ])

        const result = await service.sendReminders(now)

        expect(repository.findPushTokenOwners).toHaveBeenCalledWith([
            100, 101, 102,
        ])
        expect(pushService.send).toHaveBeenCalledWith([
            expect.objectContaining({ to: 'ExponentPushToken[kept]' }),
        ])
        expect(repository.recordPush).toHaveBeenCalledWith(
            1002,
            { status: 'FAILED', errorCode: 'TOKEN_NOT_OWNED' },
            now,
        )
        expect(repository.recordPush).toHaveBeenCalledWith(
            1003,
            { status: 'FAILED', errorCode: 'TOKEN_NOT_OWNED' },
            now,
        )
        expect(result.push).toEqual({ sent: 1, failed: 2 })
    })

    it('기기 등록 해제 응답을 받은 토큰만 지우고 접수 여부를 모르는 요청은 다시 보내지 않게 기록한다', async () => {
        const { service, repository } = setup(
            [
                createTarget({
                    pushTokens: [
                        { id: 100, token: 'ExponentPushToken[gone]' },
                        { id: 101, token: 'ExponentPushToken[credentials]' },
                        { id: 102, token: 'ExponentPushToken[timeout]' },
                    ],
                }),
            ],
            {
                disabled: { email: [10] },
                pushResults: (messages) => [
                    {
                        to: messages[0].to,
                        status: 'rejected',
                        error: 'DeviceNotRegistered',
                    },
                    {
                        to: messages[1].to,
                        status: 'rejected',
                        error: 'InvalidCredentials',
                    },
                    {
                        to: messages[2].to,
                        status: 'unknown',
                        error: 'REQUEST_FAILED',
                    },
                ],
            },
        )

        const result = await service.sendReminders(now)

        expect(repository.deletePushToken).toHaveBeenCalledTimes(1)
        expect(repository.deletePushToken).toHaveBeenCalledWith(100, 10)
        expect(repository.recordPush).toHaveBeenCalledWith(
            1003,
            { status: 'UNKNOWN', errorCode: 'REQUEST_FAILED' },
            now,
        )
        expect(repository.markSent).not.toHaveBeenCalled()
        expect(result.push).toEqual({ sent: 0, failed: 3 })
    })

    it('한 채널의 준비가 실패해도 같은 링크의 다른 채널과 다른 링크를 계속 보낸다', async () => {
        const { service, repository, sendBulk, pushService } = setup([
            createTarget({ linkId: 1 }),
            createTarget({ linkId: 2, occurrenceId: 'occurrence-2' }),
        ])
        repository.insertEmailHistory.mockRejectedValueOnce(
            new Error('DB error'),
        )

        await service.sendReminders(now)

        expect(sendBulk.mock.calls[0]?.[0].entries).toHaveLength(1)
        expect(
            pushService.send.mock.calls[0]?.[0].map(
                (message) => message.data?.linkId,
            ),
        ).toEqual([1, 2])
        expect(repository.markSent).toHaveBeenCalledTimes(2)
        expect(loggerErrorSpy).toHaveBeenCalledWith(
            expect.stringContaining('linkId=1'),
            expect.any(String),
        )
    })

    it('URL이 잘못된 링크의 이메일만 실패로 기록하고 같은 묶음의 나머지 이메일은 보낸다', async () => {
        const { service, repository, sendBulk } = setup([
            createTarget({
                linkId: 1,
                originalUrl: 'javascript:alert(1)',
                finalUrl: null,
            }),
            createTarget({
                linkId: 2,
                occurrenceId: 'occurrence-2',
                recipientEmail: 'other@example.com',
            }),
        ])

        const result = await service.sendReminders(now)

        expect(sendBulk.mock.calls[0]?.[0].entries).toEqual([
            expect.objectContaining({ to: 'other@example.com' }),
        ])
        expect(repository.recordEmail).toHaveBeenCalledWith(1001, null, now)
        expect(repository.recordEmail).toHaveBeenCalledWith(
            1003,
            'message-0',
            now,
        )
        expect(result.email).toEqual({ sent: 1, failed: 1 })
    })

    it('결과 기록 하나가 실패해도 나머지 이메일·푸시 결과는 기록한다', async () => {
        const { service, repository } = setup([
            createTarget({ linkId: 1 }),
            createTarget({ linkId: 2, occurrenceId: 'occurrence-2' }),
        ])
        repository.recordEmail.mockRejectedValueOnce(new Error('DB error'))
        repository.recordPush.mockRejectedValueOnce(new Error('DB error'))

        await service.sendReminders(now)

        expect(repository.recordEmail).toHaveBeenCalledTimes(2)
        expect(repository.recordPush).toHaveBeenCalledTimes(2)
        expect(repository.markSent).toHaveBeenCalledTimes(2)
    })

    it('고정 템플릿의 링크 제목을 escape하고 URL을 삽입한다', async () => {
        const { service, sendBulk } = setup([
            createTarget({
                title: '<script>alert("xss")</script>',
                finalUrl: null,
            }),
        ])

        await service.sendReminders(now)

        const templateData =
            sendBulk.mock.calls[0]?.[0].entries[0]?.templateData
        expect(templateData?.linkTitle).toBe(
            '&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;',
        )
        expect(templateData?.linkTitleText).toBe(
            '<script>alert("xss")</script>',
        )
        expect(templateData?.linkUrl).toBe('https://example.com/original')
    })

    describe('checkPushReceipts', () => {
        it('receipt 결과를 기록하고 기기 등록 해제만 토큰을 정리한다', async () => {
            const { service, repository, pushService } = setup([])
            const receiptTargets: PushReceiptTarget[] = [
                { id: 1, userId: 10, pushTokenId: 100, ticketId: 'ok' },
                { id: 2, userId: 10, pushTokenId: 101, ticketId: 'gone' },
                { id: 3, userId: 10, pushTokenId: null, ticketId: 'gone-null' },
                { id: 4, userId: 10, pushTokenId: 103, ticketId: 'rate' },
                { id: 5, userId: 10, pushTokenId: 104, ticketId: 'pending' },
                { id: 6, userId: 10, pushTokenId: 105, ticketId: 'unknown' },
            ]
            repository.findReceiptTargets.mockResolvedValue(receiptTargets)
            pushService.getReceipts.mockResolvedValue({
                ok: { status: 'ok' },
                gone: { status: 'error', error: 'DeviceNotRegistered' },
                'gone-null': { status: 'error', error: 'DeviceNotRegistered' },
                rate: { status: 'error', error: 'MessageRateExceeded' },
                pending: { status: 'pending' },
                unknown: { status: 'unknown', error: 'REQUEST_FAILED' },
            } satisfies Record<string, PushReceiptResult>)

            await service.checkPushReceipts(now)

            expect(repository.findReceiptTargets).toHaveBeenCalledWith(
                new Date('2026-11-26T03:00:00.000Z'),
                new Date('2026-11-25T03:15:00.000Z'),
            )
            expect(repository.recordPush.mock.calls).toEqual([
                [1, { status: 'RECEIPT_OK' }, now],
                [
                    2,
                    { status: 'FAILED', errorCode: 'DeviceNotRegistered' },
                    now,
                ],
                [
                    3,
                    { status: 'FAILED', errorCode: 'DeviceNotRegistered' },
                    now,
                ],
                [
                    4,
                    { status: 'FAILED', errorCode: 'MessageRateExceeded' },
                    now,
                ],
            ])
            expect(repository.deletePushToken.mock.calls).toEqual([[101, 10]])
        })

        it('조회할 receipt가 없으면 Expo를 호출하지 않는다', async () => {
            const { service, pushService } = setup([])

            await service.checkPushReceipts(now)

            expect(pushService.getReceipts).not.toHaveBeenCalled()
        })
    })
})
