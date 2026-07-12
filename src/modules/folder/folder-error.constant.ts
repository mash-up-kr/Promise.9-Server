import { HttpStatus } from '@nestjs/common'

export const FOLDER_ERROR = {
    NOT_FOUND: {
        code: HttpStatus.NOT_FOUND,
        errorCode: 201001,
        message: '폴더를 찾을 수 없습니다.',
    },
    NAME_DUPLICATE: {
        code: HttpStatus.CONFLICT,
        errorCode: 202001,
        message: '이미 존재하는 폴더 이름입니다.',
    },
} as const
