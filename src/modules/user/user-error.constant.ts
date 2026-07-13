import { HttpStatus } from '@nestjs/common'

export const USER_ERROR = {
    NOT_FOUND: {
        code: HttpStatus.NOT_FOUND,
        errorCode: 960001,
        message: '유저를 찾을 수 없습니다.',
    },
} as const
