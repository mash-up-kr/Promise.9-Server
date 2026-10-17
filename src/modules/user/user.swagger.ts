import { applyDecorators } from '@nestjs/common'
import { ApiBody, ApiOperation } from '@nestjs/swagger'

import { COMMON_ERROR } from '../../common/exception/common-error-code.constant'
import {
    ApiCommonErrorResponses,
    ApiCommonResponse,
} from '../../common/swagger/api-response.decorator'
import { AUTH_ERROR } from '../auth/auth-error.constant'

import { MeResponseDto } from './dto/user.response.dto'
import {
    MarketingTouchDto,
    UserAttributionResponseDto,
} from './dto/user-attribution.dto'
import { USER_ERROR } from './user-error.constant'

const ME_RESPONSE_EXAMPLE = {
    userId: 1,
    email: 'user@example.com',
    provider: 'google',
    createdAt: '2026-07-13T09:41:00.000Z',
    firstMarketingTouch: null,
    lastMarketingTouch: null,
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

export const ApiSyncAttribution = () =>
    applyDecorators(
        ApiOperation({
            summary: '내 계정의 마케팅 접점 동기화',
            description:
                '최초 접점은 보존하고, 더 최근 captured_at의 접점만 마지막 접점으로 교체한다. UTM이 없는 직접 방문에서는 호출하지 않는다.',
        }),
        ApiBody({ type: MarketingTouchDto }),
        ApiCommonResponse(UserAttributionResponseDto, {
            description: '동기화 후 계정 접점',
        }),
        ApiCommonErrorResponses(
            COMMON_ERROR.VALIDATION,
            AUTH_ERROR.INVALID_TOKEN,
            USER_ERROR.NOT_FOUND,
        ),
    )
