import { Attributes } from '@opentelemetry/api'
import { BatchSpanProcessor, ReadableSpan } from '@opentelemetry/sdk-trace'

import { sanitizeText } from './redaction'

// 원본 URL·쿼리·IP·헤더·SQL은 수집하지 않는다. 새 계측을 추가할 때도 명시적으로 확장한다.
const ALLOWED_ATTRIBUTES = new Set([
    'http.request.method',
    'http.method',
    'http.response.status_code',
    'http.status_code',
    'http.route',
    'http.scheme',
    'http.flavor',
    'url.scheme',
    'server.address',
    'server.port',
    'network.protocol.version',
    'net.peer.name',
    'net.peer.port',
    'net.host.name',
    'net.host.port',
    'error.type',
    'request.id',
    'exception.type',
    'exception.message',
    'exception.stacktrace',
    'nestjs.type',
    'nestjs.version',
    'nestjs.module',
    'nestjs.controller',
    'nestjs.callback',
    'express.type',
    'express.name',
    'code.function.name',
    'code.namespace',
])

function sanitizeAttributes(attributes: Attributes): Attributes {
    return Object.fromEntries(
        Object.entries(attributes)
            .filter(([key]) => ALLOWED_ATTRIBUTES.has(key))
            .map(([key, value]) => [
                key,
                typeof value === 'string' ? sanitizeText(value) : value,
            ]),
    )
}

export class RedactingSpanProcessor extends BatchSpanProcessor {
    override onEnd(span: ReadableSpan): void {
        super.onEnd({
            kind: span.kind,
            parentSpanContext: span.parentSpanContext,
            startTime: span.startTime,
            endTime: span.endTime,
            duration: span.duration,
            ended: span.ended,
            resource: span.resource,
            instrumentationScope: span.instrumentationScope,
            droppedAttributesCount: span.droppedAttributesCount,
            droppedEventsCount: span.droppedEventsCount,
            droppedLinksCount: span.droppedLinksCount,
            spanContext: () => span.spanContext(),
            name: sanitizeText(span.name),
            attributes: sanitizeAttributes(span.attributes),
            status: {
                ...span.status,
                message:
                    span.status.message && sanitizeText(span.status.message),
            },
            events: span.events.map((event) => ({
                ...event,
                attributes: sanitizeAttributes(event.attributes ?? {}),
            })),
            links: span.links.map((link) => ({
                ...link,
                attributes: sanitizeAttributes(link.attributes ?? {}),
            })),
        })
    }
}
