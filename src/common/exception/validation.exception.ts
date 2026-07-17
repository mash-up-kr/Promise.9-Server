import { HttpStatus } from '@nestjs/common'

import { BaseException } from './base.exception'
import { COMMON_ERROR } from './common-error-code.constant'

export class ValidationException extends BaseException {
    constructor(message: string) {
        super({
            code: HttpStatus.BAD_REQUEST,
            errorCode: COMMON_ERROR.VALIDATION.errorCode,
            message,
        })
    }
}
