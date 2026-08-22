import { HttpStatus } from '@nestjs/common'

export const USER_ERROR = {
    NOT_FOUND: {
        code: HttpStatus.NOT_FOUND,
        errorCode: 960001,
        message: '유저를 찾을 수 없습니다.',
    },
    EMAIL_ALREADY_REGISTERED: {
        code: HttpStatus.CONFLICT,
        errorCode: 960002,
        message: '이미 다른 로그인 방법으로 가입된 이메일입니다.',
    },
} as const
