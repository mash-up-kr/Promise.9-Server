import { HttpException, HttpStatus } from '@nestjs/common'

export interface ErrorResponse {
    statusCode: number
    errorCode: string
    message: string
    timestamp: string
}

export class BaseException extends HttpException {
    constructor(statusCode: HttpStatus, errorCode: string, message: string) {
        super(
            {
                statusCode,
                errorCode,
                message,
                timestamp: new Date().toISOString(),
            },
            statusCode,
        )

        Error.captureStackTrace(this, new.target)
    }
}
