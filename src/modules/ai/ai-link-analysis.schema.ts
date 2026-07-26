import { z } from 'zod'

import { AI_LINK_ANALYSIS } from './ai.constants'

// 링크 요약 structured output의 필수 필드와 최대 길이를 검증한다.
export const aiSummaryResultSchema = z.object({
    summary: z.string().min(1).max(AI_LINK_ANALYSIS.summaryMaxLength),
})

// 링크 태그 structured output의 개수와 DB 컬럼 길이 제약을 검증한다.
export const aiTagsResultSchema = z.object({
    tags: z
        .array(z.string().min(1).max(AI_LINK_ANALYSIS.tagMaxLength))
        .max(AI_LINK_ANALYSIS.tagMaxCount),
})
