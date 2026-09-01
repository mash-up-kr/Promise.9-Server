import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'

export class RecommendationItemResponseDto {
    @ApiProperty({
        example: 'folder:3',
        description:
            'flat 목록 식별자. folder:{folderId} 또는 tag:{normalizedTag}',
    })
    key!: string

    @ApiProperty({
        enum: ['folder', 'tag'],
        example: 'folder',
        description: '추천 항목 유형',
    })
    type!: 'folder' | 'tag'

    @ApiProperty({ example: '디자인', description: '화면 표시 이름' })
    label!: string

    @ApiProperty({
        example: 12,
        description: '해당 폴더 또는 태그에 연결된 활성 링크 수',
    })
    linkCount!: number

    @ApiProperty({
        type: String,
        format: 'date-time',
        nullable: true,
        example: '2026-08-08T00:00:00.000Z',
        description:
            '연결된 활성 링크 중 가장 최근 조회 시각. 조회 이력이 없으면 null',
    })
    lastViewedAt!: string | null

    @ApiPropertyOptional({
        example: 3,
        description: 'folder 항목에만 존재하는 폴더 ID',
    })
    folderId?: number

    @ApiPropertyOptional({
        example: '#61a8ef',
        description: 'folder 항목에만 존재',
    })
    color?: string

    @ApiPropertyOptional({
        example: 'product-design',
        description: 'tag 항목에만 존재',
    })
    normalizedTag?: string
}

export class RecommendationResponseDto {
    @ApiProperty({
        type: [RecommendationItemResponseDto],
        description: '폴더와 태그를 합친 추천 목록',
    })
    items!: RecommendationItemResponseDto[]
}
