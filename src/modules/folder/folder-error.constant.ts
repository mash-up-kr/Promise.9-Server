import { HttpStatus } from '@nestjs/common'

export const FOLDER_ERROR = {
    NOT_FOUND: {
        code: HttpStatus.NOT_FOUND,
        errorCode: 920001,
        message: '폴더를 찾을 수 없습니다.',
    },
    NAME_DUPLICATE: {
        code: HttpStatus.CONFLICT,
        errorCode: 920002,
        message: '이미 존재하는 폴더 이름입니다.',
    },
    REORDER_MISMATCH: {
        code: HttpStatus.BAD_REQUEST,
        errorCode: 920003,
        message: '폴더 순서 목록이 현재 폴더 전체와 일치하지 않습니다.',
    },
} as const
