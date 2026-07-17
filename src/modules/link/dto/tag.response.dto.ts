import { ApiProperty } from '@nestjs/swagger'

export const TAG_SOURCE_TYPES = ['user', 'rule', 'ai'] as const
export type TagSourceType = (typeof TAG_SOURCE_TYPES)[number]

// tags row 중 클라이언트가 표시·행동 결정에 필요한 필드만 노출한다.
// userId, linkId, normalizedName은 소유권·정규화를 위한 서버 내부 필드다.
export class LinkTagResponseDto {
    @ApiProperty({ example: 7, description: '태그 ID' })
    tagId!: number

    @ApiProperty({ example: '디자인', description: '화면에 표시할 태그 이름' })
    name!: string

    @ApiProperty({
        enum: TAG_SOURCE_TYPES,
        example: 'ai',
        description:
            '태그 생성 출처: user(사용자), rule(규칙), ai(AI 자동 생성)',
    })
    sourceType!: TagSourceType

    @ApiProperty({
        example: 1,
        nullable: true,
        description:
            '링크 상세에서의 표시 순서. 서버가 순서를 지정하지 않았으면 null',
    })
    sortOrder!: number | null
}
