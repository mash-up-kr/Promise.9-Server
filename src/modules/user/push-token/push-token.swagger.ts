import { applyDecorators } from '@nestjs/common'
import { ApiBody, ApiNoContentResponse, ApiOperation } from '@nestjs/swagger'

import { COMMON_ERROR } from '../../../common/exception/common-error-code.constant'
import { ApiCommonErrorResponses } from '../../../common/swagger/api-response.decorator'
import { AUTH_ERROR } from '../../auth/auth-error.constant'

import {
    RegisterPushTokenDto,
    UnregisterPushTokenDto,
} from './dto/push-token.dto'
import { PUSH_TOKEN_NOT_IMPLEMENTED_ERROR } from './push-token.constant'

const ApiPushTokenErrors = () =>
    ApiCommonErrorResponses(
        COMMON_ERROR.VALIDATION,
        AUTH_ERROR.INVALID_TOKEN,
        PUSH_TOKEN_NOT_IMPLEMENTED_ERROR,
    )

export const ApiRegisterPushToken = () =>
    applyDecorators(
        ApiOperation({
            summary: '내 기기 푸시 토큰 등록·갱신',
            description:
                '앱에서 발급한 Expo Push Token을 JWT의 사용자에게 연결한다. 동일 토큰 재등록은 멱등하게 처리한다. 현재 저장소 구현 전이므로 유효한 요청은 501을 반환한다.',
        }),
        ApiBody({ type: RegisterPushTokenDto }),
        ApiNoContentResponse({
            description: '등록·갱신 성공 (저장소 연결 후)',
        }),
        ApiPushTokenErrors(),
    )

export const ApiUnregisterPushToken = () =>
    applyDecorators(
        ApiOperation({
            summary: '내 기기 푸시 토큰 해제',
            description:
                'JWT 사용자와 본문의 토큰을 함께 조건으로 연결을 해제한다. 이미 없거나 다른 사용자의 토큰이면 변경 없이 성공한다. 현재 저장소 구현 전이므로 유효한 요청은 501을 반환한다.',
        }),
        ApiBody({ type: UnregisterPushTokenDto }),
        ApiNoContentResponse({ description: '해제 성공 (저장소 연결 후)' }),
        ApiPushTokenErrors(),
    )
