import { applyDecorators, HttpStatus } from '@nestjs/common'
import {
    ApiBody,
    ApiNoContentResponse,
    ApiOperation,
    ApiParam,
    ApiQuery,
} from '@nestjs/swagger'

import { COMMON_ERROR } from '../../common/exception/common-error-code.constant'
import {
    DEFAULT_PAGINATION_LIMIT,
    MAX_PAGINATION_LIMIT,
} from '../../common/pagination/pagination.constants'
import {
    ApiCommonErrorResponses,
    ApiCommonResponse,
} from '../../common/swagger/api-response.decorator'
import { AUTH_ERROR } from '../auth/auth-error.constant'
import { FOLDER_ERROR } from '../folder/folder-error.constant'

import {
    CreateLinkDto,
    MoveLinksToFolderDto,
    UpdateLinkDto,
} from './dto/link.dto'
import {
    CreateLinkResponseDto,
    LinkDetailResponseDto,
    LinkPreviewResponseDto,
    ListLinksResponseDto,
    MoveLinksToFolderResponseDto,
    RestoreLinkResponseDto,
    UpdateLinkResponseDto,
} from './dto/link.response.dto'
import { CreateLinkTagDto } from './dto/tag.dto'
import { LinkTagResponseDto } from './dto/tag.response.dto'
import { LINK_MEMO_MAX_LENGTH, MAX_BULK_MOVE_LINKS } from './link.constants'
import { LINK_ERROR } from './link-error.constant'

const LIST_LINKS_DESCRIPTION = `
### 사용 화면

화면마다 별도 목록 Endpoint를 만들지 않고, 최근 저장·전체·미분류·즐겨찾기·최근 삭제·사용자 폴더·검색 결과를 모두 \`GET /links\`의 Query 조합으로 조회합니다.

### 필터 조합

- \`folderId\`: 특정 사용자 폴더의 링크만 조회합니다.
- \`unassigned=true\`: 폴더가 없는 미분류 링크만 조회합니다.
- \`favorite=true\`: 즐겨찾기한 링크만 조회합니다.
- \`deleted=true\`: soft delete된 링크만 조회합니다.
- \`q\`: 다른 필터를 적용한 범위 안에서 검색합니다.

\`folderId\`, \`favorite\`, \`q\`처럼 서로 다른 축의 조건은 함께 사용할 수 있습니다. \`folderId\`와 \`unassigned=true\`처럼 동시에 성립할 수 없는 조건은 \`400 Bad Request\`로 처리합니다.

### 화면별 링크 목록 요청 예시

아래 표는 기본 폴더를 정의하는 표가 아니라, 같은 \`GET /links\`를 화면의 조회 목적에 맞게 사용하는 예시입니다.

\`전체\`, \`미분류\`, \`즐겨찾기\`, \`최근 삭제\`는 \`folders\` row가 아닌 링크 조회 조건입니다. 특정 사용자 폴더는 \`folderId\`, 검색은 \`q\`를 사용합니다.

| 화면 | 요청 |
| --- | --- |
| 전체 | \`GET /links\` |
| 미분류 | \`GET /links?unassigned=true\` |
| 즐겨찾기 | \`GET /links?favorite=true\` |
| 최근 삭제 | \`GET /links?deleted=true\` |
| 특정 폴더 | \`GET /links?folderId=3\` |
| 검색 | \`GET /links?q=피그마\` |
| 최근 저장 | \`GET /links?sortBy=savedAt&order=desc\` |

### 정렬과 페이지네이션

기본값은 \`sortBy=savedAt\`, \`order=desc\`, \`limit=9\`입니다. 첫 요청은 \`cursor\`를 생략하고, 다음 요청부터 직전 응답의 \`nextCursor\`를 그대로 전달합니다. 필터나 정렬을 바꾸면 기존 cursor를 폐기하고 첫 페이지부터 다시 요청해야 합니다.

### 검색(\`q\`) 응답의 차이

\`q\`를 넘기면 의미(벡터)+키워드 하이브리드 검색으로 동작합니다.

- \`score\`: 0~1 사이 검색 점수(소수점 5자리). \`q\` 없는 일반 목록에서는 항상 \`null\`입니다.
- 정렬은 \`score\` 내림차순으로 고정되며 \`sortBy\`·\`order\`는 적용되지 않습니다.
- 검색 cursor는 \`(score, id)\` 기준이라 일반 목록 cursor와 호환되지 않습니다. 서로 바꿔 넘기면 \`400 Bad Request\`입니다. \`q\`를 바꿀 때도 cursor를 폐기하고 첫 페이지부터 다시 요청합니다.
- \`totalCount\`는 관련도 상위 검색 결과 크기로 최대 30입니다.

### 현재 구현 상태

- **현재 동작:** \`q\`, \`folderId\`, \`unassigned\`, \`deleted\`, \`favorite\`, \`sortBy\`, \`order\`, \`cursor\`, \`limit\`
- **계약만 제공:** 대표 태그(\`representativeTag\`)
- \`q\`가 없는 일반 목록은 \`sortBy\`/\`order\`에 따라 정렬되며, 검색은 위 설명처럼 \`score\` 내림차순으로 고정됩니다. 두 경로 모두 cursor 페이지네이션으로 \`nextCursor\`·\`hasNext\`를 실제 계산해 반환합니다.
- \`representativeTag\`는 대표 태그 선정 로직 구현 전까지 \`null\`을 반환합니다.
`

const CREATE_LINK_DESCRIPTION = `
URL과 사용자 입력값을 먼저 저장한 뒤 링크 정보 수집, AI 요약, AI 태그, 임베딩 생성을 현재 프로세스에서 비동기로 처리합니다. 저장 직후 상세 조회에서는 전체 분석 상태인 \`processingStatus=PENDING\`일 수 있습니다.

\`folderId\`를 생략하거나 \`null\`로 보내면 미분류로 저장합니다. \`memo\`와 \`reminderAt\`도 선택값이며 생략하거나 \`null\`로 보내면 설정하지 않습니다. \`reminderAt\`은 타임존을 포함한 ISO 8601 미래 시각으로 전달합니다.

### 현재 구현 상태

- URL, 폴더, 메모, 리마인드 시각을 저장한 뒤 링크 정보 수집과 AI 요약·태그·임베딩 생성을 시작합니다.
- 메시지 큐와 재시도 정책은 아직 적용하지 않았습니다.
`

const LINK_DETAIL_DESCRIPTION = `
링크 상세 화면에 필요한 폴더, 원문, 메타데이터, AI 요약, 태그, 메모, 연관 링크를 한 번에 반환합니다.

\`processingStatus\`는 요약·태그·임베딩 전체 처리 상태를 나타냅니다. 세 단계가 모두 성공해야 \`SUCCESS\`이며, 일부 분석 단계가 실패해도 저장된 요약·태그는 부분 결과로 반환될 수 있습니다.

### 현재 구현 상태

- 저장된 링크·폴더·메모·리마인드 시각·전체 분석 상태와 태그를 조회합니다.
- \`isFavorite\`, \`viewedAt\`은 저장된 실제 값을 반환합니다.
- \`publishedAt\`은 후속 구현입니다.
- 연관 링크는 같은 폴더·태그·제목·저장된 임베딩 유사도의 기본 가중치로 상위 5개를 반환합니다.
- 연관 링크 후보 조회에 실패해도 상세 조회는 성공하며 \`relatedLinks: []\`로 반환합니다.
- 응답 Example은 모든 비동기 처리가 완료된 **목표 계약**을 보여줍니다.
`

const MARK_LINK_VIEWED_DESCRIPTION = `
링크 상세 화면을 5초 이상 본 시점에 프론트가 한 번 호출합니다. \`GET /links/:linkId\`는 조회 시각과 조회수를 암묵적으로 변경하지 않습니다.

서버가 호출 시각을 \`viewedAt\`으로 기록하고 링크의 현재 폴더 \`viewCount\`를 1 증가시킵니다. 미분류 링크는 \`viewedAt\`만 기록하며 프론트는 timestamp를 보내지 않습니다.

### 현재 구현 상태

- 활성 상태인 소유 링크에만 \`viewedAt\`과 폴더 \`viewCount\`를 한 transaction으로 반영합니다.
`

const UPDATE_LINK_DESCRIPTION = `
폴더, 메모, 리마인드 시각, 즐겨찾기 중 변경할 필드만 전달합니다. 최소 한 필드는 필요합니다.

- \`folderId=null\`: 미분류로 이동
- \`memo=null\`: 메모 삭제
- \`reminderAt=null\`: 리마인드 해제
- \`isFavorite\`: 즐겨찾기 설정 또는 해제

### 현재 구현 상태

- 폴더 이동, 메모 변경, 리마인드 설정·해제, 즐겨찾기 설정·해제가 모두 저장됩니다.
`

const MOVE_LINKS_TO_FOLDER_DESCRIPTION = `
여러 활성 링크를 한 사용자 폴더 또는 미분류로 원자적으로 이동합니다. 링크가 전체·미분류·즐겨찾기·사용자 폴더·검색 중 어느 화면에서 선택됐는지는 구분하지 않습니다.

- 요청은 최대 ${MAX_BULK_MOVE_LINKS}개이며 중복 \`linkIds\`는 한 번만 처리합니다.
- \`folderId=null\`이면 미분류로 이동합니다.
- 이미 목적지에 있는 링크는 변경하지 않으며 \`unchangedCount\`에 포함합니다. 해당 링크의 \`updatedAt\`도 유지됩니다.
- 링크 하나라도 없거나, 삭제됐거나, 다른 사용자 소유라면 전체 요청을 실패시킵니다.
- 목적지 폴더가 없거나 다른 사용자 소유여도 전체 요청을 실패시킵니다.
- 검증과 이동은 하나의 DB transaction에서 실행해 부분 이동을 허용하지 않습니다.
`

const REMOVE_LINK_DESCRIPTION = `
링크를 즉시 영구 삭제하지 않고 \`deletedAt\`을 기록해 최근 삭제 상태로 이동합니다. 이후 \`GET /links?deleted=true\`로 조회할 수 있습니다.
`

const RESTORE_LINK_DESCRIPTION = `
최근 삭제 상태의 링크만 복구할 수 있습니다. 복구한 링크는 기존 폴더가 아니라 미분류로 이동하며 활성 링크에 호출하면 요청을 거부합니다.
`

const CREATE_LINK_TAG_DESCRIPTION = `
사용자가 링크 상세 화면에서 직접 입력한 태그를 추가하는 목표 계약입니다.

### 현재 구현 상태

- Endpoint, 인증, path/body validation, Swagger 요청·응답 계약만 연결되어 있습니다.
- 링크 소유권 확인, 이름 정규화, 중복 검사, \`tags\` 저장은 TODO입니다.
- 구현 전까지 유효한 요청도 \`501 Not Implemented\`를 반환합니다.
`

const REMOVE_LINK_TAG_DESCRIPTION = `
링크에 연결된 태그 하나를 삭제하는 목표 계약입니다.

### 현재 구현 상태

- Endpoint, 인증, path validation, Swagger 응답 계약만 연결되어 있습니다.
- 링크·태그 소유권 확인과 \`tags\` 삭제는 TODO입니다.
- 구현 전까지 유효한 요청도 \`501 Not Implemented\`를 반환합니다.
`

const TIMESTAMP_EXAMPLE = '2026-07-13T09:41:00.000Z'
const THUMBNAIL_EXAMPLE = 'https://static.example.com/thumbnail.png'

const CREATE_LINK_RESPONSE_EXAMPLE = {
    linkId: 42,
    url: 'https://toss.tech/article/experiment-design',
    savedAt: TIMESTAMP_EXAMPLE,
    reminderAt: '2026-08-20T12:00:00.000Z',
}

const LIST_LINKS_RESPONSE_EXAMPLE = {
    links: [
        {
            linkId: 42,
            title: '신입 디자이너가 알아야 할 실험 설계 팁',
            source: 'toss.tech',
            representativeTag: null,
            thumbnailUrl: THUMBNAIL_EXAMPLE,
            savedAt: TIMESTAMP_EXAMPLE,
            score: 0.87342,
        },
        {
            linkId: 41,
            title: 'Figma Variables 정리',
            source: 'figma.com',
            representativeTag: null,
            thumbnailUrl: null,
            savedAt: '2026-07-12T03:20:00.000Z',
            score: 0.64125,
        },
    ],
    pagination: {
        // 검색(q) 응답 예시라 cursor도 (score, id) 기준이다. {"v":"0.64125","id":41}
        nextCursor: 'eyJ2IjoiMC42NDEyNSIsImlkIjo0MX0',
        hasNext: true,
        limit: 9,
    },
    totalCount: 30,
}

const LINK_DETAIL_RESPONSE_EXAMPLE = {
    linkId: 42,
    url: 'https://toss.tech/article/experiment-design',
    folder: {
        folderId: 3,
        folderName: '디자인',
        color: '#d5d76a',
    },
    thumbnailUrl: THUMBNAIL_EXAMPLE,
    title: '신입 디자이너가 알아야 할 실험 설계 팁',
    source: 'toss.tech',
    publishedAt: '2026-06-19T00:00:00.000Z',
    savedAt: TIMESTAMP_EXAMPLE,
    isFavorite: true,
    viewedAt: '2026-07-13T10:00:00.000Z',
    processingStatus: 'SUCCESS',
    aiSummary: '실험 설계와 가설 검증의 중요성을 설명하는 글입니다.',
    tags: [
        { tagId: 7, name: '디자인', sourceType: 'ai', sortOrder: 1 },
        { tagId: 8, name: '실험 설계', sourceType: 'user', sortOrder: 2 },
    ],
    memo: '다음 회의 전에 다시 보기',
    reminderAt: '2026-08-20T12:00:00.000Z',
    relatedLinks: [
        {
            linkId: 41,
            title: 'Figma Variables 정리',
            thumbnailUrl: null,
        },
    ],
}

const UPDATE_LINK_RESPONSE_EXAMPLE = {
    linkId: 42,
    folderId: 3,
    memo: '다음 회의 전에 다시 보기',
    reminderAt: '2026-08-20T12:00:00.000Z',
    isFavorite: true,
    updatedAt: TIMESTAMP_EXAMPLE,
}

const MOVE_LINKS_TO_FOLDER_RESPONSE_EXAMPLE = {
    requestedCount: 3,
    movedCount: 2,
    unchangedCount: 1,
    folderId: 7,
}

const RESTORE_LINK_RESPONSE_EXAMPLE = {
    linkId: 42,
    folderId: null,
    restoredAt: TIMESTAMP_EXAMPLE,
}

const CREATE_LINK_TAG_RESPONSE_EXAMPLE = {
    tagId: 7,
    name: '실험 설계',
    sourceType: 'user',
    sortOrder: null,
}

const CREATE_LINK_TAG_NOT_IMPLEMENTED_ERROR = {
    code: HttpStatus.NOT_IMPLEMENTED,
    errorCode: COMMON_ERROR.INTERNAL_SERVER_ERROR.errorCode,
    message: '링크 태그 추가 로직은 아직 구현되지 않았습니다.',
} as const

const REMOVE_LINK_TAG_NOT_IMPLEMENTED_ERROR = {
    code: HttpStatus.NOT_IMPLEMENTED,
    errorCode: COMMON_ERROR.INTERNAL_SERVER_ERROR.errorCode,
    message: '링크 태그 삭제 로직은 아직 구현되지 않았습니다.',
} as const

// 링크 컨트롤러의 Swagger 계약을 모듈 단위로 관리한다.

export const ApiCreateLink = () =>
    applyDecorators(
        ApiOperation({
            summary: '링크 저장',
            description: CREATE_LINK_DESCRIPTION,
        }),
        ApiBody({
            type: CreateLinkDto,
            description: `- \`url\` (필수): 저장할 URL
- \`folderId\` (선택): 저장할 폴더 ID. 생략하거나 \`null\`이면 미분류
- \`memo\` (선택): 최대 ${LINK_MEMO_MAX_LENGTH}자. 생략하거나 \`null\`이면 설정하지 않음
- \`reminderAt\` (선택): 타임존을 포함한 ISO 8601 미래 시각. 생략하거나 \`null\`이면 설정하지 않음`,
        }),
        ApiCommonResponse(CreateLinkResponseDto, {
            status: 201,
            description: '저장 성공',
            dataExample: CREATE_LINK_RESPONSE_EXAMPLE,
        }),
        ApiCommonErrorResponses(
            COMMON_ERROR.VALIDATION,
            AUTH_ERROR.INVALID_TOKEN,
            FOLDER_ERROR.NOT_FOUND,
            LINK_ERROR.ALREADY_EXISTS,
        ),
    )

export const ApiListLinks = () =>
    applyDecorators(
        ApiOperation({
            summary: '링크 목록 조회',
            description: LIST_LINKS_DESCRIPTION,
        }),
        ApiQuery({
            name: 'q',
            required: false,
            schema: { type: 'string', minLength: 1 },
            description: '[선택] 현재 필터 범위 안에서 검색할 키워드',
        }),
        ApiQuery({
            name: 'folderId',
            required: false,
            schema: { type: 'integer', minimum: 1 },
            description: '[선택] 특정 사용자 폴더로 조회 범위 제한',
        }),
        ApiQuery({
            name: 'unassigned',
            required: false,
            schema: { type: 'boolean', default: false },
            description:
                '[선택, 기본값: false] true이면 미분류 링크만 조회. folderId와 함께 사용할 수 없음',
        }),
        ApiQuery({
            name: 'favorite',
            required: false,
            schema: { type: 'boolean', default: false },
            description: '[선택, 기본값: false] true이면 즐겨찾기 링크만 조회',
        }),
        ApiQuery({
            name: 'deleted',
            required: false,
            schema: { type: 'boolean', default: false },
            description:
                '[선택, 기본값: false] true이면 soft delete된 최근 삭제 링크만 조회',
        }),
        ApiQuery({
            name: 'sortBy',
            required: false,
            schema: {
                type: 'string',
                enum: ['savedAt', 'viewedAt', 'deletedAt'],
                default: 'savedAt',
            },
            description:
                '[선택, 기본값: savedAt] 정렬 기준. `viewedAt`은 조회 이력이 있는 링크만 대상으로 하며 `viewedAt=null` 링크는 결과에서 제외한다.',
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
            name: 'cursor',
            required: false,
            schema: { type: 'string', minLength: 1 },
            description: '[선택] 직전 응답의 nextCursor. 첫 페이지에서는 생략',
        }),
        ApiQuery({
            name: 'limit',
            required: false,
            schema: {
                type: 'integer',
                minimum: 1,
                maximum: MAX_PAGINATION_LIMIT,
                default: DEFAULT_PAGINATION_LIMIT,
            },
            description: `[선택, 기본값: ${DEFAULT_PAGINATION_LIMIT}] 페이지 크기. 1~${MAX_PAGINATION_LIMIT}`,
        }),
        ApiCommonResponse(ListLinksResponseDto, {
            description: '링크 목록 조회 성공',
            dataExample: LIST_LINKS_RESPONSE_EXAMPLE,
        }),
        ApiCommonErrorResponses(
            COMMON_ERROR.VALIDATION,
            AUTH_ERROR.INVALID_TOKEN,
        ),
    )

export const ApiLinkDetail = () =>
    applyDecorators(
        ApiOperation({
            summary: '링크 상세 조회',
            description: LINK_DETAIL_DESCRIPTION,
        }),
        ApiParam({
            name: 'linkId',
            required: true,
            type: Number,
            example: 42,
            description: '[필수] 조회할 링크 ID',
        }),
        ApiCommonResponse(LinkDetailResponseDto, {
            description: '조회 성공',
            dataExample: LINK_DETAIL_RESPONSE_EXAMPLE,
        }),
        ApiCommonErrorResponses(
            COMMON_ERROR.VALIDATION,
            AUTH_ERROR.INVALID_TOKEN,
            LINK_ERROR.NOT_FOUND,
        ),
    )

export const ApiLinkPreview = () =>
    applyDecorators(
        ApiOperation({
            summary: '링크 OG 미리보기 조회',
            description:
                '입력한 URL의 Open Graph 메타데이터에서 `title`·`thumbnailUrl`·`source`를 추출해 반환합니다. 링크를 저장하기 전 미리보기 용도이며 아무것도 저장하지 않습니다.\n\n- `title`: `og:title` → `<title>` 순으로 찾고, 없으면 `null`\n- `thumbnailUrl`: `og:image` → `twitter:image` 순으로 찾아 절대 URL로 반환하고, 없으면 `null`\n- `source`: 리다이렉트까지 따라간 최종 URL의 호스트(선행 `www.` 제거)',
        }),
        ApiQuery({
            name: 'url',
            required: true,
            type: String,
            example: 'https://toss.tech/article/50893',
            description: '[필수] 미리보기를 조회할 URL (http/https)',
        }),
        ApiCommonResponse(LinkPreviewResponseDto, {
            description: '조회 성공',
            dataExample: {
                title: '누군가는 토스를 테스트하는 동안, 우리는 테스트하는 법을 만듭니다.',
                thumbnailUrl:
                    'https://static.toss.im/assets/tech-blog/og-image/techblog-og.png',
                source: 'toss.tech',
            },
        }),
        ApiCommonErrorResponses(
            COMMON_ERROR.VALIDATION,
            AUTH_ERROR.INVALID_TOKEN,
            LINK_ERROR.PREVIEW_FETCH_FAILED,
            LINK_ERROR.PREVIEW_TIMEOUT,
            LINK_ERROR.PREVIEW_BAD_STATUS,
            LINK_ERROR.PREVIEW_REDIRECT_FAILED,
        ),
    )

export const ApiUpdateLink = () =>
    applyDecorators(
        ApiOperation({
            summary: '링크 수정 (폴더 / 메모 / 리마인드 / 즐겨찾기)',
            description: UPDATE_LINK_DESCRIPTION,
        }),
        ApiParam({
            name: 'linkId',
            required: true,
            type: Number,
            example: 42,
            description: '[필수] 수정할 링크 ID',
        }),
        ApiBody({
            type: UpdateLinkDto,
            description: `하나 이상의 필드를 입력해야 합니다.

- \`folderId\` (선택): 이동할 폴더 ID. \`null\`이면 미분류로 이동
- \`memo\` (선택): 최대 ${LINK_MEMO_MAX_LENGTH}자. \`null\`이면 삭제
- \`reminderAt\` (선택): 타임존을 포함한 ISO 8601 미래 시각. \`null\`이면 해제
- \`isFavorite\` (선택): \`true\`이면 설정, \`false\`이면 해제`,
        }),
        ApiCommonResponse(UpdateLinkResponseDto, {
            description: '수정 성공',
            dataExample: UPDATE_LINK_RESPONSE_EXAMPLE,
        }),
        ApiCommonErrorResponses(
            COMMON_ERROR.VALIDATION,
            AUTH_ERROR.INVALID_TOKEN,
            LINK_ERROR.NOT_FOUND,
            FOLDER_ERROR.NOT_FOUND,
        ),
    )

export const ApiMoveLinksToFolder = () =>
    applyDecorators(
        ApiOperation({
            summary: '링크 일괄 폴더 이동',
            description: MOVE_LINKS_TO_FOLDER_DESCRIPTION,
        }),
        ApiBody({
            type: MoveLinksToFolderDto,
            description:
                '`linkIds`의 활성 링크를 `folderId`로 이동합니다. `folderId=null`이면 미분류로 이동합니다.',
        }),
        ApiCommonResponse(MoveLinksToFolderResponseDto, {
            description: '일괄 이동 성공',
            dataExample: MOVE_LINKS_TO_FOLDER_RESPONSE_EXAMPLE,
        }),
        ApiCommonErrorResponses(
            COMMON_ERROR.VALIDATION,
            AUTH_ERROR.INVALID_TOKEN,
            LINK_ERROR.NOT_FOUND,
            FOLDER_ERROR.NOT_FOUND,
        ),
    )

export const ApiRemoveLink = () =>
    applyDecorators(
        ApiOperation({
            summary: '링크 삭제 (최근 삭제된 항목으로 이동)',
            description: REMOVE_LINK_DESCRIPTION,
        }),
        ApiParam({
            name: 'linkId',
            required: true,
            type: Number,
            example: 42,
            description: '[필수] 삭제할 링크 ID',
        }),
        ApiNoContentResponse({ description: '삭제 성공 (응답 본문 없음)' }),
        ApiCommonErrorResponses(
            COMMON_ERROR.VALIDATION,
            AUTH_ERROR.INVALID_TOKEN,
            LINK_ERROR.NOT_FOUND,
        ),
    )

export const ApiRestoreLink = () =>
    applyDecorators(
        ApiOperation({
            summary: '링크 복구 (미분류로 복원)',
            description: RESTORE_LINK_DESCRIPTION,
        }),
        ApiParam({
            name: 'linkId',
            required: true,
            type: Number,
            example: 42,
            description: '[필수] 복구할 링크 ID',
        }),
        ApiCommonResponse(RestoreLinkResponseDto, {
            status: 201,
            description: '복구 성공',
            dataExample: RESTORE_LINK_RESPONSE_EXAMPLE,
        }),
        ApiCommonErrorResponses(
            COMMON_ERROR.VALIDATION,
            AUTH_ERROR.INVALID_TOKEN,
            LINK_ERROR.NOT_FOUND,
            LINK_ERROR.NOT_DELETED,
        ),
    )

export const ApiMarkLinkViewed = () =>
    applyDecorators(
        ApiOperation({
            summary: '링크 열람 기록 (5초 이상 조회)',
            description: MARK_LINK_VIEWED_DESCRIPTION,
        }),
        ApiParam({
            name: 'linkId',
            required: true,
            type: Number,
            example: 42,
            description: '[필수] 5초 이상 조회한 링크 ID',
        }),
        ApiNoContentResponse({
            description: '조회 기록 성공 (응답 본문 없음)',
        }),
        ApiCommonErrorResponses(
            COMMON_ERROR.VALIDATION,
            AUTH_ERROR.INVALID_TOKEN,
            LINK_ERROR.NOT_FOUND,
        ),
    )

export const ApiCreateLinkTag = () =>
    applyDecorators(
        ApiOperation({
            summary: '링크 태그 추가 (Endpoint 껍데기 / 로직 TODO)',
            description: CREATE_LINK_TAG_DESCRIPTION,
        }),
        ApiParam({
            name: 'linkId',
            required: true,
            type: Number,
            example: 42,
            description: '[필수] 태그를 추가할 링크 ID',
        }),
        ApiBody({
            type: CreateLinkTagDto,
            description:
                '- `name` (필수): 추가할 태그 이름. 공백 제거 후 1~20자',
        }),
        ApiCommonResponse(LinkTagResponseDto, {
            status: HttpStatus.CREATED,
            description: '태그 추가 성공 (목표 응답 계약)',
            dataExample: CREATE_LINK_TAG_RESPONSE_EXAMPLE,
        }),
        ApiCommonErrorResponses(
            COMMON_ERROR.VALIDATION,
            AUTH_ERROR.INVALID_TOKEN,
            CREATE_LINK_TAG_NOT_IMPLEMENTED_ERROR,
        ),
    )

export const ApiRemoveLinkTag = () =>
    applyDecorators(
        ApiOperation({
            summary: '링크 태그 삭제 (Endpoint 껍데기 / 로직 TODO)',
            description: REMOVE_LINK_TAG_DESCRIPTION,
        }),
        ApiParam({
            name: 'linkId',
            required: true,
            type: Number,
            example: 42,
            description: '[필수] 태그가 연결된 링크 ID',
        }),
        ApiParam({
            name: 'tagId',
            required: true,
            type: Number,
            example: 7,
            description: '[필수] 삭제할 태그 ID',
        }),
        ApiNoContentResponse({
            description: '태그 삭제 성공 (목표 응답 계약, 본문 없음)',
        }),
        ApiCommonErrorResponses(
            COMMON_ERROR.VALIDATION,
            AUTH_ERROR.INVALID_TOKEN,
            REMOVE_LINK_TAG_NOT_IMPLEMENTED_ERROR,
        ),
    )
