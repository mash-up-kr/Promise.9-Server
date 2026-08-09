import { applyDecorators } from '@nestjs/common'
import { ApiOperation, ApiQuery } from '@nestjs/swagger'

import { COMMON_ERROR } from '../../common/exception/common-error-code.constant'
import {
    ApiCommonErrorResponses,
    ApiCommonResponse,
} from '../../common/swagger/api-response.decorator'
import { AUTH_ERROR } from '../auth/auth-error.constant'

import { RecommendationResponseDto } from './dto/recommendation.response.dto'
import {
    DEFAULT_RECOMMENDATION_LIMIT,
    MAX_RECOMMENDATION_LIMIT,
} from './recommendation.constant'

const RECOMMENDATION_RESPONSE_EXAMPLE = {
    items: [
        {
            key: 'folder:3',
            type: 'folder',
            label: '디자인',
            linkCount: 12,
            lastViewedAt: '2026-08-08T00:00:00.000Z',
            folderId: 3,
            color: '#61a8ef',
        },
        {
            key: 'tag:product-design',
            type: 'tag',
            label: 'Product Design',
            linkCount: 9,
            lastViewedAt: null,
            normalizedTag: 'product-design',
        },
        {
            key: 'folder:8',
            type: 'folder',
            label: '개발',
            linkCount: 7,
            lastViewedAt: '2026-08-05T00:00:00.000Z',
            folderId: 8,
            color: '#7f6df2',
        },
        {
            key: 'tag:travel',
            type: 'tag',
            label: '여행',
            linkCount: 5,
            lastViewedAt: null,
            normalizedTag: 'travel',
        },
    ],
}

export const ApiListRecommendations = () =>
    applyDecorators(
        ApiOperation({
            summary: '자주 저장한 키워드 조회',
            description:
                '홈 화면의 자주 저장한 키워드 섹션에 사용할 폴더·태그 목록입니다. 활성 링크가 3개 이상 연결된 폴더와 태그만 후보로 삼아 링크 수 내림차순으로 정렬하고, 동점이면 최근 조회 시각을 사용합니다. 필터를 통과한 전체 후보가 4개 이상일 때만 목록을 반환하며, 3개 이하면 클라이언트가 섹션 전체를 숨길 수 있도록 data를 null로 반환합니다.',
        }),
        ApiQuery({
            name: 'limit',
            required: false,
            schema: {
                type: 'integer',
                minimum: 1,
                maximum: MAX_RECOMMENDATION_LIMIT,
                default: DEFAULT_RECOMMENDATION_LIMIT,
            },
            description: `[선택, 기본값: ${DEFAULT_RECOMMENDATION_LIMIT}] 반환할 추천 항목 최대 개수. 1~${MAX_RECOMMENDATION_LIMIT}`,
        }),
        ApiCommonResponse(RecommendationResponseDto, {
            description:
                '자주 저장한 키워드 조회 성공. 후보가 3개 이하면 data는 null',
            dataNullable: true,
            dataExample: RECOMMENDATION_RESPONSE_EXAMPLE,
        }),
        ApiCommonErrorResponses(
            COMMON_ERROR.VALIDATION,
            AUTH_ERROR.INVALID_TOKEN,
        ),
    )
