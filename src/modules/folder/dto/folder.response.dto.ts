import { ApiProperty } from '@nestjs/swagger'

import { CursorPaginationResponseDto } from '../../../common/pagination/pagination.response.dto'
import { DEFAULT_FOLDER_COLOR, FOLDER_COLORS } from '../folder.constants'

// Swagger 응답 문서용 DTO. 실제 응답은 FolderService가 반환하는 객체를
// CommonResponseInterceptor가 `{ success, data }`로 감싼 형태다.

const TIMESTAMP_EXAMPLE = '2026-07-06T12:34:56.000Z'
const COLOR_EXAMPLE = DEFAULT_FOLDER_COLOR

export class FolderColorsResponseDto {
    @ApiProperty({
        type: [String],
        example: FOLDER_COLORS,
        description: '선택 가능한 폴더 색상 hex 목록',
    })
    colors!: string[]
}

export class GetFolderResponseDto {
    @ApiProperty({ example: 3, description: '폴더 ID' })
    folderId!: number

    @ApiProperty({ example: '개발 블로그', description: '폴더 이름' })
    folderName!: string

    @ApiProperty({ example: COLOR_EXAMPLE, description: '폴더 색상 hex' })
    color!: string

    @ApiProperty({ example: 24, description: '폴더 누적 조회수' })
    viewCount!: number

    @ApiProperty({
        type: String,
        nullable: true,
        example: null,
        description: '공유 토큰 (공유 중이 아니면 null)',
    })
    shareToken!: string | null

    @ApiProperty({
        type: String,
        format: 'date-time',
        nullable: true,
        example: null,
        description: '공유를 처음 켠 시각 (공유 중이 아니면 null)',
    })
    sharedAt!: string | null
}

export class CreateFolderResponseDto {
    @ApiProperty({ example: 3, description: '생성된 폴더 ID' })
    folderId!: number

    @ApiProperty({ example: '개발 블로그', description: '폴더 이름' })
    folderName!: string

    @ApiProperty({ example: COLOR_EXAMPLE, description: '폴더 색상 hex' })
    color!: string

    @ApiProperty({
        type: String,
        format: 'date-time',
        example: TIMESTAMP_EXAMPLE,
        description: '생성 시각 (ISO 8601)',
    })
    createdAt!: string
}

export class UpdateFolderResponseDto {
    @ApiProperty({ example: 3, description: '폴더 ID' })
    folderId!: number

    @ApiProperty({ example: '읽을거리', description: '수정된 폴더 이름' })
    folderName!: string

    @ApiProperty({ example: COLOR_EXAMPLE, description: '폴더 색상 hex' })
    color!: string

    @ApiProperty({
        type: String,
        format: 'date-time',
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
    @ApiProperty({
        type: SystemFolderCountDto,
        description: '전체 링크 수. 실제 folders row가 아닌 조회 조건 통계',
    })
    all!: SystemFolderCountDto

    @ApiProperty({
        type: SystemFolderCountDto,
        description:
            '미분류 링크 수. folderId가 없는 링크에 대한 조회 조건 통계',
    })
    uncategorized!: SystemFolderCountDto

    @ApiProperty({
        type: SystemFolderCountDto,
        description: '즐겨찾기 링크 수. 실제 folders row가 아닌 조회 조건 통계',
    })
    favorite!: SystemFolderCountDto

    @ApiProperty({
        type: SystemFolderCountDto,
        description:
            '최근 삭제된 링크 수. 삭제된 폴더 수가 아니며 실제 folders row도 아님',
    })
    recentlyDeleted!: SystemFolderCountDto
}

export class FolderListItemDto {
    @ApiProperty({ example: 3, description: '폴더 ID' })
    folderId!: number

    @ApiProperty({ example: '개발 블로그', description: '폴더 이름' })
    folderName!: string

    @ApiProperty({ example: COLOR_EXAMPLE, description: '폴더 색상 hex' })
    color!: string

    @ApiProperty({ example: 5, description: '폴더 내 링크 수' })
    linkCount!: number

    @ApiProperty({ example: 24, description: '폴더 누적 조회수' })
    viewCount!: number

    @ApiProperty({
        type: String,
        format: 'date-time',
        example: TIMESTAMP_EXAMPLE,
        nullable: true,
        description:
            '해당 폴더에 마지막으로 링크를 저장한 시각. 활성 링크가 없으면 null',
    })
    lastSavedAt!: string | null
}

export class ListFoldersResponseDto {
    @ApiProperty({
        type: SystemFoldersDto,
        description:
            '화면에서 폴더처럼 표시하는 전체·미분류·즐겨찾기·최근 삭제 링크 수. 실제 folders row 목록이 아님',
    })
    systemFolders!: SystemFoldersDto

    @ApiProperty({ type: [FolderListItemDto], description: '사용자 폴더 목록' })
    folders!: FolderListItemDto[]
}

export class EnableFolderShareResponseDto {
    @ApiProperty({
        example: 'k3Jx9QmZ0rT7vB2nYw4LpA8sDfG1hUe6',
        description: '공유 주소에 쓰는 토큰 (32자)',
    })
    shareToken!: string

    @ApiProperty({
        type: String,
        format: 'date-time',
        example: '2026-11-09T12:34:56.000Z',
        description: '공유를 처음 켠 시각 (ISO 8601)',
    })
    sharedAt!: string
}

export class SharedFolderLinkDto {
    @ApiProperty({ example: 11, description: '링크 ID' })
    linkId!: number

    @ApiProperty({
        example: 'https://example.com/post',
        description: '링크 주소',
    })
    url!: string

    @ApiProperty({
        type: String,
        nullable: true,
        example: '글 제목',
        description: '제목',
    })
    title!: string | null

    @ApiProperty({
        type: String,
        nullable: true,
        example: 'example.com',
        description: '출처 도메인',
    })
    source!: string | null

    @ApiProperty({
        type: String,
        nullable: true,
        example: 'https://example.com/thumb.png',
        description: '썸네일 주소',
    })
    thumbnailUrl!: string | null

    @ApiProperty({
        type: String,
        format: 'date-time',
        example: '2026-11-01T00:00:00.000Z',
        description: '저장 시각 (ISO 8601)',
    })
    savedAt!: string
}

export class SharedFolderResponseDto {
    @ApiProperty({ example: '개발 블로그', description: '폴더 이름' })
    folderName!: string

    @ApiProperty({ example: COLOR_EXAMPLE, description: '폴더 색상 hex' })
    color!: string

    @ApiProperty({
        type: String,
        format: 'date-time',
        example: '2026-11-09T12:34:56.000Z',
        description: '공유를 처음 켠 시각 (ISO 8601)',
    })
    sharedAt!: string

    @ApiProperty({
        type: [SharedFolderLinkDto],
        description: '저장 최신순 링크 목록',
    })
    links!: SharedFolderLinkDto[]

    @ApiProperty({
        type: CursorPaginationResponseDto,
        description: '페이지 정보',
    })
    pagination!: CursorPaginationResponseDto
}
