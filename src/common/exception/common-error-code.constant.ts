import { HttpStatus } from '@nestjs/common'

export const COMMON_ERROR = {
    VALIDATION: {
        code: HttpStatus.BAD_REQUEST,
        errorCode: 910001,
        message: '요청 값이 올바르지 않습니다.',
    },
    INTERNAL_SERVER_ERROR: {
        code: HttpStatus.INTERNAL_SERVER_ERROR,
        errorCode: 910002,
        message: '서버 내부 오류가 발생했습니다.',
    },
} as const
