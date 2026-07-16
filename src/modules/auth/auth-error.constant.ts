import { HttpStatus } from '@nestjs/common'

export const AUTH_ERROR = {
    INVALID_TOKEN: {
        code: HttpStatus.UNAUTHORIZED,
        errorCode: 950001,
        message: '유효하지 않은 토큰입니다.',
    },
    EXPIRED_TOKEN: {
        code: HttpStatus.UNAUTHORIZED,
        errorCode: 950002,
        message: '만료된 토큰입니다.',
    },
    INVALID_SOCIAL_TOKEN: {
        code: HttpStatus.UNAUTHORIZED,
        errorCode: 950003,
        message: '소셜 ID 토큰 검증에 실패했습니다.',
    },
    UNSUPPORTED_PROVIDER: {
        code: HttpStatus.BAD_REQUEST,
        errorCode: 950004,
        message: '지원하지 않는 소셜 로그인 제공자입니다.',
    },
} as const
