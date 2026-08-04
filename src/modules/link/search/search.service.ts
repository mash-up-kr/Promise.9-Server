import { Injectable, Logger } from '@nestjs/common'

import { BaseException } from '../../../common/exception/base.exception'
import { ListLinksQueryInput } from '../dto/link.dto'
import { LinkRepository } from '../link.repository'
import { LinkRow } from '../link.schema'
import { LINK_ERROR } from '../link-error.constant'

import { EmbeddingService } from './embedding.service'
import {
    parseSearchCursor,
    scoreSearchCandidates,
    SearchCursor,
    takeSearchPage,
} from './search.util'

export type ScoredLink = { row: LinkRow; score: number }

// 검색 결과 한 페이지. rows는 다음 페이지 판단을 위해 limit + 1개까지 담긴다.
// totalCount는 커서와 무관한 후보 풀 전체 크기다.
export type SearchPage = { rows: ScoredLink[]; totalCount: number }

@Injectable()
export class SearchService {
    private readonly logger = new Logger(SearchService.name)

    constructor(
        private readonly embeddingService: EmbeddingService,
        private readonly linkRepository: LinkRepository,
    ) {}

    async search(
        userId: number,
        input: ListLinksQueryInput,
    ): Promise<SearchPage> {
        const cursor = this.resolveCursor(input.cursor)
        const queryEmbedding = await this.tryEmbedQuery(input.q ?? '')

        // 임베딩이 없으면 벡터 후보만 비워 키워드 검색으로 폴백한다.
        // 점수·정렬·커서 형식은 그대로 유지돼 페이지네이션이 끊기지 않는다.
        const [vectorCandidates, keywordCandidateIds] = await Promise.all([
            queryEmbedding
                ? this.linkRepository.findVectorCandidates(
                      userId,
                      input,
                      queryEmbedding,
                  )
                : [],
            this.linkRepository.findKeywordCandidateIds(userId, input),
        ])

        const candidates = scoreSearchCandidates(
            vectorCandidates,
            keywordCandidateIds,
        )
        const page = takeSearchPage(candidates, cursor, input.limit)
        const rows = await this.linkRepository.findByIdsInOrder(
            page.map((candidate) => candidate.id),
        )
        const scoreById = new Map(
            page.map((candidate) => [candidate.id, candidate.score]),
        )

        return {
            rows: rows.map((row) => ({
                row,
                score: scoreById.get(row.id) ?? 0,
            })),
            totalCount: candidates.length,
        }
    }

    // 검색 커서는 (점수, id) 형식이다. 목록 커서(타임스탬프)를 넘기면 400.
    private resolveCursor(cursor?: string): SearchCursor | undefined {
        if (!cursor) {
            return undefined
        }

        const parsed = parseSearchCursor(cursor)

        if (!parsed) {
            throw new BaseException(LINK_ERROR.INVALID_CURSOR)
        }

        return parsed
    }

    private async tryEmbedQuery(q: string): Promise<number[] | null> {
        try {
            return await this.embeddingService.embedQuery(q)
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
