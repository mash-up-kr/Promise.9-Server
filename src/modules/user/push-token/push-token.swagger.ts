import { applyDecorators } from '@nestjs/common'
import { ApiBody, ApiNoContentResponse, ApiOperation } from '@nestjs/swagger'

import { COMMON_ERROR } from '../../../common/exception/common-error-code.constant'
import { ApiCommonErrorResponses } from '../../../common/swagger/api-response.decorator'
import { AUTH_ERROR } from '../../auth/auth-error.constant'
import { USER_ERROR } from '../user-error.constant'

import {
    RegisterPushTokenDto,
    UnregisterPushTokenDto,
} from './dto/push-token.dto'

const ApiPushTokenErrors = () =>
    ApiCommonErrorResponses(
        COMMON_ERROR.VALIDATION,
        AUTH_ERROR.INVALID_TOKEN,
        USER_ERROR.NOT_FOUND,
        COMMON_ERROR.INTERNAL_SERVER_ERROR,
    )

export const ApiRegisterPushToken = () =>
    applyDecorators(
        ApiOperation({
            summary: '내 기기 푸시 토큰 등록·갱신',
            description:
                '앱에서 발급한 Expo Push Token을 JWT의 활성 사용자에게 연결한다. 동일 토큰은 중복 없이 갱신하며 계정 전환 시 새 사용자에게 연결한다.',
        }),
        ApiBody({ type: RegisterPushTokenDto }),
        ApiNoContentResponse({ description: '등록·갱신 성공' }),
        ApiPushTokenErrors(),
    )

export const ApiUnregisterPushToken = () =>
    applyDecorators(
        ApiOperation({
            summary: '내 기기 푸시 토큰 해제',
            description:
                'JWT의 활성 사용자와 본문의 토큰을 함께 조건으로 연결을 해제한다. 이미 없거나 다른 사용자의 토큰이면 변경 없이 성공한다.',
        }),
        ApiBody({ type: UnregisterPushTokenDto }),
        ApiNoContentResponse({ description: '해제 성공' }),
        ApiPushTokenErrors(),
    )
