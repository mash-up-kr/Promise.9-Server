import { ApiProperty } from '@nestjs/swagger'

import { UserAttributionResponseDto } from './user-attribution.dto'

const TIMESTAMP_EXAMPLE = '2026-07-06T12:34:56.000Z'

export class MeResponseDto extends UserAttributionResponseDto {
    @ApiProperty({ example: 'user@example.com', description: '대표 이메일' })
    email!: string

    @ApiProperty({ example: 'google', description: '소셜 로그인 제공자' })
    provider!: string

    @ApiProperty({
        type: String,
        format: 'date-time',
        example: TIMESTAMP_EXAMPLE,
        description: '가입 일시 (ISO 8601)',
    })
    createdAt!: string
}
