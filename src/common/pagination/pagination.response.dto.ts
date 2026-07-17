import { ApiProperty } from '@nestjs/swagger'

export class CursorPaginationResponseDto {
    @ApiProperty({
        example: null,
        nullable: true,
        description: '다음 페이지 cursor. 다음 페이지가 없으면 null',
    })
    nextCursor!: string | null

    @ApiProperty({ example: false, description: '다음 페이지 존재 여부' })
    hasNext!: boolean

    @ApiProperty({ example: 9, description: '요청에 적용된 페이지 크기' })
    limit!: number
}
