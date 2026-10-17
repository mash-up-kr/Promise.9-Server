import { randomUUID } from 'node:crypto'
import { performance } from 'node:perf_hooks'

import { Logger } from '@nestjs/common'
import {
    context,
    isSpanContextValid,
    SpanStatusCode,
    trace,
} from '@opentelemetry/api'
import { NextFunction, Request, Response } from 'express'

import { recordHttpRequest } from '../http/http-metrics'
import { getRequestRoute, isHealthCheck } from '../http/http-request.util'
import { requestContext } from '../http/request-context'

const logger = new Logger('HTTP')

export function httpLoggerMiddleware(
    req: Request,
    res: Response,
    next: NextFunction,
) {
    const requestId = randomUUID()
    const activeContext = context.active()
    const serverSpan = trace.getSpan(activeContext)
    const spanContext = serverSpan?.spanContext()
    const startedAt = performance.now()
    let completed = false

    res.setHeader('x-request-id', requestId)
    serverSpan?.setAttribute('request.id', requestId)
    if (spanContext && isSpanContextValid(spanContext))
        res.setHeader('x-trace-id', spanContext.traceId)

    const finish = (aborted: boolean) => {
        if (completed) return
        completed = true
        if (
            !aborted &&
            res.statusCode < 400 &&
            isHealthCheck(req.method, req.path)
        )
            return

        // finish/close가 다른 async context에서 발생해도 이 요청의 ID를 유지한다.
        context.with(activeContext, () =>
            requestContext.run({ requestId }, () => {
                const route = getRequestRoute(req)
                const durationMs =
                    Math.round((performance.now() - startedAt) * 100) / 100
                // 응답 전에 연결이 끊겼으면 실제 HTTP 응답이 없으므로 메트릭에 0으로 기록한다.
                const statusCode = aborted ? 0 : res.statusCode
                // close에서는 HTTP 계측이 먼저 span을 끝냈을 수 있다.
                if (serverSpan?.isRecording()) {
                    serverSpan.updateName(`${req.method} ${route}`)
                    serverSpan.setAttribute('http.route', route)
                    if (aborted)
                        serverSpan.setStatus({ code: SpanStatusCode.ERROR })
                }
                recordHttpRequest(
                    req.method,
                    route,
                    statusCode,
                    durationMs,
                    aborted,
                )

                const entry = {
                    event: 'http.request',
                    method: req.method,
                    route,
                    status_code: statusCode,
                    duration_ms: durationMs,
                    aborted,
                    error_code: res.locals.errorCode as number | undefined,
                }
                if (aborted || statusCode >= 500) logger.warn(entry)
                else logger.log(entry)
            }),
        )
    }

    res.once('finish', () => finish(false))
    res.once('close', () => finish(!res.writableFinished))
    requestContext.run({ requestId }, next)
}
