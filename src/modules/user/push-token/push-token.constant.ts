import { HttpStatus } from '@nestjs/common'

import { COMMON_ERROR } from '../../../common/exception/common-error-code.constant'

export const PUSH_TOKEN_PLATFORMS = ['ios', 'android'] as const

export const PUSH_TOKEN_NOT_IMPLEMENTED_ERROR = {
    code: HttpStatus.NOT_IMPLEMENTED,
    errorCode: COMMON_ERROR.INTERNAL_SERVER_ERROR.errorCode,
    message: '푸시 토큰 저장소는 아직 연결되지 않았습니다.',
} as const
