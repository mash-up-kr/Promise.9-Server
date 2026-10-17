import {
    ArgumentsHost,
    Catch,
    ExceptionFilter,
    HttpException,
    HttpStatus,
    Logger,
} from '@nestjs/common'
import { SpanStatusCode, trace } from '@opentelemetry/api'
import { Request, Response } from 'express'

import { getRequestRoute } from '../../infrastructure/observability/http-request'
import { sanitizeText } from '../../infrastructure/observability/redaction'
import { BaseException, ErrorResponse } from '../exception/base.exception'
import { COMMON_ERROR } from '../exception/common-error-code.constant'

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
    private readonly logger = new Logger(GlobalExceptionFilter.name)

    catch(exception: unknown, host: ArgumentsHost) {
        const ctx = host.switchToHttp()
        const request = ctx.getRequest<Request>()
        const response = ctx.getResponse<Response>()
        const body = this.toErrorResponse(exception)

        this.log(exception, request, body)

        response.locals.errorCode = body.error.errorCode
        if (response.headersSent) {
            response.end()
            return
        }
        response.status(body.error.code).json(body)
    }

    // baseException 기반의 예외는 그대로 사용하고, 아닌 경우(httpException)는 공통 포맷으로 감싸는 과정 진행
    private toErrorResponse(exception: unknown): ErrorResponse {
        if (exception instanceof BaseException) {
            return exception.getResponse() as ErrorResponse
        }

        if (exception instanceof HttpException)
            return this.fromHttpException(exception)

        // Express/body-parser의 http-errors도 기존 4xx 상태를 보존한다.
        // 예: 본문 크기 초과(413), 지원하지 않는 content-encoding(415).
        if (
            exception instanceof Error &&
            'statusCode' in exception &&
            typeof exception.statusCode === 'number' &&
            Number.isInteger(exception.statusCode) &&
            exception.statusCode >= 400 &&
            exception.statusCode < 500 &&
            'expose' in exception &&
            exception.expose === true
        ) {
            return this.fromHttpException(
                new HttpException(exception.message, exception.statusCode),
            )
        }

        return {
            success: false,
            error: {
                ...COMMON_ERROR.INTERNAL_SERVER_ERROR,
                timestamp: new Date().toISOString(),
            },
        }
    }

    // Nest 기본 HttpException을 공통 포맷으로 감싸기
    private fromHttpException(exception: HttpException): ErrorResponse {
        const code = exception.getStatus()
        const response = exception.getResponse()

        return {
            success: false,
            error: {
                code,
                errorCode: this.getErrorCode(code, response),
                message: this.getMessage(response, exception.message),
                timestamp: new Date().toISOString(),
            },
        }
    }

    // 명시된 errorCode가 있으면 사용하고 없으면 공통 내부 서버 에러 코드를 사용
    private getErrorCode(
        statusCode: HttpStatus,
        response?: string | object,
    ): number {
        if (
            response &&
            typeof response === 'object' &&
            'errorCode' in response &&
            typeof response.errorCode === 'number'
        ) {
            return response.errorCode
        }

        // 명시적 errorCode가 없는 400 응답은 요청 값 검증 실패로 분류하고,
        // 그 외 Nest 기본 HttpException은 공통 서버 오류 코드로 처리한다.
        return statusCode === HttpStatus.BAD_REQUEST
            ? COMMON_ERROR.VALIDATION.errorCode
            : COMMON_ERROR.INTERNAL_SERVER_ERROR.errorCode
    }

    // httpException용, Nest 기본 응답의 message가 문자열일 때만 사용하고 아니면 예외 메시지로 대체
    private getMessage(response: string | object, fallback: string): string {
        return typeof response === 'object' &&
            'message' in response &&
            typeof response.message === 'string'
            ? response.message
            : fallback
    }

    // 에러에 대한 Log 기록 함수
    private log(exception: unknown, request: Request, body: ErrorResponse) {
        const { code, errorCode, message } = body.error
        const summary = {
            event: 'http.exception',
            method: request.method,
            route: getRequestRoute(request),
            status_code: code,
            error_code: errorCode,
            message,
        }

        // 5xx는 서버가 확인해야 할 실제 문제이므로 스택트레이스와 함께 error로 남긴다.
        if (code >= 500) {
            const span = trace.getActiveSpan()
            span?.setStatus({ code: SpanStatusCode.ERROR })
            if (exception instanceof Error) {
                span?.recordException({
                    name: exception.name,
                    message: sanitizeText(exception.message),
                    stack: exception.stack && sanitizeText(exception.stack),
                })
            }
            this.logger.error({ ...summary, error: exception })
            return
        }

        // 4xx는 정상적인 클라이언트 오류이므로 스택트레이스 없이 debug 수준으로만 남긴다.
        this.logger.debug(summary)
    }
}
