import { randomUUID } from 'node:crypto'
import { join } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'

import { eq, sql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/postgres-js'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import postgres from 'postgres'

import {
    DatabaseService,
    DbExecutor,
} from '../../src/config/database/database.service'
import * as schema from '../../src/config/database/schema'
import { SocialAccountRepository } from '../../src/modules/user/repository/social-account.repository'
import { UserRepository } from '../../src/modules/user/repository/user.repository'
import { users } from '../../src/modules/user/schema/user.schema'
import { MarketingTouch } from '../../src/modules/user/user-attribution'

const databaseUrl = process.env.TEST_DATABASE_URL
if (!databaseUrl || !new URL(databaseUrl).pathname.endsWith('_test')) {
    throw new Error(
        'TEST_DATABASE_URL에 이름이 _test로 끝나는 테스트 DB를 지정해주세요.',
    )
}

const client = postgres(databaseUrl, {
    // 갱신 두 건과 잠금 확인 쿼리가 각각 독립된 연결을 사용한다.
    max: 3,
    connect_timeout: 5,
    connection: { statement_timeout: 10000 },
    onnotice: () => undefined,
})
const db = drizzle(client, { schema, casing: 'snake_case' })

function createRepository(executor: DbExecutor) {
    const databaseService = { db: executor } as DatabaseService
    return new UserRepository(
        databaseService,
        new SocialAccountRepository(databaseService),
    )
}

const repository = createRepository(db)
const first: MarketingTouch = {
    touch_id: 'first',
    captured_at: '2026-10-14T09:00:00.000Z',
    utm_source: 'instagram',
    utm_medium: 'sns_post',
    utm_campaign: 'friends',
    utm_content: null,
    utm_term: null,
}
const middle: MarketingTouch = {
    ...first,
    touch_id: 'middle',
    captured_at: '2026-10-15T09:00:00.000Z',
}
const latest: MarketingTouch = {
    ...first,
    touch_id: 'latest',
    captured_at: '2026-10-16T09:00:00.000Z',
    utm_source: 'newsletter',
    utm_medium: 'email',
    utm_campaign: null,
}

async function waitForBlockedUpdate(blockingPid: number) {
    const deadline = Date.now() + 5000
    while (Date.now() < deadline) {
        const [result] = await db.execute<{ blocked: boolean }>(sql`
            SELECT EXISTS (
                SELECT 1 FROM pg_stat_activity
                WHERE datname = current_database()
                  AND ${blockingPid} = ANY(pg_blocking_pids(pid))
            ) AS blocked
        `)
        if (result.blocked) return
        await delay(20)
    }
    throw new Error(
        '두 번째 UTM 갱신의 실제 PostgreSQL 잠금 대기를 확인하지 못했습니다.',
    )
}

describe('UserRepository.syncAttribution (PostgreSQL)', () => {
    let userId: number

    beforeAll(async () => {
        await migrate(db, {
            migrationsFolder: join(__dirname, '../../drizzle'),
        })
    }, 30000)

    beforeEach(async () => {
        const [user] = await db
            .insert(users)
            .values({ email: `utm-${randomUUID()}@example.com` })
            .returning({ id: users.id })
        userId = user.id
    })

    afterEach(async () => {
        if (userId) await db.delete(users).where(eq(users.id, userId))
    })

    afterAll(async () => {
        await client.end()
    })

    it.each([
        {
            name: '최초 동시 저장에서 먼저 저장한 접점을 보존하고 더 최신 UTM으로 갱신한다',
            stored: null,
            leading: first,
            following: latest,
            expectedFirst: first,
            expectedLast: latest,
        },
        {
            name: '최초 동시 저장에서 늦게 도착한 과거 접점이 최초·최근 UTM을 덮어쓰지 않는다',
            stored: null,
            leading: latest,
            following: first,
            expectedFirst: latest,
            expectedLast: latest,
        },
        {
            name: '기존 최초 접점을 보존하고 과거 요청이 동시에 저장된 최신 UTM을 덮어쓰지 않는다',
            stored: first,
            leading: latest,
            following: middle,
            expectedFirst: first,
            expectedLast: latest,
        },
        {
            name: '동일 시각의 다른 접점도 동시에 저장된 최신 UTM을 덮어쓰지 않는다',
            stored: first,
            leading: latest,
            following: { ...first, captured_at: latest.captured_at },
            expectedFirst: first,
            expectedLast: latest,
        },
    ])(
        '$name',
        async ({ stored, leading, following, expectedFirst, expectedLast }) => {
            if (stored) await repository.syncAttribution(userId, stored)

            let pendingUpdate:
                ReturnType<UserRepository['syncAttribution']> | undefined
            try {
                const updatedAt = await db.transaction(async (tx) => {
                    // 실제 저장 로직을 savepoint에서 실행하고 바깥 트랜잭션의 커밋을 잠시 보류한다.
                    await createRepository(tx).syncAttribution(userId, leading)
                    const [saved] = await tx
                        .select({ updatedAt: users.updatedAt })
                        .from(users)
                        .where(eq(users.id, userId))
                    const [connection] = await tx.execute<{ pid: number }>(
                        sql`SELECT pg_backend_pid() AS pid`,
                    )

                    pendingUpdate = repository.syncAttribution(
                        userId,
                        following,
                    )
                    // 잠금 확인 중의 거부도 처리하되 결과와 오류는 아래 await에서 다시 확인한다.
                    void pendingUpdate.catch(() => undefined)
                    await waitForBlockedUpdate(connection.pid)
                    return saved.updatedAt
                })

                expect(await pendingUpdate).toEqual({
                    userId,
                    firstMarketingTouch: expectedFirst,
                    lastMarketingTouch: expectedLast,
                })
                const saved = await repository.findActiveById(userId)
                expect(saved).toMatchObject({
                    firstMarketingTouch: expectedFirst,
                    lastMarketingTouch: expectedLast,
                })
                if (expectedLast === leading) {
                    expect(saved?.updatedAt).toEqual(updatedAt)
                }
            } finally {
                // 실패 시에도 트랜잭션 종료를 기다린 뒤 fixture를 정리한다.
                await pendingUpdate?.catch(() => undefined)
            }
        },
    )
})
