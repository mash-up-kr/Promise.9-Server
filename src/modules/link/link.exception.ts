import { HttpStatus } from '@nestjs/common'

import { BaseException } from '../../common/exception/base.exception'

export class LinkNotFoundException extends BaseException {
    constructor() {
        super(
            HttpStatus.NOT_FOUND,
            'LINK_NOT_FOUND',
            '링크를 찾을 수 없습니다.',
        )
    }
}

export class LinkNotDeletedException extends BaseException {
    constructor() {
        super(
            HttpStatus.CONFLICT,
            'LINK_NOT_DELETED',
            '삭제된 링크가 아니므로 복구할 수 없습니다.',
        )
    }
}
