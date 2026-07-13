import {
    ArgumentsHost,
    Catch,
    ExceptionFilter,
    HttpException,
    HttpStatus,
    Logger,
} from '@nestjs/common'
import { Response } from 'express'

import { BaseException, ErrorResponse } from '../exception/base.exception'
import { COMMON_ERROR } from '../exception/common-error-code.constant'

@Catch(HttpException)
export class GlobalExceptionFilter implements ExceptionFilter<HttpException> {
    private readonly logger = new Logger(GlobalExceptionFilter.name)

    catch(exception: HttpException, host: ArgumentsHost) {
        const ctx = host.switchToHttp()
        const response = ctx.getResponse<Response>()
        const body = this.toErrorResponse(exception)

        this.log(exception, body.error.code)

        response.status(body.error.code).json(body)
    }

    // baseException 기반의 예외는 그대로 사용하고, 아닌 경우(httpException)는 공통 포맷으로 감싸는 과정 진행
    private toErrorResponse(exception: HttpException): ErrorResponse {
        if (exception instanceof BaseException) {
            return exception.getResponse() as ErrorResponse
        }

        return this.fromHttpException(exception)
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
    private log(exception: HttpException, statusCode: number) {
        const logLevel = statusCode >= 500 ? 'error' : 'warn'
        this.logger[logLevel](exception.message, exception.stack)
    }
}
