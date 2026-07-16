import { ApiProperty } from '@nestjs/swagger'

// Swagger 응답 문서용 DTO. 실제 응답은 FolderService가 반환하는 객체를
// CommonResponseInterceptor가 `{ success, data }`로 감싼 형태다.

const TIMESTAMP_EXAMPLE = '2026-07-06T12:34:56.000Z'
const THUMBNAIL_EXAMPLE = 'https://static.toss.tech/thumbnail.png'
const TITLE_EXAMPLE = '실무에서 바로 쓰는 프론트엔드 성능 최적화'

export class CreateFolderResponseDto {
    @ApiProperty({ example: 3, description: '생성된 폴더 ID' })
    folderId!: number

    @ApiProperty({ example: '개발 블로그', description: '폴더 이름' })
    folderName!: string

    @ApiProperty({
        example: TIMESTAMP_EXAMPLE,
        description: '생성 시각 (ISO 8601)',
    })
    createdAt!: string
}

export class RenameFolderResponseDto {
    @ApiProperty({ example: 3, description: '폴더 ID' })
    folderId!: number

    @ApiProperty({ example: '읽을거리', description: '변경된 폴더 이름' })
    folderName!: string

    @ApiProperty({
        example: TIMESTAMP_EXAMPLE,
        description: '수정 시각 (ISO 8601)',
    })
    updatedAt!: string
}

export class SystemFolderCountDto {
    @ApiProperty({ example: 12, description: '링크 수' })
    linkCount!: number
}

export class SystemFoldersDto {
    @ApiProperty({ type: SystemFolderCountDto, description: '전체 링크' })
    all!: SystemFolderCountDto

    @ApiProperty({ type: SystemFolderCountDto, description: '미분류 링크' })
    uncategorized!: SystemFolderCountDto

    @ApiProperty({
        type: SystemFolderCountDto,
        description: '최근 삭제된 항목',
    })
    recentlyDeleted!: SystemFolderCountDto
}

export class FolderListItemDto {
    @ApiProperty({ example: 3, description: '폴더 ID' })
    folderId!: number

    @ApiProperty({ example: '개발 블로그', description: '폴더 이름' })
    folderName!: string

    @ApiProperty({ example: 5, description: '폴더 내 링크 수' })
    linkCount!: number
}

export class ListFoldersResponseDto {
    @ApiProperty({ type: SystemFoldersDto, description: '시스템 폴더 카운트' })
    systemFolders!: SystemFoldersDto

    @ApiProperty({ type: [FolderListItemDto], description: '사용자 폴더 목록' })
    folders!: FolderListItemDto[]
}

export class FolderRefDto {
    @ApiProperty({ example: 3, description: '폴더 ID' })
    folderId!: number

    @ApiProperty({ example: '개발 블로그', description: '폴더 이름' })
    folderName!: string
}

export class FolderLinkItemDto {
    @ApiProperty({ example: 42, description: '링크 ID' })
    linkId!: number

    @ApiProperty({
        example: TITLE_EXAMPLE,
        nullable: true,
        description: '제목',
    })
    title!: string | null

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

export class FolderLinksResponseDto {
    @ApiProperty({ type: FolderRefDto, description: '폴더 정보' })
    folder!: FolderRefDto

    @ApiProperty({
        type: [FolderLinkItemDto],
        description: '폴더 내 링크 목록',
    })
    links!: FolderLinkItemDto[]

    @ApiProperty({ example: 5, description: '링크 개수' })
    totalCount!: number
}
