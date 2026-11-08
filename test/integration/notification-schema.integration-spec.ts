import { randomUUID } from 'node:crypto'
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
            INSERT INTO push_histories (link_id, occurrence_id, push_token_id)
            VALUES (${linkId}, ${occurrenceId}, -1)
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
            INSERT INTO push_histories (link_id, occurrence_id, push_token_id)
            VALUES (${linkId}, ${occurrenceId}, ${tokenId})
        `
        await expect(client`
            INSERT INTO email_histories (link_id, occurrence_id) VALUES (${linkId}, ${occurrenceId})
        `).rejects.toMatchObject({ code: '23505' })
        await expect(client`
            INSERT INTO push_histories (link_id, occurrence_id, push_token_id)
            VALUES (${linkId}, ${occurrenceId}, ${tokenId})
        `).rejects.toMatchObject({ code: '23505' })
        const [other] = await client`
            INSERT INTO push_tokens (user_id, token, platform)
            VALUES (${userId}, ${randomUUID()}, 'android') RETURNING id
        `
        await client`
            INSERT INTO push_histories (link_id, occurrence_id, push_token_id)
            VALUES (${linkId}, ${occurrenceId}, ${other.id as string}),
                   (${linkId}, ${randomUUID()}, ${tokenId})
        `
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
                INSERT INTO push_histories (link_id, occurrence_id, push_token_id, status)
                VALUES (${linkId}, ${occurrenceId}, ${tokenId}, ${status})
            `).rejects.toMatchObject({ code: '23514' })
        }
        await client`
            INSERT INTO email_histories (link_id, occurrence_id, status, ses_message_id)
            VALUES (${linkId}, ${occurrenceId}, 'ACCEPTED', 'ses-id')
        `
        await client`
            INSERT INTO push_histories (link_id, occurrence_id, push_token_id, status, ticket_id)
            VALUES (${linkId}, ${occurrenceId}, ${tokenId}, 'RECEIPT_OK', 'ticket-id')
        `
    })

    it('토큰 삭제는 이력을 보존하고 링크 영구 삭제는 이력을 함께 삭제한다', async () => {
        await client`
            INSERT INTO email_histories (link_id, occurrence_id) VALUES (${linkId}, ${occurrenceId})
        `
        await client`
            INSERT INTO push_histories (link_id, occurrence_id, push_token_id)
            VALUES (${linkId}, ${occurrenceId}, ${tokenId})
        `
        await client`DELETE FROM push_tokens WHERE id = ${tokenId}`
        const rows =
            await client`SELECT push_token_id FROM push_histories WHERE link_id = ${linkId}`
        expect(rows).toHaveLength(1)
        expect(rows[0].push_token_id).toBeNull()
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
        await client`DELETE FROM users WHERE id = ${userId}`
        expect(
            await client`SELECT id FROM push_tokens WHERE user_id = ${userId}`,
        ).toHaveLength(0)
        expect(
            await client`SELECT id FROM notification_settings WHERE user_id = ${userId}`,
        ).toHaveLength(0)
    })
})
