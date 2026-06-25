import { HttpStatus } from '@nestjs/common'

import { BaseException } from './base.exception'

export class ValidationException extends BaseException {
    constructor(message: string) {
        super(HttpStatus.BAD_REQUEST, 'VALIDATION_ERROR', message)
    }
}
