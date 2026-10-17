import { metrics } from '@opentelemetry/api'

const meter = metrics.getMeter('promise9.http')
const requests = meter.createCounter('promise9.http.server.requests', {
    description: 'Completed or aborted HTTP requests',
})
const duration = meter.createHistogram('promise9.http.server.duration', {
    unit: 's',
    description: 'HTTP request duration including error responses',
    advice: {
        explicitBucketBoundaries: [
            0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10,
        ],
    },
})

export function recordHttpRequest(
    method: string,
    route: string,
    statusCode: number,
    durationMs: number,
    aborted: boolean,
): void {
    const attributes = {
        'http.request.method': method,
        'http.route': route,
        'http.response.status_code': statusCode,
        'request.aborted': aborted,
    }
    requests.add(1, attributes)
    duration.record(durationMs / 1000, attributes)
}
