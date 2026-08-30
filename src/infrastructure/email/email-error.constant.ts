import { HttpStatus } from '@nestjs/common'

export const EMAIL_ERROR = {
    SEND_FAILED: {
        code: HttpStatus.BAD_GATEWAY,
        errorCode: 970001,
        message: '이메일 발송에 실패했습니다.',
    },
} as const
