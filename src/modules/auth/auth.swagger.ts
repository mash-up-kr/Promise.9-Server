import { applyDecorators } from '@nestjs/common'
import { ApiBody, ApiNoContentResponse, ApiOperation } from '@nestjs/swagger'

import { ApiCommonResponse } from '../../common/swagger/api-response.decorator'

import {
    LogoutDto,
    RefreshDto,
    SocialLoginDto,
    WithdrawDto,
} from './dto/auth.dto'
import {
    SocialLoginResponseDto,
    TokenPairResponseDto,
} from './dto/auth.response.dto'

export const ApiSocialLogin = () =>
    applyDecorators(
        ApiOperation({ summary: '소셜 로그인 (Google / Kakao)' }),
        ApiBody({ type: SocialLoginDto }),
        ApiCommonResponse(SocialLoginResponseDto, {
            description: '로그인 성공',
        }),
    )

export const ApiRefreshToken = () =>
    applyDecorators(
        ApiOperation({ summary: '토큰 재발급 (Refresh Token Rotation)' }),
        ApiBody({ type: RefreshDto }),
        ApiCommonResponse(TokenPairResponseDto, { description: '재발급 성공' }),
    )

export const ApiLogout = () =>
    applyDecorators(
        ApiOperation({ summary: '로그아웃' }),
        ApiBody({ type: LogoutDto }),
        ApiNoContentResponse({ description: '로그아웃 성공 (응답 본문 없음)' }),
    )

export const ApiWithdraw = () =>
    applyDecorators(
        ApiOperation({ summary: '회원 탈퇴' }),
        ApiBody({ type: WithdrawDto }),
        ApiNoContentResponse({ description: '탈퇴 성공 (응답 본문 없음)' }),
    )
