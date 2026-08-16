import { ApiProperty } from '@nestjs/swagger'
import { z } from 'zod'

export const SUPPORTED_PROVIDERS = ['google', 'kakao', 'apple'] as const
export type SupportedProvider = (typeof SUPPORTED_PROVIDERS)[number]

export const socialLoginSchema = z.object({
    provider: z.enum(SUPPORTED_PROVIDERS),
    idToken: z.string().min(1),
})
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
            '[필수] Kakao authorization code (response_type=code로 발급받은 값)',
    })
    code!: string

    @ApiProperty({
        example: 'https://example.com/oauth/kakao/callback',
        description:
            '[필수] authorization code 요청 시 사용한 redirect_uri와 정확히 동일한 값',
    })
    redirectUri!: string
}
