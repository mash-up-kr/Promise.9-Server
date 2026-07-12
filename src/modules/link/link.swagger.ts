import { applyDecorators } from '@nestjs/common'
import {
    ApiBody,
    ApiNoContentResponse,
    ApiOperation,
    ApiQuery,
} from '@nestjs/swagger'

import { ApiCommonResponse } from '../../common/swagger/api-response.decorator'

import { CreateLinkDto, UpdateLinkDto } from './dto/link.dto'
import {
    CreateLinkResponseDto,
    LinkDetailResponseDto,
    RestoreLinkResponseDto,
    SearchLinkResponseDto,
    UpdateLinkResponseDto,
} from './dto/link.response.dto'

// 링크 컨트롤러의 Swagger 문서 데코레이터. 예시·응답 정의가 늘어도 컨트롤러 본문이
// 지저분해지지 않도록 엔드포인트별로 분리해 둔다.

export const ApiCreateLink = () =>
    applyDecorators(
        ApiOperation({ summary: '링크 저장' }),
        ApiBody({ type: CreateLinkDto }),
        ApiCommonResponse(CreateLinkResponseDto, {
            status: 201,
            description: '저장 성공',
        }),
    )

export const ApiSearchLinks = () =>
    applyDecorators(
        ApiOperation({ summary: '링크 검색 (제목·출처 기준)' }),
        ApiQuery({
            name: 'q',
            required: true,
            example: '성능',
            description: '검색 키워드 (제목·출처·URL 대상)',
        }),
        ApiQuery({
            name: 'folderId',
            required: false,
            example: 3,
            description: '특정 폴더로 범위 제한 (선택)',
        }),
        ApiCommonResponse(SearchLinkResponseDto, { description: '검색 성공' }),
    )

export const ApiLinkDetail = () =>
    applyDecorators(
        ApiOperation({ summary: '링크 상세 조회' }),
        ApiCommonResponse(LinkDetailResponseDto, { description: '조회 성공' }),
    )

export const ApiUpdateLink = () =>
    applyDecorators(
        ApiOperation({ summary: '링크 수정 (폴더 변경 / 메모 수정)' }),
        ApiBody({ type: UpdateLinkDto }),
        ApiCommonResponse(UpdateLinkResponseDto, { description: '수정 성공' }),
    )

export const ApiRemoveLink = () =>
    applyDecorators(
        ApiOperation({ summary: '링크 삭제 (최근 삭제된 항목으로 이동)' }),
        ApiNoContentResponse({ description: '삭제 성공 (응답 본문 없음)' }),
    )

export const ApiRestoreLink = () =>
    applyDecorators(
        ApiOperation({ summary: '링크 복구 (미분류로 복원)' }),
        ApiCommonResponse(RestoreLinkResponseDto, {
            status: 201,
            description: '복구 성공',
        }),
    )
