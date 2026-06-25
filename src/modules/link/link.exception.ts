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
