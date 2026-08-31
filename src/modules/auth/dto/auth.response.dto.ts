import { ApiProperty } from '@nestjs/swagger'

const TOKEN_EXAMPLE = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...'

export class TokenPairResponseDto {
    @ApiProperty({ example: TOKEN_EXAMPLE, description: '액세스 토큰' })
    accessToken!: string

    @ApiProperty({ example: TOKEN_EXAMPLE, description: '리프레시 토큰' })
    refreshToken!: string
}

export class SocialLoginResponseDto extends TokenPairResponseDto {
    @ApiProperty({
        example: true,
        description: '신규 가입 여부 (온보딩 처리용)',
    })
    isNewUser!: boolean
}

export class KakaoExchangeResponseDto {
    @ApiProperty({
        example: 'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9...',
        description:
            'Kakao ID 토큰. POST /auth/social의 idToken으로 그대로 사용',
    })
    idToken!: string
}
