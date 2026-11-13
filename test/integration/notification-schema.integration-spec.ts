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
        await client`
            INSERT INTO push_tokens (user_id, token, platform)
            VALUES (${userId}, ${token}, 'ios')
        `
    })

    afterEach(async () => {
        await client`DELETE FROM links WHERE id = ${linkId}`
        await client`DELETE FROM users WHERE id = ${userId}`
    })

    afterAll(async () => {
        await client.end()
    })

    it('0018은 기존 이력을 보존하고 이메일 소유자를 보강하며 토큰 참조만 제거한다', async () => {
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
                INSERT INTO users VALUES (1);
                INSERT INTO links (id, user_id) VALUES (10, 1);
                INSERT INTO push_tokens (user_id, token, platform)
                VALUES (1, 'original-token', 'ios'), (1, 'deleted-token', 'android');
                INSERT INTO push_histories (link_id, occurrence_id, push_token_id, status, ticket_id)
                SELECT 10, '00000000-0000-0000-0000-000000000001', id, 'ACCEPTED', token FROM push_tokens;
                INSERT INTO email_histories (link_id, occurrence_id, status, ses_message_id)
                VALUES (10, '00000000-0000-0000-0000-000000000001', 'ACCEPTED', 'ses-id');
                DELETE FROM push_tokens WHERE token = 'deleted-token';
            `)
            await tx.unsafe(migration('0017_push_history_owner.sql'))
            const before =
                await tx`SELECT id, user_id, link_id, occurrence_id, status, ticket_id, created_at, updated_at FROM push_histories ORDER BY id`
            await tx.unsafe(
                migration('0018_notification_history_references.sql'),
            )
            expect([
                ...(await tx`SELECT * FROM push_histories ORDER BY id`),
            ]).toEqual(before.map((row) => ({ ...row, error_code: null })))
            const [email] =
                await tx`SELECT user_id, status, ses_message_id FROM email_histories`
            expect(email).toEqual({
                user_id: '1',
                status: 'ACCEPTED',
                ses_message_id: 'ses-id',
            })
            const [column] = await tx`
                SELECT count(*)::integer AS count FROM information_schema.columns
                WHERE table_schema = ${schemaName} AND table_name = 'push_histories' AND column_name = 'push_token_id'
            `
            expect(column.count).toBe(0)
            await tx`DELETE FROM push_tokens`
            expect(await tx`SELECT id FROM push_histories`).toHaveLength(2)
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

    it('존재하지 않는 사용자와 링크 참조를 거부한다', async () => {
        await expect(client`
            INSERT INTO push_tokens (user_id, token, platform) VALUES (-1, ${randomUUID()}, 'ios')
        `).rejects.toMatchObject({ code: '23503' })
        await expect(client`
            INSERT INTO email_histories (user_id, link_id, occurrence_id) VALUES (${userId}, -1, ${occurrenceId})
        `).rejects.toMatchObject({ code: '23503' })
        await expect(client`
            INSERT INTO push_histories (user_id, link_id, occurrence_id) VALUES (${userId}, -1, ${occurrenceId})
        `).rejects.toMatchObject({ code: '23503' })
    })

    it('이메일 회차 중복은 거부하고 같은 회차의 푸시 결과는 각각 저장한다', async () => {
        await client`UPDATE links SET reminder_occurrence_id = ${occurrenceId} WHERE id = ${linkId}`
        const [link] =
            await client`SELECT reminder_occurrence_id FROM links WHERE id = ${linkId}`
        expect(link.reminder_occurrence_id).toBe(occurrenceId)
        await client`
            INSERT INTO email_histories (user_id, link_id, occurrence_id) VALUES (${userId}, ${linkId}, ${occurrenceId})
        `
        await expect(client`
            INSERT INTO email_histories (user_id, link_id, occurrence_id) VALUES (${userId}, ${linkId}, ${occurrenceId})
        `).rejects.toMatchObject({ code: '23505' })
        await client`
            INSERT INTO push_histories (user_id, link_id, occurrence_id, status, ticket_id)
            VALUES (${userId}, ${linkId}, ${occurrenceId}, 'ACCEPTED', 'ticket-1'),
                   (${userId}, ${linkId}, ${occurrenceId}, 'ACCEPTED', 'ticket-2')
        `
        const rows =
            await client`SELECT ticket_id FROM push_histories WHERE link_id = ${linkId} ORDER BY ticket_id`
        expect([...rows]).toEqual([
            { ticket_id: 'ticket-1' },
            { ticket_id: 'ticket-2' },
        ])
    })

    it.each(['email_histories', 'push_histories'])(
        '%s는 링크와 다른 회원의 이력 생성·소유자 변경을 거부한다',
        async (table) => {
            const [otherUser] = await client`
            INSERT INTO users (email) VALUES (${`${randomUUID()}@example.com`}) RETURNING id
        `
            const otherUserId = otherUser.id as string
            try {
                await expect(client`
                INSERT INTO ${client(table)} (user_id, link_id, occurrence_id)
                VALUES (NULL, ${linkId}, ${occurrenceId})
            `).rejects.toMatchObject({ code: '23502' })
                await expect(client`
                INSERT INTO ${client(table)} (user_id, link_id, occurrence_id)
                VALUES (${otherUserId}, ${linkId}, ${occurrenceId})
            `).rejects.toMatchObject({ code: '23503' })
                await client`
                INSERT INTO ${client(table)} (user_id, link_id, occurrence_id)
                VALUES (${userId}, ${linkId}, ${occurrenceId})
            `
                await expect(client`
                UPDATE ${client(table)} SET user_id = ${otherUserId} WHERE link_id = ${linkId}
            `).rejects.toMatchObject({ code: '23503' })
                await expect(client`
                UPDATE links SET user_id = ${otherUserId} WHERE id = ${linkId}
            `).rejects.toMatchObject({ code: '23503' })
            } finally {
                await client`DELETE FROM users WHERE id = ${otherUserId}`
            }
        },
    )

    it('잘못된 상태와 제공자 ID 없는 접수 성공을 거부한다', async () => {
        for (const status of ['INVALID', 'ACCEPTED']) {
            await expect(client`
                INSERT INTO email_histories (user_id, link_id, occurrence_id, status)
                VALUES (${userId}, ${linkId}, ${occurrenceId}, ${status})
            `).rejects.toMatchObject({ code: '23514' })
        }
        for (const status of ['INVALID', 'ACCEPTED', 'RECEIPT_OK']) {
            await expect(client`
                INSERT INTO push_histories (user_id, link_id, occurrence_id, status)
                VALUES (${userId}, ${linkId}, ${occurrenceId}, ${status})
            `).rejects.toMatchObject({ code: '23514' })
        }
        await client`
            INSERT INTO email_histories (user_id, link_id, occurrence_id, status, ses_message_id)
            VALUES (${userId}, ${linkId}, ${occurrenceId}, 'ACCEPTED', 'ses-id')
        `
        await client`
            INSERT INTO push_histories (user_id, link_id, occurrence_id, status, ticket_id)
            VALUES (${userId}, ${linkId}, ${occurrenceId}, 'RECEIPT_OK', 'ticket-id')
        `
    })

    it('토큰 삭제와 관계없이 이력을 보존하고 receipt 결과를 갱신한다', async () => {
        await client`
            INSERT INTO email_histories (user_id, link_id, occurrence_id) VALUES (${userId}, ${linkId}, ${occurrenceId})
        `
        await client`
            INSERT INTO push_histories (user_id, link_id, occurrence_id, status, ticket_id)
            VALUES (${userId}, ${linkId}, ${occurrenceId}, 'ACCEPTED', 'ticket-1'),
                   (${userId}, ${linkId}, ${occurrenceId}, 'ACCEPTED', 'ticket-2')
        `
        const before =
            await client`SELECT * FROM push_histories WHERE link_id = ${linkId} ORDER BY id`
        await client`DELETE FROM push_tokens WHERE user_id = ${userId}`
        expect([
            ...(await client`SELECT * FROM push_histories WHERE link_id = ${linkId} ORDER BY id`),
        ]).toEqual([...before])
        await client`UPDATE push_histories SET status = 'RECEIPT_OK' WHERE link_id = ${linkId}`
        const updated =
            await client`SELECT status FROM push_histories WHERE link_id = ${linkId}`
        expect([...updated]).toEqual([
            { status: 'RECEIPT_OK' },
            { status: 'RECEIPT_OK' },
        ])
        await client`DELETE FROM links WHERE id = ${linkId}`
        expect(
            await client`SELECT id FROM email_histories WHERE link_id = ${linkId}`,
        ).toHaveLength(0)
        expect(
            await client`SELECT id FROM push_histories WHERE link_id = ${linkId}`,
        ).toHaveLength(0)
    })

    it('사용자 영구 삭제는 토큰과 설정을 함께 삭제한다', async () => {
        await client`
            INSERT INTO notification_settings (user_id, channel, enabled) VALUES (${userId}, 'push', true)
        `
        await client`
            INSERT INTO push_histories (user_id, link_id, occurrence_id)
            VALUES (${userId}, ${linkId}, ${occurrenceId})
        `
        await client`DELETE FROM users WHERE id = ${userId}`
        expect(
            await client`SELECT id FROM push_tokens WHERE user_id = ${userId}`,
        ).toHaveLength(0)
        expect(
            await client`SELECT id FROM notification_settings WHERE user_id = ${userId}`,
        ).toHaveLength(0)
        const [history] = await client`
            SELECT user_id FROM push_histories WHERE link_id = ${linkId}
        `
        expect(history).toEqual({ user_id: userId })
    })
})
