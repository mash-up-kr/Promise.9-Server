import { HttpException, HttpStatus } from '@nestjs/common'

export interface ErrorResponse {
    success: boolean
    error: ErrorData
}

export interface ErrorData {
    code: number
    errorCode: string
    message: string
    timestamp: string
}

export class BaseException extends HttpException {
    constructor(code: HttpStatus, errorCode: string, message: string) {
        super(
            {
                success: false,
                error: {
                    code,
                    errorCode,
                    message,
                    timestamp: new Date().toISOString(),
                },
            },
            code,
        )

        Error.captureStackTrace(this, new.target)
    }
}
