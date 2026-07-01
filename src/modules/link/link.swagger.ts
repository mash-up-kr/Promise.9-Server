import { applyDecorators } from '@nestjs/common'
import { ApiBody, ApiOperation, ApiQuery } from '@nestjs/swagger'

import { CreateLinkDto, UpdateLinkDto } from './dto/link.dto'

// 링크 컨트롤러의 Swagger 문서 데코레이터. 예시·응답 정의가 늘어도 컨트롤러 본문이
// 지저분해지지 않도록 엔드포인트별로 분리해 둔다.

export const ApiCreateLink = () =>
    applyDecorators(
        ApiOperation({ summary: '링크 저장' }),
        ApiBody({ type: CreateLinkDto }),
    )

export const ApiSearchLinks = () =>
    applyDecorators(
        ApiOperation({ summary: '링크 검색 (제목·출처 기준)' }),
        ApiQuery({ name: 'q', required: true }),
        ApiQuery({ name: 'folderId', required: false }),
    )

export const ApiLinkDetail = () =>
    applyDecorators(ApiOperation({ summary: '링크 상세 조회' }))

export const ApiUpdateLink = () =>
    applyDecorators(
        ApiOperation({ summary: '링크 수정 (폴더 변경 / 메모 수정)' }),
        ApiBody({ type: UpdateLinkDto }),
    )

export const ApiRemoveLink = () =>
    applyDecorators(
        ApiOperation({ summary: '링크 삭제 (최근 삭제된 항목으로 이동)' }),
    )

export const ApiRestoreLink = () =>
    applyDecorators(ApiOperation({ summary: '링크 복구 (미분류로 복원)' }))
