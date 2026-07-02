import { HttpStatus } from '@nestjs/common'

import { BaseException } from './base.exception'
import { COMMON_ERROR_CODE } from './common-error-code.constant'

export class ValidationException extends BaseException {
    constructor(message: string) {
        super(HttpStatus.BAD_REQUEST, COMMON_ERROR_CODE.VALIDATION, message)
    }
}
