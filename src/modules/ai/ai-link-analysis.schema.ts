import { z } from 'zod'

import { AI_LINK_ANALYSIS } from './ai.constants'

// 요약·태그·검토 판정을 한 번의 structured output으로 받고 DB 컬럼 길이 제약까지 검증한다.
// reviewReason은 needsReview가 false일 때 null이 되므로 optional 대신 nullable로 둔다.
export const aiLinkAnalysisResultSchema = z.object({
    summary: z.string().min(1).max(AI_LINK_ANALYSIS.summaryMaxLength),
    tags: z
        .array(z.string().min(1).max(AI_LINK_ANALYSIS.tagMaxLength))
        .max(AI_LINK_ANALYSIS.tagMaxCount),
    needsReview: z.boolean(),
    reviewReason: z
        .string()
        .max(AI_LINK_ANALYSIS.reviewReasonMaxLength)
        .nullable(),
})
