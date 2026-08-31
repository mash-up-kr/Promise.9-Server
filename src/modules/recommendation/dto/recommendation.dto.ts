import { z } from 'zod'

import {
    DEFAULT_RECOMMENDATION_LIMIT,
    MAX_RECOMMENDATION_LIMIT,
} from '../recommendation.constant'

export const recommendationQuerySchema = z
    .object({
        limit: z.coerce
            .number()
            .int()
            .min(1)
            .max(MAX_RECOMMENDATION_LIMIT)
            .optional()
            .default(DEFAULT_RECOMMENDATION_LIMIT),
    })
    .strict()

export type RecommendationQueryInput = z.infer<typeof recommendationQuerySchema>
