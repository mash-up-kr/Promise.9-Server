import { HttpException, HttpStatus } from '@nestjs/common'

export interface ErrorResponse {
    success: boolean
    error: ErrorData
}

export interface ErrorData {
    code: number
    errorCode: number
    message: string
    timestamp: string
}

export class BaseException extends HttpException {
    constructor({
        code,
        errorCode,
        message,
        data,
    }: {
        code: HttpStatus
        errorCode: number
        message: string
        // 클라이언트가 후속 처리에 쓸 수 있는 부가 정보 (예: 중복 충돌 시 기존 리소스 ID)
        data?: Record<string, unknown>
    }) {
        super(
            {
                success: false,
                error: {
                    code,
                    errorCode,
                    message,
                    timestamp: new Date().toISOString(),
                    ...data,
                },
            },
            code,
        )

        Error.captureStackTrace(this, new.target)
    }
}
