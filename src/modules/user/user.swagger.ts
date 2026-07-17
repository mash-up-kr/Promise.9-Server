import { applyDecorators } from '@nestjs/common'
import { ApiOperation } from '@nestjs/swagger'

import {
    ApiCommonErrorResponses,
    ApiCommonResponse,
} from '../../common/swagger/api-response.decorator'
import { AUTH_ERROR } from '../auth/auth-error.constant'

import { MeResponseDto } from './dto/user.response.dto'
import { USER_ERROR } from './user-error.constant'

const ME_RESPONSE_EXAMPLE = {
    userId: 1,
    email: 'user@example.com',
    provider: 'google',
    createdAt: '2026-07-13T09:41:00.000Z',
}

export const ApiGetMe = () =>
    applyDecorators(
        ApiOperation({ summary: '내 정보 조회' }),
        ApiCommonResponse(MeResponseDto, {
            description: '조회 성공',
            dataExample: ME_RESPONSE_EXAMPLE,
        }),
        ApiCommonErrorResponses(AUTH_ERROR.INVALID_TOKEN, USER_ERROR.NOT_FOUND),
    )
