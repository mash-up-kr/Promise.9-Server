import { applyDecorators } from '@nestjs/common'
import { ApiBody, ApiOperation } from '@nestjs/swagger'

import { CreateFolderDto, UpdateFolderDto } from './dto/folder.dto'

// 폴더 컨트롤러의 Swagger 문서 데코레이터. 예시·응답 정의가 늘어도 컨트롤러 본문이
// 지저분해지지 않도록 엔드포인트별로 분리해 둔다.

export const ApiListFolders = () =>
    applyDecorators(
        ApiOperation({ summary: '폴더 목록 조회 (시스템 폴더 카운트 포함)' }),
    )

export const ApiCreateFolder = () =>
    applyDecorators(
        ApiOperation({ summary: '폴더 생성' }),
        ApiBody({ type: CreateFolderDto }),
    )

export const ApiRenameFolder = () =>
    applyDecorators(
        ApiOperation({ summary: '폴더 이름 변경' }),
        ApiBody({ type: UpdateFolderDto }),
    )

export const ApiRemoveFolder = () =>
    applyDecorators(
        ApiOperation({
            summary: '폴더 삭제 (하위 링크는 최근 삭제된 항목으로 이동)',
        }),
    )

export const ApiGetFolderLinks = () =>
    applyDecorators(ApiOperation({ summary: '폴더 내 링크 목록 조회' }))
