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
    @ApiProperty({ enum: SUPPORTED_PROVIDERS, example: 'google' })
    provider!: SupportedProvider

    @ApiProperty({ example: 'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9...' })
    idToken!: string
}

export class RefreshDto {
    @ApiProperty()
    refreshToken!: string
}

export class LogoutDto {
    @ApiProperty()
    refreshToken!: string
}

export class WithdrawDto {
    @ApiProperty()
    refreshToken!: string
}
