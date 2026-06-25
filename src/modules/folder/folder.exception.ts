import { HttpStatus } from '@nestjs/common'

import { BaseException } from '../../common/exception/base.exception'

export class FolderNotFoundException extends BaseException {
    constructor() {
        super(
            HttpStatus.NOT_FOUND,
            'FOLDER_NOT_FOUND',
            '폴더를 찾을 수 없습니다.',
        )
    }
}
