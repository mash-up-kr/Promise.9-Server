import { Injectable } from '@nestjs/common'

import { RecommendationQueryInput } from './dto/recommendation.dto'
import { MIN_RECOMMENDATION_CANDIDATE_COUNT } from './recommendation.constant'
import { RecommendationRepository } from './recommendation.repository'
import { rankRecommendationCandidates } from './recommendation.util'

@Injectable()
export class RecommendationService {
    constructor(
        private readonly recommendationRepository: RecommendationRepository,
    ) {}

    async list(userId: number, query: RecommendationQueryInput) {
        const candidates =
            await this.recommendationRepository.findCandidates(userId)

        if (candidates.length < MIN_RECOMMENDATION_CANDIDATE_COUNT) {
            return null
        }

        return {
            items: rankRecommendationCandidates(candidates, query.limit),
        }
    }
}
