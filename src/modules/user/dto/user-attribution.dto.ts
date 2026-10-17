import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'

export class MarketingTouchDto {
    @ApiProperty({
        example: 'a622a8bf-bc12-4782-bd84-c89b01389d5c',
        maxLength: 128,
    })
    touch_id!: string

    @ApiProperty({
        example: '2026-10-15T09:00:00.000Z',
        format: 'date-time',
        description:
            '클라이언트가 UTM을 수집한 UTC 시각. 서버 시각보다 최대 5분 앞선 값까지 허용하며, 재시도 시 변경하지 않는다.',
    })
    captured_at!: string

    @ApiPropertyOptional({
        type: String,
        nullable: true,
        maxLength: 512,
        example: 'instagram',
    })
    utm_source!: string | null

    @ApiPropertyOptional({
        type: String,
        nullable: true,
        maxLength: 512,
        example: 'sns_post',
    })
    utm_medium!: string | null

    @ApiPropertyOptional({
        type: String,
        nullable: true,
        maxLength: 512,
        example: '2026_10_14_friends',
    })
    utm_campaign!: string | null

    @ApiPropertyOptional({
        type: String,
        nullable: true,
        maxLength: 512,
        example: null,
    })
    utm_content!: string | null

    @ApiPropertyOptional({
        type: String,
        nullable: true,
        maxLength: 512,
        example: null,
    })
    utm_term!: string | null
}

export class UserAttributionResponseDto {
    @ApiProperty({ example: 1 })
    userId!: number

    @ApiProperty({
        type: MarketingTouchDto,
        nullable: true,
        description: '계정에 처음 저장된 마케팅 접점. 이후 보존한다.',
    })
    firstMarketingTouch!: MarketingTouchDto | null

    @ApiProperty({
        type: MarketingTouchDto,
        nullable: true,
        description: 'captured_at이 가장 최근인 마케팅 접점',
    })
    lastMarketingTouch!: MarketingTouchDto | null
}
