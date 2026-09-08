import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { z } from 'zod'

export const SUPPORTED_PROVIDERS = ['google', 'kakao', 'apple'] as const
export type SupportedProvider = (typeof SUPPORTED_PROVIDERS)[number]

export const socialLoginSchema = z
    .object({
        provider: z.enum(SUPPORTED_PROVIDERS),
        idToken: z.string().min(1),
        authorizationCode: z.string().min(1).optional(),
        redirectUri: z.url().optional(),
    })
    .refine(
        (input) => input.provider !== 'apple' || !!input.authorizationCode,
        {
            path: ['authorizationCode'],
            message: 'Apple 로그인에는 authorizationCode가 필요합니다.',
        },
    )
export type SocialLoginInput = z.infer<typeof socialLoginSchema>

export const refreshSchema = z.object({
    refreshToken: z.string().min(1),
})
export type RefreshInput = z.infer<typeof refreshSchema>

export const logoutSchema = z.object({
    refreshToken: z.string().min(1),
})
export type LogoutInput = z.infer<typeof logoutSchema>

export const withdrawSchema = z.object({
    refreshToken: z.string().min(1),
})
export type WithdrawInput = z.infer<typeof withdrawSchema>

export const kakaoExchangeSchema = z.object({
    code: z.string().min(1),
    redirectUri: z.string().min(1),
})
export type KakaoExchangeInput = z.infer<typeof kakaoExchangeSchema>

// Swagger 문서용
export class SocialLoginDto {
    @ApiProperty({
        enum: SUPPORTED_PROVIDERS,
        example: 'google',
        description: '[필수] 소셜 로그인 제공자',
    })
    provider!: SupportedProvider

    @ApiProperty({
        example: 'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9...',
        description: '[필수] 소셜 로그인 제공자가 발급한 ID 토큰',
    })
    idToken!: string

    @ApiPropertyOptional({
        example: 'c1234567890abcdef.0.abcd...',
        description:
            '[Apple 필수] Sign in with Apple에서 ID 토큰과 함께 발급한 authorization code',
    })
    authorizationCode?: string

    @ApiPropertyOptional({
        example: 'https://example.com/oauth/apple/callback',
        description:
            '[Apple 웹 로그인 선택] authorization code 발급 요청에 사용한 redirect_uri',
    })
    redirectUri?: string
}

export class RefreshDto {
    @ApiProperty({
        example: 'eyJhbGciOiJIUzI1NiJ9.refresh-token-signature',
        description: '[필수] 재발급에 사용할 리프레시 토큰',
    })
    refreshToken!: string
}

export class LogoutDto {
    @ApiProperty({
        example: 'eyJhbGciOiJIUzI1NiJ9.refresh-token-signature',
        description: '[필수] 폐기할 리프레시 토큰',
    })
    refreshToken!: string
}

export class WithdrawDto {
    @ApiProperty({
        example: 'eyJhbGciOiJIUzI1NiJ9.refresh-token-signature',
        description: '[필수] 본인 확인 및 폐기에 사용할 리프레시 토큰',
    })
    refreshToken!: string
}

export class KakaoExchangeDto {
    @ApiProperty({
        example: '4/0AY0e-g7...',
        description:
            '[필수] Kakao authorization code. authorize 요청 시 response_type=code&scope=openid로 발급받아야 함',
    })
    code!: string

    @ApiProperty({
        example: 'https://example.com/oauth/kakao/callback',
        description:
            '[필수] authorization code 요청 시 사용한 redirect_uri와 정확히 동일한 값',
    })
    redirectUri!: string
}
