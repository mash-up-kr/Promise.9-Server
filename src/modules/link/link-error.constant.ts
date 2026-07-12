import { HttpStatus } from '@nestjs/common'

export const LINK_ERROR = {
    NOT_FOUND: [HttpStatus.NOT_FOUND, 301001, '링크를 찾을 수 없습니다.'],
    NOT_DELETED: [
        HttpStatus.CONFLICT,
        302001,
        '삭제된 링크가 아니므로 복구할 수 없습니다.',
    ],
    ALREADY_EXISTS: [HttpStatus.CONFLICT, 302002, '이미 저장한 링크입니다.'],
} as const
