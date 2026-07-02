import { HttpStatus } from '@nestjs/common'

import { BaseException } from '../../common/exception/base.exception'

import { FOLDER_ERROR_CODE } from './folder-error-code.constant'

export class FolderNotFoundException extends BaseException {
    constructor() {
        super(
            HttpStatus.NOT_FOUND,
            FOLDER_ERROR_CODE.NOT_FOUND,
            '폴더를 찾을 수 없습니다.',
        )
    }
}

export class FolderNameDuplicateException extends BaseException {
    constructor() {
        super(
            HttpStatus.CONFLICT,
            FOLDER_ERROR_CODE.NAME_DUPLICATE,
            '이미 존재하는 폴더 이름입니다.',
        )
    }
}
