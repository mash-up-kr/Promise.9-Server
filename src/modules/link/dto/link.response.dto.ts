import { ApiProperty } from '@nestjs/swagger'

// Swagger 응답 문서용 DTO. 실제 응답은 LinkService가 반환하는 객체를
// CommonResponseInterceptor가 `{ success, data }`로 감싼 형태다.

const TIMESTAMP_EXAMPLE = '2026-07-06T12:34:56.000Z'
const URL_EXAMPLE = 'https://toss.tech/article/slug'
const TITLE_EXAMPLE = '실무에서 바로 쓰는 프론트엔드 성능 최적화'
const THUMBNAIL_EXAMPLE = 'https://static.toss.tech/thumbnail.png'

export class CreateLinkResponseDto {
    @ApiProperty({ example: 42, description: '저장된 링크 ID' })
    linkId!: number

    @ApiProperty({ example: URL_EXAMPLE, description: '저장된 URL' })
    url!: string

    @ApiProperty({
        example: TIMESTAMP_EXAMPLE,
        description: '저장 시각 (ISO 8601)',
    })
    savedAt!: string
}

export class LinkFolderRefDto {
    @ApiProperty({ example: 3, description: '폴더 ID' })
    folderId!: number

    @ApiProperty({ example: '개발 블로그', description: '폴더 이름' })
    folderName!: string
}

export class LinkDetailResponseDto {
    @ApiProperty({ example: 42, description: '링크 ID' })
    linkId!: number

    @ApiProperty({ example: URL_EXAMPLE, description: '저장된 URL' })
    url!: string

    @ApiProperty({
        type: LinkFolderRefDto,
        nullable: true,
        description: '소속 폴더 (미분류면 null)',
    })
    folder!: LinkFolderRefDto | null

    @ApiProperty({
        example: THUMBNAIL_EXAMPLE,
        nullable: true,
        description: '썸네일 URL',
    })
    thumbnailUrl!: string | null

    @ApiProperty({
        example: TITLE_EXAMPLE,
        nullable: true,
        description: '제목',
    })
    title!: string | null

    @ApiProperty({ example: 'toss.tech', nullable: true, description: '출처' })
    source!: string | null

    @ApiProperty({
        example: TIMESTAMP_EXAMPLE,
        nullable: true,
        description: '원문 발행 시각 (ISO 8601)',
    })
    publishedAt!: string | null

    @ApiProperty({
        example: TIMESTAMP_EXAMPLE,
        description: '저장 시각 (ISO 8601)',
    })
    savedAt!: string

    @ApiProperty({
        example: 'done',
        description: 'AI 요약 처리 상태 (후속 작업)',
    })
    status!: string

    @ApiProperty({
        type: [String],
        example: [],
        description: '태그 목록 (후속 작업)',
    })
    tags!: string[]

    @ApiProperty({
        example: null,
        nullable: true,
        description: 'AI 요약 (후속 작업)',
    })
    aiSummary!: string | null

    @ApiProperty({
        example: '나중에 꼭 읽기',
        nullable: true,
        description: '메모',
    })
    memo!: string | null

    @ApiProperty({
        type: [Object],
        example: [],
        description: '연관 링크 (후속 작업)',
    })
    relatedLinks!: unknown[]
}

export class UpdateLinkResponseDto {
    @ApiProperty({ example: 42, description: '링크 ID' })
    linkId!: number

    @ApiProperty({
        example: 3,
        nullable: true,
        description: '변경된 폴더 ID (미분류면 null)',
    })
    folderId!: number | null

    @ApiProperty({
        example: '나중에 꼭 읽기',
        nullable: true,
        description: '메모',
    })
    memo!: string | null

    @ApiProperty({
        example: TIMESTAMP_EXAMPLE,
        description: '수정 시각 (ISO 8601)',
    })
    updatedAt!: string
}

export class RestoreLinkResponseDto {
    @ApiProperty({ example: 42, description: '링크 ID' })
    linkId!: number

    @ApiProperty({
        example: null,
        nullable: true,
        description: '복구 후 폴더 (항상 미분류이므로 null)',
    })
    folderId!: number | null

    @ApiProperty({
        example: TIMESTAMP_EXAMPLE,
        description: '복구 시각 (ISO 8601)',
    })
    restoredAt!: string
}

export class LinkSearchItemDto {
    @ApiProperty({ example: 42, description: '링크 ID' })
    linkId!: number

    @ApiProperty({
        example: TITLE_EXAMPLE,
        nullable: true,
        description: '제목',
    })
    title!: string | null

    @ApiProperty({ example: 'toss.tech', nullable: true, description: '출처' })
    source!: string | null

    @ApiProperty({
        example: THUMBNAIL_EXAMPLE,
        nullable: true,
        description: '썸네일 URL',
    })
    thumbnailUrl!: string | null

    @ApiProperty({
        example: TIMESTAMP_EXAMPLE,
        description: '저장 시각 (ISO 8601)',
    })
    savedAt!: string
}

export class SearchLinkResponseDto {
    @ApiProperty({ type: [LinkSearchItemDto], description: '검색 결과 목록' })
    results!: LinkSearchItemDto[]

    @ApiProperty({ example: 1, description: '검색 결과 개수' })
    totalCount!: number
}
