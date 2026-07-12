import { HttpStatus } from '@nestjs/common'

export const FOLDER_ERROR = {
    NOT_FOUND: [HttpStatus.NOT_FOUND, 201001, '폴더를 찾을 수 없습니다.'],
    NAME_DUPLICATE: [
        HttpStatus.CONFLICT,
        202001,
        '이미 존재하는 폴더 이름입니다.',
    ],
} as const
