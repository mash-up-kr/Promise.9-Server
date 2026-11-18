import { randomUUID } from 'node:crypto'
import { join } from 'node:path'

import { eq, inArray } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/postgres-js'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import postgres from 'postgres'

import { BaseException } from '../../src/common/exception/base.exception'
import { DatabaseService } from '../../src/config/database/database.service'
import * as schema from '../../src/config/database/schema'
import { links } from '../../src/modules/link/link.schema'
import {
    pushHistories,
    pushTokens,
} from '../../src/modules/notification/notification.schema'
import { PushTokenRepository } from '../../src/modules/user/push-token/push-token.repository'
import { SocialAccountRepository } from '../../src/modules/user/repository/social-account.repository'
import { UserRepository } from '../../src/modules/user/repository/user.repository'
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
const repository = new PushTokenRepository(databaseService)
const userRepository = new UserRepository(
    databaseService,
    new SocialAccountRepository(databaseService),
)

describe('PushTokenRepository (PostgreSQL)', () => {
    let userId: number
    let otherUserId: number
    let token: string

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
                { email: 'push-' + uniqueId + '@example.com' },
                { email: 'push-other-' + uniqueId + '@example.com' },
            ])
            .returning({ id: users.id })
        userId = accounts[0].id
        otherUserId = accounts[1].id
        token = 'ExpoPushToken[' + uniqueId + ']'
    })

    afterEach(async () => {
        await db.delete(users).where(inArray(users.id, [userId, otherUserId]))
    })

    afterAll(async () => client.end())

    it('반복 등록은 ID와 생성 시각을 유지하고 플랫폼을 갱신한다', async () => {
        expect(
            await repository.register(userId, { token, platform: 'ios' }),
        ).toBe(true)
        const [before] = await db
            .select()
            .from(pushTokens)
            .where(eq(pushTokens.token, token))
        expect(
            await repository.register(userId, { token, platform: 'android' }),
        ).toBe(true)
        const rows = await db
            .select()
            .from(pushTokens)
            .where(eq(pushTokens.token, token))
        expect(rows).toHaveLength(1)
        expect(rows[0]).toMatchObject({
            id: before.id,
            userId,
            platform: 'android',
            createdAt: before.createdAt,
        })
    })

    it('동시 재등록도 전역 유니크 토큰을 중복 생성하지 않는다', async () => {
        expect(
            await Promise.all(
                Array.from({ length: 5 }, () =>
                    repository.register(userId, { token, platform: 'ios' }),
                ),
            ),
        ).toEqual(Array(5).fill(true))
        expect(
            await db
                .select()
                .from(pushTokens)
                .where(eq(pushTokens.token, token)),
        ).toHaveLength(1)
    })

    it('계정 전환 후 이전 계정의 해제 요청은 새 소유자의 토큰을 지우지 않는다', async () => {
        await repository.register(userId, { token, platform: 'ios' })
        await repository.register(otherUserId, { token, platform: 'android' })
        expect(await repository.unregister(userId, token)).toBe(true)
        const [stored] = await db
            .select()
            .from(pushTokens)
            .where(eq(pushTokens.token, token))
        expect(stored).toMatchObject({
            userId: otherUserId,
            platform: 'android',
        })
    })

    it('해제는 해당 사용자의 해당 기기 토큰만 삭제한다', async () => {
        const secondToken = token + '-second'
        const otherToken = token + '-other'
        await repository.register(userId, { token, platform: 'ios' })
        await repository.register(userId, {
            token: secondToken,
            platform: 'android',
        })
        await repository.register(otherUserId, {
            token: otherToken,
            platform: 'ios',
        })
        await repository.unregister(userId, token)
        expect(
            await db
                .select()
                .from(pushTokens)
                .where(eq(pushTokens.token, token)),
        ).toHaveLength(0)
        const remaining = await db
            .select({ token: pushTokens.token })
            .from(pushTokens)
            .where(inArray(pushTokens.userId, [userId, otherUserId]))
        expect(remaining.map((row) => row.token).sort()).toEqual(
            [secondToken, otherToken].sort(),
        )
    })

    it('없는 토큰과 반복 해제는 멱등하게 성공한다', async () => {
        await repository.register(userId, { token, platform: 'ios' })
        expect(await repository.unregister(userId, token)).toBe(true)
        expect(await repository.unregister(userId, token)).toBe(true)
    })

    it('존재하지 않거나 탈퇴한 계정은 등록·해제하지 않는다', async () => {
        await db
            .update(users)
            .set({ deletedAt: new Date() })
            .where(eq(users.id, userId))
        for (const accountId of [userId, -1]) {
            expect(
                await repository.register(accountId, {
                    token,
                    platform: 'ios',
                }),
            ).toBe(false)
            expect(await repository.unregister(accountId, token)).toBe(false)
        }
        expect(
            await db
                .select()
                .from(pushTokens)
                .where(eq(pushTokens.token, token)),
        ).toHaveLength(0)
    })

    it('토큰을 해제해도 기존 발송 이력은 유지한다', async () => {
        await repository.register(userId, { token, platform: 'ios' })
        const [link] = await db
            .insert(links)
            .values({
                userId,
                originalUrl: 'https://example.com/push-test',
                normalizedUrl: 'https://example.com/push-test',
            })
            .returning({ id: links.id })
        const [history] = await db
            .insert(pushHistories)
            .values({
                userId,
                linkId: link.id,
                occurrenceId: randomUUID(),
                status: 'ACCEPTED',
                ticketId: 'integration-ticket',
            })
            .returning()
        await repository.unregister(userId, token)
        const [stored] = await db
            .select()
            .from(pushHistories)
            .where(eq(pushHistories.id, history.id))
        expect(stored).toEqual(history)
    })

    it('회원 탈퇴는 같은 트랜잭션에서 해당 사용자의 모든 토큰을 정리한다', async () => {
        await repository.register(userId, { token, platform: 'ios' })
        await repository.register(userId, {
            token: token + '-second',
            platform: 'android',
        })
        await repository.register(otherUserId, {
            token: token + '-other',
            platform: 'ios',
        })
        await db.transaction((tx) => userRepository.deleteAccount(userId, tx))
        const [account] = await db
            .select()
            .from(users)
            .where(eq(users.id, userId))
        expect(account.deletedAt).not.toBeNull()
        expect(
            await db
                .select()
                .from(pushTokens)
                .where(eq(pushTokens.userId, userId)),
        ).toHaveLength(0)
        expect(
            await db
                .select()
                .from(pushTokens)
                .where(eq(pushTokens.userId, otherUserId)),
        ).toHaveLength(1)
        expect(
            await repository.register(userId, { token, platform: 'ios' }),
        ).toBe(false)
    })

    it('등록과 회원 탈퇴가 겹쳐도 탈퇴 후 토큰이 남지 않는다', async () => {
        await Promise.all([
            repository.register(userId, { token, platform: 'ios' }),
            db.transaction((tx) => userRepository.deleteAccount(userId, tx)),
        ])
        expect(
            await db
                .select()
                .from(pushTokens)
                .where(eq(pushTokens.userId, userId)),
        ).toHaveLength(0)
        expect(
            await repository.register(userId, { token, platform: 'ios' }),
        ).toBe(false)
    })

    it('DB 오류는 원래 연결을 롤백하고 토큰이 포함된 SQL 오류를 노출하지 않는다', async () => {
        await repository.register(userId, { token, platform: 'ios' })
        const result = repository.register(otherUserId, {
            token,
            platform: 'invalid' as 'ios',
        })
        await expect(result).rejects.toBeInstanceOf(BaseException)
        await expect(result).rejects.toMatchObject({
            response: {
                success: false,
                error: { code: 500, errorCode: 910002 },
            },
        })
        await result.catch((error: BaseException) => {
            expect(JSON.stringify(error.getResponse())).not.toContain(token)
            expect(error.message).not.toContain(token)
        })
        const [stored] = await db
            .select()
            .from(pushTokens)
            .where(eq(pushTokens.token, token))
        expect(stored).toMatchObject({ userId, platform: 'ios' })
    })
})
