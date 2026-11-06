import { applyDecorators } from '@nestjs/common'
import {
    ApiNoContentResponse,
    ApiOkResponse,
    ApiOperation,
    ApiParam,
    ApiQuery,
} from '@nestjs/swagger'

import { COMMON_ERROR } from '../../common/exception/common-error-code.constant'
import { MAX_PAGINATION_LIMIT } from '../../common/pagination/pagination.constants'
import { ApiCommonErrorResponses } from '../../common/swagger/api-response.decorator'
import { AUTH_ERROR } from '../auth/auth-error.constant'

import { FOLDER_ERROR } from './folder-error.constant'

const folderIdParam = (description: string) =>
    ApiParam({
        name: 'folderId',
        required: true,
        type: Number,
        example: 3,
        description,
    })

export const ApiEnableFolderShare = () =>
    applyDecorators(
        ApiOperation({
            summary: '폴더 공유 켜기',
            description:
                '공유 토큰을 만들어 돌려줍니다. 이미 공유 중이면 원래 토큰을 그대로 돌려주므로 공유 링크가 바뀌지 않습니다. 본인 폴더만 가능합니다.',
        }),
        folderIdParam('[필수] 공유할 폴더 ID'),
        ApiOkResponse({
            description: '`shareToken`(공유 주소에 쓰는 값)과 `sharedAt`',
        }),
        ApiCommonErrorResponses(
            COMMON_ERROR.VALIDATION,
            AUTH_ERROR.INVALID_TOKEN,
            FOLDER_ERROR.NOT_FOUND,
        ),
    )

export const ApiDisableFolderShare = () =>
    applyDecorators(
        ApiOperation({
            summary: '폴더 공유 끄기',
            description:
                '토큰을 지워서 예전 공유 링크를 바로 막습니다. 다시 켜면 새 토큰이 만들어집니다.',
        }),
        folderIdParam('[필수] 공유를 끌 폴더 ID'),
        ApiNoContentResponse({ description: '성공 (응답 본문 없음)' }),
        ApiCommonErrorResponses(
            COMMON_ERROR.VALIDATION,
            AUTH_ERROR.INVALID_TOKEN,
            FOLDER_ERROR.NOT_FOUND,
        ),
    )

export const ApiGetSharedFolder = () =>
    applyDecorators(
        ApiOperation({
            summary: '공유 폴더 읽기 (로그인 필요 없음)',
            description:
                '공유 토큰으로 폴더 이름과 그 안의 링크를 저장 최신순으로 돌려줍니다. 읽기만 되고, 메모와 알림 시각 같은 소유자 값은 포함하지 않습니다.',
        }),
        ApiParam({
            name: 'shareToken',
            required: true,
            type: String,
            description: '[필수] 공유 켜기에서 받은 토큰',
        }),
        ApiQuery({
            name: 'cursor',
            required: false,
            type: String,
            description: '[선택] 이전 응답의 `pagination.nextCursor`',
        }),
        ApiQuery({
            name: 'limit',
            required: false,
            type: Number,
            description: `[선택] 한 번에 받을 개수 (최대 ${MAX_PAGINATION_LIMIT})`,
        }),
        ApiOkResponse({ description: '폴더와 링크 목록' }),
        ApiCommonErrorResponses(
            COMMON_ERROR.VALIDATION,
            FOLDER_ERROR.SHARE_NOT_FOUND,
        ),
    )
