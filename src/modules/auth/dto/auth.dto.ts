import { ApiProperty } from '@nestjs/swagger'
import { z } from 'zod'

export const SUPPORTED_PROVIDERS = ['google', 'kakao'] as const
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

// Swagger 문서용
export class SocialLoginDto {
    @ApiProperty({
        enum: SUPPORTED_PROVIDERS,
        example: 'google',
        description:
            '[필수] 소셜 로그인 제공자. 현재 google만 동작하며 kakao는 계약만 제공하는 TODO',
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
