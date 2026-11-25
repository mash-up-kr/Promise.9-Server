import { randomUUID } from 'node:crypto'
import { join } from 'node:path'

import { eq, inArray } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/postgres-js'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import postgres from 'postgres'

import { DatabaseService } from '../../src/config/database/database.service'
import * as schema from '../../src/config/database/schema'
import { links } from '../../src/modules/link/link.schema'
import { ReminderRepository } from '../../src/modules/link/reminder/reminder.repository'
import { notificationSettings } from '../../src/modules/notification/notification.schema'
import { NotificationSettingRepository } from '../../src/modules/user/notification-setting/notification-setting.repository'
import { users } from '../../src/modules/user/schema/user.schema'

const databaseUrl = process.env.TEST_DATABASE_URL
if (!databaseUrl || !new URL(databaseUrl).pathname.endsWith('_test')) {
    throw new Error(
        'TEST_DATABASE_URL에 이름이 _test로 끝나는 테스트 DB를 지정해주세요.',
    )
}

const client = postgres(databaseUrl, {
    max: 3,
    connect_timeout: 5,
    connection: { statement_timeout: 10000 },
    onnotice: () => undefined,
})
const db = drizzle(client, { schema, casing: 'snake_case' })
const databaseService = { db } as unknown as DatabaseService
const repository = new NotificationSettingRepository(databaseService)
const reminderRepository = new ReminderRepository(databaseService)

describe('NotificationSettingRepository (PostgreSQL)', () => {
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
                { email: 'notification-' + uniqueId + '@example.com' },
                { email: 'notification-other-' + uniqueId + '@example.com' },
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

    const storedRows = () =>
        db
            .select({
                channel: notificationSettings.channel,
                enabled: notificationSettings.enabled,
            })
            .from(notificationSettings)
            .where(eq(notificationSettings.userId, userId))

    it('설정한 적 없는 회원은 두 채널 모두 켜짐으로 보고 행을 만들지 않는다', async () => {
        expect(await repository.find(userId)).toEqual({
            email: true,
            push: true,
        })
        expect(await storedRows()).toEqual([])
    })

    it('보낸 채널만 저장하고 반복 변경해도 채널별 행을 하나로 유지한다', async () => {
        expect(await repository.update(userId, { email: false })).toEqual({
            email: false,
            push: true,
        })
        expect(await storedRows()).toEqual([
            { channel: 'email', enabled: false },
        ])

        expect(
            await repository.update(userId, { email: true, push: false }),
        ).toEqual({ email: true, push: false })
        expect(await repository.update(userId, { push: false })).toEqual({
            email: true,
            push: false,
        })
        expect(await storedRows()).toHaveLength(2)
        expect(await repository.find(otherUserId)).toEqual({
            email: true,
            push: true,
        })
    })

    it('동시 변경도 채널별 행을 중복 생성하지 않는다', async () => {
        await Promise.all(
            Array.from({ length: 5 }, (_, index) =>
                repository.update(userId, { email: index % 2 === 0 }),
            ),
        )
        expect(await storedRows()).toHaveLength(1)
    })

    it('존재하지 않거나 탈퇴한 회원은 조회·변경하지 않는다', async () => {
        await db
            .update(users)
            .set({ deletedAt: new Date() })
            .where(eq(users.id, userId))

        expect(await repository.find(userId)).toBeUndefined()
        expect(
            await repository.update(userId, { email: false }),
        ).toBeUndefined()
        expect(await storedRows()).toEqual([])
        expect(await repository.find(Number.MAX_SAFE_INTEGER)).toBeUndefined()
    })

    it('리마인드 대상은 발송 시점의 이메일 설정을 따르고, 설정 변경은 일정을 바꾸지 않는다', async () => {
        const reminderAt = new Date('2026-11-01T00:00:00.000Z')
        const created = await db
            .insert(links)
            .values(
                [userId, otherUserId].map((owner) => ({
                    userId: owner,
                    originalUrl: 'https://example.com/' + owner,
                    normalizedUrl: 'https://example.com/' + owner,
                    reminderAt,
                })),
            )
            .returning({ id: links.id, userId: links.userId })
        const emailEnabledOf = async () => {
            const now = new Date('2026-11-02T00:00:00.000Z')
            await reminderRepository.assignOccurrences(now)
            const targets = await reminderRepository.findTargets(now, now)
            return Object.fromEntries(
                created.map((link) => [
                    link.userId,
                    targets.find((target) => target.linkId === link.id)
                        ?.emailEnabled,
                ]),
            )
        }

        expect(await emailEnabledOf()).toEqual({
            [userId]: true,
            [otherUserId]: true,
        })

        await repository.update(userId, { email: false })
        await repository.update(otherUserId, { push: false })

        expect(await emailEnabledOf()).toEqual({
            [userId]: false,
            [otherUserId]: true,
        })
        const scheduled = await db
            .select({ reminderAt: links.reminderAt })
            .from(links)
            .where(
                inArray(
                    links.id,
                    created.map((link) => link.id),
                ),
            )
        expect(scheduled).toEqual([{ reminderAt }, { reminderAt }])
    })
})
