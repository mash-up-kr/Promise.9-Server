import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { drizzle } from 'drizzle-orm/postgres-js'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import postgres from 'postgres'

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

describe('알림 스키마 (PostgreSQL)', () => {
    let userId: string
    let linkId: string
    let tokenId: string
    let token: string
    let occurrenceId: string

    beforeAll(async () => {
        await migrate(drizzle(client), {
            migrationsFolder: join(__dirname, '../../drizzle'),
        })
    }, 30000)

    beforeEach(async () => {
        token = randomUUID()
        occurrenceId = randomUUID()
        const [user] = await client`
            INSERT INTO users (email) VALUES (${`${token}@example.com`}) RETURNING id
        `
        userId = user.id as string
        const [link] = await client`
            INSERT INTO links (user_id, original_url, normalized_url)
            VALUES (${userId}, 'https://example.com', 'https://example.com') RETURNING id
        `
        linkId = link.id as string
        const [pushToken] = await client`
            INSERT INTO push_tokens (user_id, token, platform)
            VALUES (${userId}, ${token}, 'ios') RETURNING id
        `
        tokenId = pushToken.id as string
    })

    afterEach(async () => {
        await client`DELETE FROM links WHERE id = ${linkId}`
        await client`DELETE FROM users WHERE id = ${userId}`
    })

    afterAll(async () => {
        await client.end()
    })

    it('0017은 기존 이력의 소유자를 채우며 다른 회원의 토큰이 있으면 트랜잭션을 롤백한다', async () => {
        const schemaName = `notification_migration_${randomUUID().replaceAll('-', '')}`
        const migration = (name: string) =>
            readFileSync(
                join(__dirname, '../../drizzle', name),
                'utf8',
            ).replaceAll('"public".', `"${schemaName}".`)
        await client.begin(async (tx) => {
            await tx.unsafe(`CREATE SCHEMA "${schemaName}"`)
            await tx.unsafe(`SET LOCAL search_path TO "${schemaName}"`)
            await tx.unsafe(`
                CREATE TABLE users (id bigint PRIMARY KEY);
                CREATE TABLE links (id bigint PRIMARY KEY, user_id bigint NOT NULL, UNIQUE(id, user_id));
            `)
            await tx.unsafe(migration('0016_notification_schema.sql'))
            await tx.unsafe(`
                INSERT INTO users VALUES (1), (2);
                INSERT INTO links (id, user_id) VALUES (10, 1);
                INSERT INTO push_tokens (user_id, token, platform)
                VALUES (1, 'original-token', 'ios'), (1, 'deleted-token', 'android'), (2, 'other-user-token', 'ios');
                INSERT INTO push_histories (link_id, occurrence_id, push_token_id, status, ticket_id)
                SELECT 10, '00000000-0000-0000-0000-000000000001', id, 'ACCEPTED', token FROM push_tokens;
                DELETE FROM push_tokens WHERE token = 'deleted-token';
            `)
            await expect(
                tx.savepoint(async (savepoint) => {
                    await savepoint.unsafe(
                        migration('0017_push_history_owner.sql'),
                    )
                }),
            ).rejects.toMatchObject({ code: '23503' })
            const [column] = await tx`
                SELECT count(*)::integer AS count FROM information_schema.columns
                WHERE table_schema = ${schemaName} AND table_name = 'push_histories' AND column_name = 'user_id'
            `
            expect(column.count).toBe(0)
            expect(await tx`SELECT id FROM push_histories`).toHaveLength(3)
            await tx`DELETE FROM push_histories WHERE ticket_id = 'other-user-token'`
            await tx.unsafe(migration('0017_push_history_owner.sql'))
            const rows = await tx`
                SELECT user_id, ticket_id FROM push_histories ORDER BY ticket_id
            `
            expect([...rows]).toEqual([
                { user_id: '1', ticket_id: 'deleted-token' },
                { user_id: '1', ticket_id: 'original-token' },
            ])
            await tx`DELETE FROM push_tokens WHERE user_id = 1`
            expect(
                await tx`
                SELECT id FROM push_histories WHERE user_id = 1 AND push_token_id IS NULL AND status = 'ACCEPTED'
            `,
            ).toHaveLength(2)
            await tx.unsafe(`DROP SCHEMA "${schemaName}" CASCADE`)
        })
    })

    it('사용자별 채널 설정은 하나이며 서로 다른 채널은 허용한다', async () => {
        await client`
            INSERT INTO notification_settings (user_id, channel, enabled)
            VALUES (${userId}, 'email', true), (${userId}, 'push', false)
        `
        await expect(client`
            INSERT INTO notification_settings (user_id, channel, enabled)
            VALUES (${userId}, 'push', true)
        `).rejects.toMatchObject({ code: '23505' })
    })

    it('동일 토큰은 중복 등록할 수 없다', async () => {
        await expect(client`
            INSERT INTO push_tokens (user_id, token, platform)
            VALUES (${userId}, ${token}, 'android')
        `).rejects.toMatchObject({ code: '23505' })
    })

    it.each([
        [
            'platform',
            "INSERT INTO push_tokens (user_id, token, platform) VALUES ($1, 'invalid', 'other')",
        ],
        [
            'token',
            "INSERT INTO push_tokens (user_id, token, platform) VALUES ($1, '   ', 'ios')",
        ],
        [
            'channel',
            "INSERT INTO notification_settings (user_id, channel, enabled) VALUES ($1, 'sms', true)",
        ],
    ])('%s의 잘못된 값을 거부한다', async (_name, query) => {
        await expect(client.unsafe(query, [userId])).rejects.toMatchObject({
            code: '23514',
        })
    })

    it('존재하지 않는 사용자와 링크·토큰 참조를 거부한다', async () => {
        await expect(client`
            INSERT INTO push_tokens (user_id, token, platform) VALUES (-1, ${randomUUID()}, 'ios')
        `).rejects.toMatchObject({ code: '23503' })
        await expect(client`
            INSERT INTO email_histories (link_id, occurrence_id) VALUES (-1, ${occurrenceId})
        `).rejects.toMatchObject({ code: '23503' })
        await expect(client`
            INSERT INTO push_histories (user_id, link_id, occurrence_id, push_token_id)
            VALUES (${userId}, ${linkId}, ${occurrenceId}, -1)
        `).rejects.toMatchObject({ code: '23503' })
    })

    it('같은 회차의 이메일과 기기별 푸시는 중복 생성할 수 없다', async () => {
        await client`
            UPDATE links SET reminder_occurrence_id = ${occurrenceId} WHERE id = ${linkId}
        `
        const [link] = await client`
            SELECT reminder_occurrence_id FROM links WHERE id = ${linkId}
        `
        expect(link.reminder_occurrence_id).toBe(occurrenceId)
        await client`
            INSERT INTO email_histories (link_id, occurrence_id) VALUES (${linkId}, ${occurrenceId})
        `
        await client`
            INSERT INTO push_histories (user_id, link_id, occurrence_id, push_token_id)
            VALUES (${userId}, ${linkId}, ${occurrenceId}, ${tokenId})
        `
        await expect(client`
            INSERT INTO email_histories (link_id, occurrence_id) VALUES (${linkId}, ${occurrenceId})
        `).rejects.toMatchObject({ code: '23505' })
        await expect(client`
            INSERT INTO push_histories (user_id, link_id, occurrence_id, push_token_id)
            VALUES (${userId}, ${linkId}, ${occurrenceId}, ${tokenId})
        `).rejects.toMatchObject({ code: '23505' })
        const [other] = await client`
            INSERT INTO push_tokens (user_id, token, platform)
            VALUES (${userId}, ${randomUUID()}, 'android') RETURNING id
        `
        await client`
            INSERT INTO push_histories (user_id, link_id, occurrence_id, push_token_id)
            VALUES (${userId}, ${linkId}, ${occurrenceId}, ${other.id as string}),
                   (${userId}, ${linkId}, ${randomUUID()}, ${tokenId})
        `
    })

    it('서로 다른 회원의 링크·토큰 결합과 기존 연결의 소유자 변경을 거부한다', async () => {
        const [otherUser] = await client`
            INSERT INTO users (email) VALUES (${`${randomUUID()}@example.com`}) RETURNING id
        `
        const otherUserId = otherUser.id as string
        try {
            const [otherToken] = await client`
                INSERT INTO push_tokens (user_id, token, platform)
                VALUES (${otherUserId}, ${randomUUID()}, 'ios') RETURNING id
            `
            const otherTokenId = otherToken.id as string
            for (const ownerId of [userId, otherUserId]) {
                await expect(client`
                    INSERT INTO push_histories (user_id, link_id, occurrence_id, push_token_id)
                    VALUES (${ownerId}, ${linkId}, ${occurrenceId}, ${otherTokenId})
                `).rejects.toMatchObject({ code: '23503' })
            }
            await client`
                INSERT INTO push_histories (user_id, link_id, occurrence_id, push_token_id)
                VALUES (${userId}, ${linkId}, ${occurrenceId}, ${tokenId})
            `
            await expect(client`
                UPDATE push_histories SET push_token_id = ${otherTokenId} WHERE link_id = ${linkId}
            `).rejects.toMatchObject({ code: '23503' })
            await expect(client`
                UPDATE push_histories SET user_id = ${otherUserId} WHERE link_id = ${linkId}
            `).rejects.toMatchObject({ code: '23503' })
            await expect(client`
                UPDATE push_tokens SET user_id = ${otherUserId} WHERE id = ${tokenId}
            `).rejects.toMatchObject({ code: '23503' })
            await expect(client`
                UPDATE links SET user_id = ${otherUserId} WHERE id = ${linkId}
            `).rejects.toMatchObject({ code: '23503' })
        } finally {
            await client`DELETE FROM users WHERE id = ${otherUserId}`
        }
    })

    it('잘못된 상태와 제공자 ID 없는 접수 성공을 거부한다', async () => {
        for (const status of ['INVALID', 'ACCEPTED']) {
            await expect(client`
                INSERT INTO email_histories (link_id, occurrence_id, status)
                VALUES (${linkId}, ${occurrenceId}, ${status})
            `).rejects.toMatchObject({ code: '23514' })
        }
        for (const status of ['INVALID', 'ACCEPTED', 'RECEIPT_OK']) {
            await expect(client`
                INSERT INTO push_histories (user_id, link_id, occurrence_id, push_token_id, status)
                VALUES (${userId}, ${linkId}, ${occurrenceId}, ${tokenId}, ${status})
            `).rejects.toMatchObject({ code: '23514' })
        }
        await client`
            INSERT INTO email_histories (link_id, occurrence_id, status, ses_message_id)
            VALUES (${linkId}, ${occurrenceId}, 'ACCEPTED', 'ses-id')
        `
        await client`
            INSERT INTO push_histories (user_id, link_id, occurrence_id, push_token_id, status, ticket_id)
            VALUES (${userId}, ${linkId}, ${occurrenceId}, ${tokenId}, 'RECEIPT_OK', 'ticket-id')
        `
    })

    it('토큰 삭제는 이력을 보존하고 링크 영구 삭제는 이력을 함께 삭제한다', async () => {
        await client`
            INSERT INTO email_histories (link_id, occurrence_id) VALUES (${linkId}, ${occurrenceId})
        `
        await client`
            INSERT INTO push_histories (user_id, link_id, occurrence_id, push_token_id)
            VALUES (${userId}, ${linkId}, ${occurrenceId}, ${tokenId})
        `
        await client`DELETE FROM push_tokens WHERE id = ${tokenId}`
        const rows = await client`
            SELECT user_id, push_token_id FROM push_histories WHERE link_id = ${linkId}
        `
        expect(rows).toHaveLength(1)
        expect(rows[0].push_token_id).toBeNull()
        expect(rows[0].user_id).toBe(userId)
        await client`DELETE FROM links WHERE id = ${linkId}`
        expect(
            await client`SELECT id FROM email_histories WHERE link_id = ${linkId}`,
        ).toHaveLength(0)
        expect(
            await client`SELECT id FROM push_histories WHERE link_id = ${linkId}`,
        ).toHaveLength(0)
    })

    it('동일 회차의 여러 토큰 삭제 후에도 소유자·ticket·상태를 보존하고 receipt 결과를 갱신한다', async () => {
        const [otherToken] = await client`
            INSERT INTO push_tokens (user_id, token, platform)
            VALUES (${userId}, ${randomUUID()}, 'android') RETURNING id
        `
        await client`
            INSERT INTO push_histories (user_id, link_id, occurrence_id, push_token_id, status, ticket_id)
            VALUES (${userId}, ${linkId}, ${occurrenceId}, ${tokenId}, 'ACCEPTED', 'ticket-1'),
                   (${userId}, ${linkId}, ${occurrenceId}, ${otherToken.id as string}, 'ACCEPTED', 'ticket-2')
        `
        await client`DELETE FROM push_tokens WHERE user_id = ${userId}`
        const rows = await client`
            SELECT user_id, push_token_id, status, ticket_id FROM push_histories
            WHERE link_id = ${linkId} ORDER BY ticket_id
        `
        expect([...rows]).toEqual(
            ['ticket-1', 'ticket-2'].map((ticketId) => ({
                user_id: userId,
                push_token_id: null,
                status: 'ACCEPTED',
                ticket_id: ticketId,
            })),
        )
        await client`
            UPDATE push_histories SET status = 'RECEIPT_OK' WHERE link_id = ${linkId}
        `
        const updated = await client`
            SELECT status FROM push_histories WHERE link_id = ${linkId}
        `
        expect([...updated]).toEqual([
            { status: 'RECEIPT_OK' },
            { status: 'RECEIPT_OK' },
        ])
    })

    it('사용자 영구 삭제는 토큰과 설정을 함께 삭제한다', async () => {
        await client`
            INSERT INTO notification_settings (user_id, channel, enabled) VALUES (${userId}, 'push', true)
        `
        await client`
            INSERT INTO push_histories (user_id, link_id, occurrence_id, push_token_id)
            VALUES (${userId}, ${linkId}, ${occurrenceId}, ${tokenId})
        `
        await client`DELETE FROM users WHERE id = ${userId}`
        expect(
            await client`SELECT id FROM push_tokens WHERE user_id = ${userId}`,
        ).toHaveLength(0)
        expect(
            await client`SELECT id FROM notification_settings WHERE user_id = ${userId}`,
        ).toHaveLength(0)
        const [history] = await client`
            SELECT user_id, push_token_id FROM push_histories WHERE link_id = ${linkId}
        `
        expect(history).toEqual({ user_id: userId, push_token_id: null })
    })
})
