import { Logger } from '@nestjs/common'
import { NextFunction, Request, Response } from 'express'

const logger = new Logger('HTTP')

// 모든 요청의 method·url·status·소요시간을 응답 완료 시점에 남기는 접근 로그.
// res의 'finish' 이벤트를 써서 예외로 끝난 요청까지 최종 상태코드를 기록한다.
export function httpLoggerMiddleware(
    req: Request,
    res: Response,
    next: NextFunction,
) {
    const { method, originalUrl } = req
    const startedAt = Date.now()

    res.on('finish', () => {
        const { statusCode } = res
        const durationMs = Date.now() - startedAt
        const message = `${method} ${originalUrl} ${statusCode} ${durationMs}ms`

        // 5xx만 경고로 눈에 띄게, 그 외(정상·4xx)는 일반 접근 로그로 남긴다.
        if (statusCode >= 500) {
            logger.warn(message)
        } else {
            logger.log(message)
        }
    })

    next()
}
