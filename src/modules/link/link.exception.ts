import { HttpStatus } from '@nestjs/common'

import { BaseException } from '../../common/exception/base.exception'

import { LINK_ERROR_CODE } from './link-error-code.constant'

export class LinkNotFoundException extends BaseException {
    constructor() {
        super(
            HttpStatus.NOT_FOUND,
            LINK_ERROR_CODE.NOT_FOUND,
            '링크를 찾을 수 없습니다.',
        )
    }
}

export class LinkNotDeletedException extends BaseException {
    constructor() {
        super(
            HttpStatus.CONFLICT,
            LINK_ERROR_CODE.NOT_DELETED,
            '삭제된 링크가 아니므로 복구할 수 없습니다.',
        )
    }
}

export class LinkAlreadyExistsException extends BaseException {
    constructor() {
        super(
            HttpStatus.CONFLICT,
            LINK_ERROR_CODE.ALREADY_EXISTS,
            '이미 저장한 링크입니다.',
        )
    }
}
