import { serializeServerEvent } from './analytics-event'

describe('serializeServerEvent', () => {
    it('서버 출처와 공통 필드를 채우고 이벤트 속성을 JSON 문자열로 저장한다', () => {
        const result = serializeServerEvent(
            {
                event_name: 'link_saved',
                user_id: '123',
                properties: { link_id: 42, tags: ['study'] },
            },
            'production',
        )
        const event = JSON.parse(result.data.toString()) as {
            event_id: string
            attribution: { utm_source: string }
            properties_json: string
        }
        expect(event).toMatchObject({
            schema_version: 1,
            source: 'server',
            environment: 'production',
            user_id: '123',
            anonymous_id: null,
            attribution: null,
            properties_json: '{"link_id":42,"tags":["study"]}',
        })
        expect(event.event_id).toBe(result.eventId)
        expect(event).not.toHaveProperty('properties')
    })

    it('호출 이후 속성이나 UTM이 변경되어도 기존 이벤트를 유지한다', () => {
        const input = {
            event_name: 'signup_completed',
            properties: { step: 1 },
            attribution: { utm_source: 'newsletter' },
        }
        const result = serializeServerEvent(input, 'production')
        input.properties.step = 2
        input.attribution.utm_source = 'other'
        const event = JSON.parse(result.data.toString()) as {
            event_id: string
            attribution: { utm_source: string }
            properties_json: string
        }
        expect(event.attribution.utm_source).toBe('newsletter')
        expect(event.properties_json).toBe('{"step":1}')
    })

    it('빈 이름, 잘못된 날짜, JSON이 아닌 속성, 초과 크기를 전송 전에 거부한다', () => {
        expect(() =>
            serializeServerEvent({ event_name: '' }, 'production'),
        ).toThrow()
        expect(() =>
            serializeServerEvent(
                { event_name: 'test', occurred_at: 'yesterday' },
                'production',
            ),
        ).toThrow()
        expect(() =>
            serializeServerEvent(
                { event_name: 'test', properties: { value: Infinity } },
                'production',
            ),
        ).toThrow()
        expect(() =>
            serializeServerEvent(
                {
                    event_name: 'test',
                    properties: { value: '가'.repeat(400_000) },
                },
                'production',
            ),
        ).toThrow('record size limit')
    })
})
