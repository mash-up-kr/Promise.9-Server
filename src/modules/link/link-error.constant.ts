import { HttpStatus } from '@nestjs/common'

export const LINK_ERROR = {
    NOT_FOUND: {
        code: HttpStatus.NOT_FOUND,
        errorCode: 301001,
        message: '링크를 찾을 수 없습니다.',
    },
    NOT_DELETED: {
        code: HttpStatus.CONFLICT,
        errorCode: 302001,
        message: '삭제된 링크가 아니므로 복구할 수 없습니다.',
    },
    ALREADY_EXISTS: {
        code: HttpStatus.CONFLICT,
        errorCode: 302002,
        message: '이미 저장한 링크입니다.',
    },
} as const
