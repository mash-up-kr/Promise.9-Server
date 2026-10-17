import { AsyncLocalStorage } from 'node:async_hooks'

import { isSpanContextValid, trace, TraceFlags } from '@opentelemetry/api'

export const requestContext = new AsyncLocalStorage<{ requestId: string }>()

export function getLogCorrelation() {
    const span = trace.getActiveSpan()?.spanContext()

    return {
        request_id: requestContext.getStore()?.requestId,
        ...(span && isSpanContextValid(span)
            ? {
                  trace_id: span.traceId,
                  span_id: span.spanId,
                  trace_sampled: Boolean(span.traceFlags & TraceFlags.SAMPLED),
              }
            : {}),
    }
}
