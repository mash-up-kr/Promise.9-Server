import { ApiProperty } from '@nestjs/swagger'
import { IsIn, IsString } from 'class-validator'

export const SUPPORTED_PROVIDERS = ['google', 'kakao'] as const
export type SupportedProvider = (typeof SUPPORTED_PROVIDERS)[number]

export class SocialLoginDto {
    @ApiProperty({ enum: SUPPORTED_PROVIDERS, example: 'google' })
    @IsIn(SUPPORTED_PROVIDERS)
    provider: SupportedProvider

    @ApiProperty({ example: 'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9...' })
    @IsString()
    idToken: string
}

export class RefreshDto {
    @ApiProperty()
    @IsString()
    refreshToken: string
}

export class LogoutDto {
    @ApiProperty()
    @IsString()
    refreshToken: string
}

export class WithdrawDto {
    @ApiProperty()
    @IsString()
    refreshToken: string
}
