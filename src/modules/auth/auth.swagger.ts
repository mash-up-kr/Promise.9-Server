import { applyDecorators } from '@nestjs/common'
import { ApiBody, ApiNoContentResponse, ApiOperation } from '@nestjs/swagger'

import { COMMON_ERROR } from '../../common/exception/common-error-code.constant'
import {
    ApiCommonErrorResponses,
    ApiCommonResponse,
} from '../../common/swagger/api-response.decorator'
import { USER_ERROR } from '../user/user-error.constant'

import {
    KakaoExchangeDto,
    LogoutDto,
    RefreshDto,
    SocialLoginDto,
    WithdrawDto,
} from './dto/auth.dto'
import {
    KakaoExchangeResponseDto,
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

이메일이 이미 다른 provider로 가입돼 있으면 자동으로 병합하지 않고
\`409 Conflict\`(\`errorCode=960002\`)를 반환합니다. 같은 사람이어도
provider마다 별개 계정이며, 기존에 가입한 provider로 로그인해야 합니다.
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
            USER_ERROR.EMAIL_ALREADY_REGISTERED,
        ),
    )

const KAKAO_EXCHANGE_DESCRIPTION = `
웹에서만 사용합니다. Kakao OIDC는 response_type=code로 고정되어 있어,
웹은 client_secret 노출 없이 idToken을 얻을 방법이 없습니다. 프론트가
authorization code를 이 엔드포인트로 넘기면 서버가 대신 Kakao token
endpoint와 교환해 idToken을 돌려줍니다. 이후 그 idToken을
\`POST /auth/social\` (\`provider=kakao\`)에 그대로 넘겨 로그인을 완료하세요.

iOS/Android 네이티브 앱은 SDK가 idToken을 직접 발급하므로 이 엔드포인트가
필요 없습니다.
`

export const ApiKakaoExchange = () =>
    applyDecorators(
        ApiOperation({
            summary: 'Kakao 웹 로그인용 code→idToken 교환 (웹 전용)',
            description: KAKAO_EXCHANGE_DESCRIPTION,
        }),
        ApiBody({
            type: KakaoExchangeDto,
            description:
                '- `code` (필수): Kakao authorization code\n- `redirectUri` (필수): code 발급에 사용한 redirect_uri와 동일한 값',
        }),
        ApiCommonResponse(KakaoExchangeResponseDto, {
            description: '교환 성공',
            dataExample: { idToken: ACCESS_TOKEN_EXAMPLE },
        }),
        ApiCommonErrorResponses(
            COMMON_ERROR.VALIDATION,
            AUTH_ERROR.KAKAO_EXCHANGE_FAILED,
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
