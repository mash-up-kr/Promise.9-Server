import { randomUUID } from 'node:crypto'
import { join } from 'node:path'

import { ConfigService } from '@nestjs/config'
import { eq, inArray } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/postgres-js'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import postgres from 'postgres'

import { UrlSecurityService } from '../../src/common/security/url-security/url-security.service'
import { DatabaseService } from '../../src/config/database/database.service'
import * as schema from '../../src/config/database/schema'
import { EmailService } from '../../src/infrastructure/email/email.service'
import { SendBulkEmailInput } from '../../src/infrastructure/email/email.type'
import { PushService } from '../../src/infrastructure/push/push.service'
import { PushMessage } from '../../src/infrastructure/push/push.type'
import { links } from '../../src/modules/link/link.schema'
import { ReminderRepository } from '../../src/modules/link/reminder/reminder.repository'
import { ReminderService } from '../../src/modules/link/reminder/reminder.service'
import {
    emailHistories,
    notificationSettings,
    pushHistories,
    pushTokens,
} from '../../src/modules/notification/notification.schema'
import { users } from '../../src/modules/user/schema/user.schema'

const databaseUrl = process.env.TEST_DATABASE_URL
if (!databaseUrl || !new URL(databaseUrl).pathname.endsWith('_test')) {
    throw new Error(
        'TEST_DATABASE_URL에 이름이 _test로 끝나는 테스트 DB를 지정해주세요.',
    )
}

const client = postgres(databaseUrl, {
    max: 1,
    connect_timeout: 5,
    connection: { statement_timeout: 10000 },
    onnotice: () => undefined,
})
const db = drizzle(client, { schema, casing: 'snake_case' })
const repository = new ReminderRepository({ db } as unknown as DatabaseService)

const now = new Date('2026-11-26T03:15:00.000Z')
const retrySince = new Date('2026-11-26T02:15:00.000Z')
const due = new Date('2026-11-26T03:00:00.000Z')
const attemptedAt = new Date('2026-11-26T03:00:30.000Z')

describe('ReminderRepository (PostgreSQL)', () => {
    let userId: number
    let otherUserId: number

    beforeAll(async () => {
        await migrate(db, {
            migrationsFolder: join(__dirname, '../../drizzle'),
        })
    }, 30000)

    beforeEach(async () => {
        const uniqueId = randomUUID()
        const accounts = await db
            .insert(users)
            .values([
                { email: 'reminder-' + uniqueId + '@example.com' },
                { email: 'reminder-other-' + uniqueId + '@example.com' },
            ])
            .returning({ id: users.id })
        userId = accounts[0].id
        otherUserId = accounts[1].id
    })

    afterEach(async () => {
        await db
            .delete(links)
            .where(inArray(links.userId, [userId, otherUserId]))
        await db.delete(users).where(inArray(users.id, [userId, otherUserId]))
    })

    afterAll(async () => client.end())

    const insertLink = async (
        values: Partial<typeof links.$inferInsert> = {},
    ) => {
        const url = 'https://example.com/' + randomUUID()
        const [link] = await db
            .insert(links)
            .values({
                userId,
                originalUrl: url,
                normalizedUrl: url,
                reminderAt: due,
                ...values,
            })
            .returning()
        return link
    }
    const insertToken = async (owner = userId) => {
        const [token] = await db
            .insert(pushTokens)
            .values({
                userId: owner,
                token: 'ExponentPushToken[' + randomUUID() + ']',
                platform: 'ios',
            })
            .returning({ id: pushTokens.id, token: pushTokens.token })
        return token
    }
    const occurrenceOf = async (linkId: number) => {
        const [link] = await db
            .select({ occurrenceId: links.reminderOccurrenceId })
            .from(links)
            .where(eq(links.id, linkId))
        return link.occurrenceId
    }
    const targetIds = async () =>
        (await repository.findTargets(now, retrySince)).map(
            (target) => target.linkId,
        )

    it('발송 시각이 된 일정에만 회차를 한 번 만들고 다시 만들지 않는다', async () => {
        const dueLink = await insertLink()
        const futureLink = await insertLink({
            reminderAt: new Date('2026-11-27T00:00:00.000Z'),
        })
        const deletedLink = await insertLink({ deletedAt: now })

        await repository.assignOccurrences(now)
        const occurrenceId = await occurrenceOf(dueLink.id)
        await repository.assignOccurrences(now)

        expect(occurrenceId).toEqual(expect.any(String))
        expect(await occurrenceOf(dueLink.id)).toBe(occurrenceId)
        expect(await occurrenceOf(futureLink.id)).toBeNull()
        expect(await occurrenceOf(deletedLink.id)).toBeNull()
    })

    it('발송 대상은 지금 소유자의 기기를 담고, 수신 설정은 채널별로 끈 사용자만 돌려준다', async () => {
        const link = await insertLink({ title: '읽어볼 링크' })
        const token = await insertToken()
        const movedToken = await insertToken()
        await db
            .update(pushTokens)
            .set({ userId: otherUserId })
            .where(eq(pushTokens.id, movedToken.id))
        await db.insert(notificationSettings).values({
            userId,
            channel: 'push',
            enabled: false,
        })
        await repository.assignOccurrences(now)

        const [target] = await repository.findTargets(now, retrySince)

        expect(target).toMatchObject({
            linkId: link.id,
            userId,
            occurrenceId: await occurrenceOf(link.id),
            reminderAt: due,
            title: '읽어볼 링크',
            emailHistory: null,
            pushTokens: [token],
            pushHistories: [],
        })
        expect(await repository.findDisabledUserIds([userId], 'email')).toEqual(
            [],
        )
        expect(await repository.findDisabledUserIds([userId], 'push')).toEqual([
            userId,
        ])
    })

    it('삭제된 링크·탈퇴 회원·회차 없는 일정은 대상이 아니다', async () => {
        await insertLink()
        const deleted = await insertLink()
        await repository.assignOccurrences(now)
        await db
            .update(links)
            .set({ deletedAt: now })
            .where(eq(links.id, deleted.id))
        await insertLink({ userId: otherUserId, reminderOccurrenceId: null })
        await insertLink({ userId: otherUserId, reminderAt: null })

        expect(await targetIds()).toHaveLength(1)

        await db
            .update(users)
            .set({ deletedAt: now })
            .where(eq(users.id, userId))
        expect(await targetIds()).toEqual([])
    })

    it('마친 일정은 지금 회차의 재시도할 실패가 기한 안에 있을 때만 대상이다', async () => {
        const link = await insertLink()
        await repository.assignOccurrences(now)
        const occurrenceId = (await occurrenceOf(link.id)) as string
        await repository.markSent(link.id, occurrenceId, now)
        expect(await targetIds()).toEqual([])

        const [push] = await db
            .insert(pushHistories)
            .values({
                userId,
                linkId: link.id,
                occurrenceId,
                status: 'FAILED',
                errorCode: 'DeviceNotRegistered',
                createdAt: attemptedAt,
            })
            .returning()
        expect(await targetIds()).toEqual([])

        await db
            .update(pushHistories)
            .set({ errorCode: 'MessageRateExceeded' })
            .where(eq(pushHistories.id, push.id))
        expect(await targetIds()).toEqual([link.id])

        await db
            .update(pushHistories)
            .set({ createdAt: retrySince })
            .where(eq(pushHistories.id, push.id))
        expect(await targetIds()).toEqual([])

        await db.insert(emailHistories).values({
            userId,
            linkId: link.id,
            occurrenceId,
            status: 'FAILED',
            createdAt: attemptedAt,
        })
        expect(await targetIds()).toEqual([link.id])

        // 일정을 바꾸면 이전 회차의 실패는 다시 보내지 않는다.
        await db
            .update(links)
            .set({ reminderOccurrenceId: null })
            .where(eq(links.id, link.id))
        expect(await targetIds()).toEqual([])
    })

    it('첫 발송 선점은 채널·기기마다 한 번만 성공한다', async () => {
        const link = await insertLink()
        const [first, second] = [await insertToken(), await insertToken()]
        await repository.assignOccurrences(now)
        const owner = {
            userId,
            linkId: link.id,
            occurrenceId: (await occurrenceOf(link.id)) as string,
        }

        const emailClaims = await Promise.all([
            repository.insertEmailHistory(owner, now),
            repository.insertEmailHistory(owner, now),
        ])
        const pushClaims = await Promise.all([
            repository.insertPushHistory(owner, first.id, now),
            repository.insertPushHistory(owner, first.id, now),
            repository.insertPushHistory(owner, second.id, now),
        ])

        expect(emailClaims.filter(Boolean)).toHaveLength(1)
        expect(pushClaims[2]).toEqual(expect.any(Number))
        expect(pushClaims.slice(0, 2).filter(Boolean)).toHaveLength(1)
    })

    it('실패 이력의 재시도 선점도 한 번만 성공하고 결과를 기록한다', async () => {
        const link = await insertLink()
        const token = await insertToken()
        await repository.assignOccurrences(now)
        const owner = {
            userId,
            linkId: link.id,
            occurrenceId: (await occurrenceOf(link.id)) as string,
        }
        const emailId = (await repository.insertEmailHistory(
            owner,
            now,
        )) as number
        const pushId = (await repository.insertPushHistory(
            owner,
            token.id,
            now,
        )) as number

        expect(await repository.retryEmailHistory(emailId, now)).toBe(false)
        await repository.recordEmail(emailId, null, now)
        await repository.recordPush(
            pushId,
            { status: 'FAILED', errorCode: 'MessageRateExceeded' },
            now,
        )
        expect(
            await Promise.all([
                repository.retryEmailHistory(emailId, now),
                repository.retryEmailHistory(emailId, now),
                repository.retryPushHistory(pushId, now),
                repository.retryPushHistory(pushId, now),
            ]),
        ).toEqual([true, false, true, false])

        await repository.recordEmail(emailId, 'ses-message-id', now)
        await repository.recordPush(
            pushId,
            { status: 'ACCEPTED', ticketId: 'ticket-id' },
            now,
        )
        await repository.recordPush(
            pushId,
            { status: 'FAILED', errorCode: 'DeviceNotRegistered' },
            now,
        )
        const [email] = await db
            .select()
            .from(emailHistories)
            .where(eq(emailHistories.id, emailId))
        const [push] = await db
            .select()
            .from(pushHistories)
            .where(eq(pushHistories.id, pushId))
        expect(email).toMatchObject({
            status: 'ACCEPTED',
            sesMessageId: 'ses-message-id',
        })
        expect(push).toMatchObject({
            status: 'FAILED',
            ticketId: 'ticket-id',
            errorCode: 'DeviceNotRegistered',
            pushTokenId: token.id,
        })
    })

    it('기기 정리는 발송 당시 소유자의 토큰만 지우고 이력은 남긴다', async () => {
        const link = await insertLink()
        const token = await insertToken()
        await repository.assignOccurrences(now)
        const pushId = (await repository.insertPushHistory(
            {
                userId,
                linkId: link.id,
                occurrenceId: (await occurrenceOf(link.id)) as string,
            },
            token.id,
            now,
        )) as number

        await repository.deletePushToken(token.id, otherUserId)
        expect(
            await db
                .select()
                .from(pushTokens)
                .where(eq(pushTokens.id, token.id)),
        ).toHaveLength(1)

        await repository.deletePushToken(token.id, userId)
        const [history] = await db
            .select({ pushTokenId: pushHistories.pushTokenId })
            .from(pushHistories)
            .where(eq(pushHistories.id, pushId))
        expect(history).toEqual({ pushTokenId: null })
    })

    it('receipt는 접수 뒤 조회 시점이 된 이력만 조회한다', async () => {
        const link = await insertLink()
        await repository.assignOccurrences(now)
        const occurrenceId = (await occurrenceOf(link.id)) as string
        const accepted = (updatedAt: Date, ticketId: string) => ({
            userId,
            linkId: link.id,
            occurrenceId,
            status: 'ACCEPTED' as const,
            ticketId,
            updatedAt,
        })
        await db
            .insert(pushHistories)
            .values([
                accepted(new Date('2026-11-26T02:59:00.000Z'), 'ready'),
                accepted(new Date('2026-11-26T03:10:00.000Z'), 'too-early'),
                accepted(new Date('2026-11-25T02:00:00.000Z'), 'expired'),
            ])

        const targets = await repository.findReceiptTargets(
            new Date('2026-11-26T03:00:00.000Z'),
            new Date('2026-11-25T03:15:00.000Z'),
        )

        expect(
            targets
                .filter((target) => target.userId === userId)
                .map((target) => target.ticketId),
        ).toEqual(['ready'])
    })

    it('회차가 그대로일 때만 일정을 마친다', async () => {
        const link = await insertLink()
        await repository.assignOccurrences(now)
        const occurrenceId = (await occurrenceOf(link.id)) as string

        expect(await repository.markSent(link.id, randomUUID(), now)).toBe(
            false,
        )
        expect(await repository.markSent(link.id, occurrenceId, now)).toBe(true)
        expect(await repository.markSent(link.id, occurrenceId, now)).toBe(
            false,
        )
    })

    it('기한이 지나도록 보내지 못한 일정은 발송을 시도한 경우에만 마친다', async () => {
        const old = new Date('2026-11-26T02:00:00.000Z')
        const attempted = await insertLink({ reminderAt: old })
        const notAttempted = await insertLink({ reminderAt: old })
        const recent = await insertLink()
        await repository.assignOccurrences(now)
        for (const link of [attempted, recent]) {
            await db.insert(emailHistories).values({
                userId,
                linkId: link.id,
                occurrenceId: (await occurrenceOf(link.id)) as string,
                status: 'FAILED',
            })
        }

        expect(await repository.finishExpired(retrySince, now)).toBe(1)
        const rows = await db
            .select({ id: links.id, reminderAt: links.reminderAt })
            .from(links)
            .where(eq(links.userId, userId))
            .orderBy(links.id)
        expect(rows).toEqual([
            { id: attempted.id, reminderAt: null },
            { id: notAttempted.id, reminderAt: old },
            { id: recent.id, reminderAt: due },
        ])
    })

    describe('배치 전체', () => {
        let emailOk: boolean
        const sentEmails: string[] = []
        const sentPushes: string[] = []
        const emailService = {
            sendBulk: (input: SendBulkEmailInput) => {
                sentEmails.push(...input.entries.map((entry) => entry.to))
                return Promise.resolve(
                    input.entries.map(() =>
                        emailOk
                            ? { Status: 'SUCCESS', MessageId: randomUUID() }
                            : { Status: 'FAILED' },
                    ),
                )
            },
        }
        const pushService = {
            send: (messages: readonly PushMessage[]) => {
                sentPushes.push(...messages.map((message) => message.to))
                return Promise.resolve(
                    messages.map((message) => ({
                        to: message.to,
                        status: 'accepted',
                        ticketId: randomUUID(),
                    })),
                )
            },
        }
        const service = new ReminderService(
            repository,
            emailService as unknown as EmailService,
            pushService as unknown as PushService,
            new UrlSecurityService(),
            new ConfigService(),
        )

        beforeEach(() => {
            emailOk = true
            sentEmails.length = 0
            sentPushes.length = 0
        })

        const reminderAtOf = async (linkId: number) => {
            const [link] = await db
                .select({ reminderAt: links.reminderAt })
                .from(links)
                .where(eq(links.id, linkId))
            return link.reminderAt
        }

        it('겹쳐 실행하고 다시 실행해도 이메일과 기기마다 한 번만 보내고 일정을 마친다', async () => {
            const link = await insertLink()
            const tokens = [await insertToken(), await insertToken()]
            const [user] = await db
                .select({ email: users.email })
                .from(users)
                .where(eq(users.id, userId))

            await Promise.all([
                service.sendReminders(now),
                service.sendReminders(now),
            ])
            await service.sendReminders(now)

            expect(sentEmails.filter((to) => to === user.email)).toHaveLength(1)
            expect(
                sentPushes.filter((to) =>
                    tokens.some((token) => token.token === to),
                ),
            ).toHaveLength(2)
            expect(await reminderAtOf(link.id)).toBeNull()
        })

        it('이메일만 실패하면 일정을 마치고 다음 실행에서 이메일만 다시 보낸다', async () => {
            const link = await insertLink()
            const token = await insertToken()
            emailOk = false

            await service.sendReminders(now)
            expect(await reminderAtOf(link.id)).toBeNull()

            emailOk = true
            await service.sendReminders(new Date('2026-11-26T03:30:00.000Z'))
            await service.sendReminders(new Date('2026-11-26T03:45:00.000Z'))

            expect(sentPushes.filter((to) => to === token.token)).toHaveLength(
                1,
            )
            const [email] = await db
                .select({ status: emailHistories.status })
                .from(emailHistories)
                .where(eq(emailHistories.linkId, link.id))
            expect(email).toEqual({ status: 'ACCEPTED' })
            expect(
                sentEmails.filter((to) => to.startsWith('reminder-')),
            ).toHaveLength(2)
        })
    })
})
