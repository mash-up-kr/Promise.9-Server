import { Injectable, Logger } from '@nestjs/common'

import { ListLinksQueryInput } from './dto/link.dto'
import { LinkRepository } from './link.repository'
import { LinkRow } from './link.schema'
import { LinkEmbeddingService } from './link-embedding.service'
import { scoreSearchCandidates } from './link-search.util'

export type ScoredLink = { row: LinkRow; score: number | null }

@Injectable()
export class LinkSearchService {
    private readonly logger = new Logger(LinkSearchService.name)

    constructor(
        private readonly linkEmbeddingService: LinkEmbeddingService,
        private readonly linkRepository: LinkRepository,
    ) {}

    async search(
        userId: number,
        input: ListLinksQueryInput,
    ): Promise<ScoredLink[]> {
        const queryEmbedding = await this.tryEmbedQuery(input.q ?? '')

        if (!queryEmbedding) {
            const { rows } = await this.linkRepository.list(userId, input)

            return rows
                .slice(0, input.limit)
                .map((row) => ({ row, score: null }))
        }

        const [vectorCandidates, keywordCandidateIds] = await Promise.all([
            this.linkRepository.findVectorCandidates(
                userId,
                input,
                queryEmbedding,
            ),
            this.linkRepository.findKeywordCandidateIds(userId, input),
        ])
        const candidates = scoreSearchCandidates(
            vectorCandidates,
            keywordCandidateIds,
            input.limit,
        )
        const rows = await this.linkRepository.findByIdsInOrder(
            candidates.map((candidate) => candidate.id),
        )
        const scoreById = new Map(
            candidates.map((candidate) => [candidate.id, candidate.score]),
        )

        return rows.map((row) => ({
            row,
            score: scoreById.get(row.id) ?? null,
        }))
    }

    private async tryEmbedQuery(q: string): Promise<number[] | null> {
        try {
            return await this.linkEmbeddingService.embedQuery(q)
        } catch (error) {
            const message =
                error instanceof Error ? error.message : String(error)

            this.logger.warn(
                `검색 쿼리 임베딩에 실패해 키워드 검색으로 폴백합니다. error=${message}`,
            )

            return null
        }
    }
}
