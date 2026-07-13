import { applyDecorators } from '@nestjs/common'
import {
    ApiBody,
    ApiNoContentResponse,
    ApiOperation,
    ApiParam,
    ApiQuery,
} from '@nestjs/swagger'

import { COMMON_ERROR } from '../../common/exception/common-error-code.constant'
import { MAX_PAGINATION_LIMIT } from '../../common/pagination/pagination.constants'
import {
    ApiCommonErrorResponses,
    ApiCommonResponse,
} from '../../common/swagger/api-response.decorator'
import { AUTH_ERROR } from '../auth/auth-error.constant'

import { CreateFolderDto, UpdateFolderDto } from './dto/folder.dto'
import {
    CreateFolderResponseDto,
    ListFoldersResponseDto,
    UpdateFolderResponseDto,
} from './dto/folder.response.dto'
import { FOLDER_ERROR } from './folder-error.constant'

const LINK_LIST_ITEMS_DESCRIPTION = `
### 폴더처럼 표시되는 링크 목록 항목

\`전체\`, \`미분류\`, \`즐겨찾기\`, \`최근 삭제\`는 화면에서는 폴더처럼 표시되지만 DB의 \`folders\` row가 아닙니다. 따라서 \`folderId\`가 없으며 폴더 생성·수정·삭제 API의 대상이 아닙니다.

- 전체 링크: \`GET /links\`
- 미분류 링크: \`GET /links?unassigned=true\`
- 즐겨찾기 링크: \`GET /links?favorite=true\`
- 최근 삭제된 링크: \`GET /links?deleted=true\`
`

const LIST_FOLDERS_DESCRIPTION = `
보관함 화면에서 링크 목록 항목별 카운트와 사용자가 생성한 실제 폴더 목록을 함께 반환합니다.

- \`systemFolders\`: 전체·미분류·즐겨찾기·최근 삭제 링크 수입니다. 실제 폴더 row 목록이 아닙니다.
- \`folders\`: 사용자가 생성한 \`folders\` row 목록이며 각 항목에 \`folderId\`가 있습니다.

홈 화면의 최근 저장 폴더 3개는 \`GET /folders?sortBy=lastSavedAt&order=desc&limit=3\`으로 요청합니다.

### 현재 구현 상태

- **현재 동작:** 전체·미분류·최근 삭제 링크 수, 사용자 폴더 목록, 폴더별 링크 수, 선택적 \`limit\`
- **계약만 제공:** 즐겨찾기 링크 수, \`lastSavedAt\`, \`sortBy\`, \`order\`
- 현재 사용자 폴더는 수정 최신순으로 고정되며 \`lastSavedAt=null\`을 반환합니다.
- 폴더 목록에는 cursor 페이지네이션을 적용하지 않으며 \`pagination\`, \`totalCount\`도 반환하지 않습니다.
- 응답 Example은 링크 상태별 집계와 사용자 폴더 목록의 **목표 계약**을 보여줍니다.

${LINK_LIST_ITEMS_DESCRIPTION}
`

const CREATE_FOLDER_DESCRIPTION = `
사용자가 소유할 실제 폴더 row를 생성합니다. 생성된 폴더에는 \`folderId\`가 부여됩니다. 폴더 이름 정책에 맞지 않는 요청은 거부합니다.

${LINK_LIST_ITEMS_DESCRIPTION}
`

const UPDATE_FOLDER_DESCRIPTION = `
사용자가 생성한 실제 폴더 row의 정보를 수정합니다. 현재 변경 가능한 속성은 \`folderName\`입니다.

${LINK_LIST_ITEMS_DESCRIPTION}
`

const REMOVE_FOLDER_DESCRIPTION = `
사용자가 생성한 실제 폴더 row를 삭제하고, 해당 폴더의 활성 링크를 최근 삭제된 링크 목록으로 이동합니다. 폴더 처리와 링크 이동은 하나의 transaction으로 실행합니다.

${LINK_LIST_ITEMS_DESCRIPTION}
`

const TIMESTAMP_EXAMPLE = '2026-07-13T09:41:00.000Z'

const LIST_FOLDERS_RESPONSE_EXAMPLE = {
    systemFolders: {
        all: { linkCount: 42 },
        uncategorized: { linkCount: 5 },
        favorite: { linkCount: 7 },
        recentlyDeleted: { linkCount: 3 },
    },
    folders: [
        {
            folderId: 3,
            folderName: '디자인',
            linkCount: 12,
            lastSavedAt: TIMESTAMP_EXAMPLE,
        },
        {
            folderId: 4,
            folderName: 'AI',
            linkCount: 8,
            lastSavedAt: '2026-07-12T03:20:00.000Z',
        },
    ],
}

const CREATE_FOLDER_RESPONSE_EXAMPLE = {
    folderId: 3,
    folderName: '디자인',
    createdAt: TIMESTAMP_EXAMPLE,
}

const UPDATE_FOLDER_RESPONSE_EXAMPLE = {
    folderId: 3,
    folderName: '프로덕트 디자인',
    updatedAt: TIMESTAMP_EXAMPLE,
}

// 폴더 컨트롤러의 Swagger 계약을 모듈 단위로 관리한다.

export const ApiListFolders = () =>
    applyDecorators(
        ApiOperation({
            summary: '폴더 목록 및 링크 상태별 카운트 조회',
            description: LIST_FOLDERS_DESCRIPTION,
        }),
        ApiQuery({
            name: 'sortBy',
            required: false,
            schema: {
                type: 'string',
                enum: ['createdAt', 'updatedAt', 'lastSavedAt'],
                default: 'updatedAt',
            },
            description: '[선택, 기본값: updatedAt] 사용자 폴더 정렬 기준',
        }),
        ApiQuery({
            name: 'order',
            required: false,
            schema: {
                type: 'string',
                enum: ['asc', 'desc'],
                default: 'desc',
            },
            description: '[선택, 기본값: desc] 정렬 방향',
        }),
        ApiQuery({
            name: 'limit',
            required: false,
            schema: {
                type: 'integer',
                minimum: 1,
                maximum: MAX_PAGINATION_LIMIT,
            },
            description: `[선택] 반환할 사용자 폴더 최대 개수. 생략하면 전체 반환, 1~${MAX_PAGINATION_LIMIT}`,
        }),
        ApiCommonResponse(ListFoldersResponseDto, {
            description: '조회 성공',
            dataExample: LIST_FOLDERS_RESPONSE_EXAMPLE,
        }),
        ApiCommonErrorResponses(
            COMMON_ERROR.VALIDATION,
            AUTH_ERROR.INVALID_TOKEN,
        ),
    )

export const ApiCreateFolder = () =>
    applyDecorators(
        ApiOperation({
            summary: '폴더 생성',
            description: CREATE_FOLDER_DESCRIPTION,
        }),
        ApiBody({
            type: CreateFolderDto,
            description: '- `folderName` (필수): 생성할 폴더 이름',
        }),
        ApiCommonResponse(CreateFolderResponseDto, {
            status: 201,
            description: '생성 성공',
            dataExample: CREATE_FOLDER_RESPONSE_EXAMPLE,
        }),
        ApiCommonErrorResponses(
            COMMON_ERROR.VALIDATION,
            AUTH_ERROR.INVALID_TOKEN,
            FOLDER_ERROR.NAME_DUPLICATE,
        ),
    )

export const ApiUpdateFolder = () =>
    applyDecorators(
        ApiOperation({
            summary: '폴더 수정',
            description: UPDATE_FOLDER_DESCRIPTION,
        }),
        ApiParam({
            name: 'folderId',
            required: true,
            type: Number,
            example: 3,
            description: '[필수] 수정할 사용자 폴더 ID',
        }),
        ApiBody({
            type: UpdateFolderDto,
            description:
                '- `folderName` (필수): 변경할 폴더 이름. 현재 수정 가능한 유일한 필드',
        }),
        ApiCommonResponse(UpdateFolderResponseDto, {
            description: '변경 성공',
            dataExample: UPDATE_FOLDER_RESPONSE_EXAMPLE,
        }),
        ApiCommonErrorResponses(
            COMMON_ERROR.VALIDATION,
            AUTH_ERROR.INVALID_TOKEN,
            FOLDER_ERROR.NOT_FOUND,
            FOLDER_ERROR.NAME_DUPLICATE,
        ),
    )

export const ApiRemoveFolder = () =>
    applyDecorators(
        ApiOperation({
            summary: '폴더 삭제 (하위 링크는 최근 삭제된 링크 목록으로 이동)',
            description: REMOVE_FOLDER_DESCRIPTION,
        }),
        ApiParam({
            name: 'folderId',
            required: true,
            type: Number,
            example: 3,
            description: '[필수] 삭제할 폴더 ID',
        }),
        ApiNoContentResponse({ description: '삭제 성공 (응답 본문 없음)' }),
        ApiCommonErrorResponses(
            COMMON_ERROR.VALIDATION,
            AUTH_ERROR.INVALID_TOKEN,
            FOLDER_ERROR.NOT_FOUND,
        ),
    )
