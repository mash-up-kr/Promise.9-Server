import { randomUUID } from 'node:crypto'

import { z } from 'zod'

import { RuntimeEnvironment } from '../../config/environment'

import { FIREHOSE_LIMITS } from './analytics.constants'

const nullableString = z.string().nullable().default(null)
const attributionSchema = z.strictObject({
    touch_id: nullableString,
    model: nullableString,
    scope: z.enum(['anonymous', 'user']).nullable().default(null),
    captured_at: z.iso.datetime().nullable().default(null),
    utm_source: nullableString,
    utm_medium: nullableString,
    utm_campaign: nullableString,
    utm_content: nullableString,
    utm_term: nullableString,
})

const serverEventSchema = z.strictObject({
    event_id: z
        .string()
        .min(1)
        .default(() => randomUUID()),
    event_name: z.string().trim().min(1),
    occurred_at: z.iso.datetime().default(() => new Date().toISOString()),
    platform: z.enum(['web', 'app', 'extension']).nullable().default(null),
    anonymous_id: nullableString,
    user_id: nullableString,
    session_id: nullableString,
    operation_id: nullableString,
    attribution: attributionSchema.nullable().default(null),
    properties: z.record(z.string(), z.json()).default({}),
})

export type ServerAnalyticsEvent = z.input<typeof serverEventSchema>

/** 큐 삽입 시점에 직렬화해 UTM과 properties를 변경 불가능한 스냅샷으로 만든다. */
export function serializeServerEvent(
    input: ServerAnalyticsEvent,
    environment: RuntimeEnvironment,
): { eventId: string; data: Buffer } {
    const { properties, ...event } = serverEventSchema.parse(input)
    const data = Buffer.from(
        JSON.stringify({
            schema_version: 1,
            ...event,
            source: 'server',
            environment,
            properties_json: JSON.stringify(properties),
        }) + '\n',
        'utf8',
    )
    if (data.length > FIREHOSE_LIMITS.maxRecordBytes) {
        throw new Error('Analytics event exceeds Firehose record size limit')
    }
    return { eventId: event.event_id, data }
}
