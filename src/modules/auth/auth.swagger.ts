import { applyDecorators } from '@nestjs/common'
import { ApiBody, ApiNoContentResponse, ApiOperation } from '@nestjs/swagger'

import { COMMON_ERROR } from '../../common/exception/common-error-code.constant'
import {
    ApiCommonErrorResponses,
    ApiCommonResponse,
} from '../../common/swagger/api-response.decorator'

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
import { AUTH_ERROR } from './auth-error.constant'

const ACCESS_TOKEN_EXAMPLE = 'eyJhbGciOiJIUzI1NiJ9.access-token-signature'
const REFRESH_TOKEN_EXAMPLE = 'eyJhbGciOiJIUzI1NiJ9.refresh-token-signature'

const SOCIAL_LOGIN_RESPONSE_EXAMPLE = {
    accessToken: ACCESS_TOKEN_EXAMPLE,
    refreshToken: REFRESH_TOKEN_EXAMPLE,
    isNewUser: true,
}

const TOKEN_PAIR_RESPONSE_EXAMPLE = {
    accessToken: ACCESS_TOKEN_EXAMPLE,
    refreshToken: REFRESH_TOKEN_EXAMPLE,
}

const SOCIAL_LOGIN_DESCRIPTION = `
Google, Kakao, Apple 소셜 로그인을 지원합니다.

- \`provider=google\`: Google ID 토큰 검증 (OAuth2Client, audience=GOOGLE_CLIENT_ID)
- \`provider=kakao\`: Kakao OIDC ID 토큰 검증 (JWKS, audience=KAKAO_CLIENT_ID)
- \`provider=apple\`: Apple OIDC ID 토큰 검증 (JWKS, audience=APPLE_CLIENT_ID)
`

export const ApiSocialLogin = () =>
    applyDecorators(
        ApiOperation({
            summary: '소셜 로그인 (Google / Kakao / Apple)',
            description: SOCIAL_LOGIN_DESCRIPTION,
        }),
        ApiBody({
            type: SocialLoginDto,
            description:
                '- `provider` (필수): `google` | `kakao` | `apple`\n- `idToken` (필수): 소셜 로그인 제공자가 발급한 ID 토큰',
        }),
        ApiCommonResponse(SocialLoginResponseDto, {
            description: '로그인 성공',
            dataExample: SOCIAL_LOGIN_RESPONSE_EXAMPLE,
        }),
        ApiCommonErrorResponses(
            COMMON_ERROR.VALIDATION,
            AUTH_ERROR.INVALID_SOCIAL_TOKEN,
            AUTH_ERROR.UNSUPPORTED_PROVIDER,
        ),
    )

export const ApiRefreshToken = () =>
    applyDecorators(
        ApiOperation({ summary: '토큰 재발급 (Refresh Token Rotation)' }),
        ApiBody({
            type: RefreshDto,
            description:
                '- `refreshToken` (필수): Access Token 재발급에 사용할 Refresh Token',
        }),
        ApiCommonResponse(TokenPairResponseDto, {
            description: '재발급 성공',
            dataExample: TOKEN_PAIR_RESPONSE_EXAMPLE,
        }),
        ApiCommonErrorResponses(
            COMMON_ERROR.VALIDATION,
            AUTH_ERROR.INVALID_TOKEN,
            AUTH_ERROR.EXPIRED_TOKEN,
        ),
    )

export const ApiLogout = () =>
    applyDecorators(
        ApiOperation({ summary: '로그아웃' }),
        ApiBody({
            type: LogoutDto,
            description: '- `refreshToken` (필수): 폐기할 Refresh Token',
        }),
        ApiNoContentResponse({ description: '로그아웃 성공 (응답 본문 없음)' }),
        ApiCommonErrorResponses(
            COMMON_ERROR.VALIDATION,
            AUTH_ERROR.INVALID_TOKEN,
            AUTH_ERROR.EXPIRED_TOKEN,
        ),
    )

export const ApiWithdraw = () =>
    applyDecorators(
        ApiOperation({ summary: '회원 탈퇴' }),
        ApiBody({
            type: WithdrawDto,
            description:
                '- `refreshToken` (필수): 본인 확인과 폐기에 사용할 Refresh Token',
        }),
        ApiNoContentResponse({ description: '탈퇴 성공 (응답 본문 없음)' }),
        ApiCommonErrorResponses(
            COMMON_ERROR.VALIDATION,
            AUTH_ERROR.INVALID_TOKEN,
            AUTH_ERROR.EXPIRED_TOKEN,
        ),
    )
