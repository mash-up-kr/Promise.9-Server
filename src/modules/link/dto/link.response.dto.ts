import { ApiProperty } from '@nestjs/swagger'

import { CursorPaginationResponseDto } from '../../../common/pagination/pagination.response.dto'

import { LinkTagResponseDto } from './tag.response.dto'

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
        type: String,
        format: 'date-time',
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

export class RelatedLinkDto {
    @ApiProperty({ example: 41, description: '연관 링크 ID' })
    linkId!: number

    @ApiProperty({ example: TITLE_EXAMPLE, description: '연관 링크 제목' })
    title!: string

    @ApiProperty({
        example: THUMBNAIL_EXAMPLE,
        nullable: true,
        description: '연관 링크 썸네일 URL',
    })
    thumbnailUrl!: string | null
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
        type: String,
        format: 'date-time',
        example: TIMESTAMP_EXAMPLE,
        nullable: true,
        description: '원문 발행 시각 (ISO 8601)',
    })
    publishedAt!: string | null

    @ApiProperty({
        type: String,
        format: 'date-time',
        example: TIMESTAMP_EXAMPLE,
        description: '저장 시각 (ISO 8601)',
    })
    savedAt!: string

    @ApiProperty({
        example: false,
        description: '즐겨찾기 여부',
    })
    isFavorite!: boolean

    @ApiProperty({
        type: String,
        format: 'date-time',
        example: '2026-07-06T12:34:56.000Z',
        nullable: true,
        description: '마지막 조회 시각. 조회 이력이 없으면 null',
    })
    viewedAt!: string | null

    @ApiProperty({
        enum: ['PENDING', 'SUCCESS', 'NEEDS_REVIEW', 'FAILED'],
        example: 'PENDING',
        description: '요약·태그·연관 링크 비동기 처리 상태',
    })
    processingStatus!: 'PENDING' | 'SUCCESS' | 'NEEDS_REVIEW' | 'FAILED'

    @ApiProperty({
        example: null,
        nullable: true,
        description:
            'AI 요약. processingStatus로 처리 중·실패·완료 상태를 구분',
    })
    aiSummary!: string | null

    @ApiProperty({
        type: [LinkTagResponseDto],
        nullable: true,
        description:
            '태그 목록. 처리 중이면 null, 처리 완료 후 결과가 없으면 빈 배열',
    })
    tags!: LinkTagResponseDto[] | null

    @ApiProperty({
        example: '나중에 꼭 읽기',
        nullable: true,
        description: '메모',
    })
    memo!: string | null

    @ApiProperty({
        type: [RelatedLinkDto],
        nullable: true,
        description:
            '연관 링크. 처리 중이면 null, 처리 완료 후 결과가 없으면 빈 배열',
    })
    relatedLinks!: RelatedLinkDto[] | null
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
        example: true,
        description: '변경 후 즐겨찾기 여부',
    })
    isFavorite!: boolean

    @ApiProperty({
        type: String,
        format: 'date-time',
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
        type: String,
        format: 'date-time',
        example: TIMESTAMP_EXAMPLE,
        description: '복구 시각 (ISO 8601)',
    })
    restoredAt!: string
}

export class LinkListItemDto {
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
        type: LinkTagResponseDto,
        nullable: true,
        description:
            '목록 카드에 표시할 대표 태그. 대표 태그 선정 로직 구현 전에는 null',
    })
    representativeTag!: LinkTagResponseDto | null

    @ApiProperty({
        example: THUMBNAIL_EXAMPLE,
        nullable: true,
        description: '썸네일 URL',
    })
    thumbnailUrl!: string | null

    @ApiProperty({
        type: String,
        format: 'date-time',
        example: TIMESTAMP_EXAMPLE,
        description: '저장 시각 (ISO 8601)',
    })
    savedAt!: string
}

export class ListLinksResponseDto {
    @ApiProperty({ type: [LinkListItemDto], description: '링크 목록' })
    links!: LinkListItemDto[]

    @ApiProperty({
        type: CursorPaginationResponseDto,
        description: 'cursor 페이지네이션 정보',
    })
    pagination!: CursorPaginationResponseDto

    @ApiProperty({
        example: 1,
        description: '필터 조건에 해당하는 전체 링크 수',
    })
    totalCount!: number
}
