import { Injectable, Logger } from '@nestjs/common'

import { BaseException } from '../../../common/exception/base.exception'
import { ListLinksQueryInput } from '../dto/link.dto'
import { EmbeddingService } from '../embedding/embedding.service'
import {
    MAX_SEARCH_RESULTS,
    SEARCH_TEXT_CANDIDATE_LIMIT,
    SEARCH_VECTOR_CANDIDATE_LIMIT,
} from '../link.constants'
import { LinkRow } from '../link.schema'
import { LINK_ERROR } from '../link-error.constant'
import { tokenizeLinkText } from '../link-similarity.util'

import { SearchLinkCandidate, SearchRepository } from './search.repository'
import {
    parseSearchCursor,
    roundSearchScore,
    SearchCursor,
    takeSearchPage,
} from './search.util'
import {
    calculateSearchSignals,
    RankedSearchCandidate,
    rankSearchCandidates,
} from './search-ranking'
import { SEARCH_QUERY_TOKEN_LIMIT } from './search-ranking.constant'

export type SearchResultRow = Pick<
    LinkRow,
    'id' | 'title' | 'domain' | 'metadata' | 'createdAt' | 'reminderAt'
>
type ScoredLink = { row: SearchResultRow; score: number }

// 검색 결과 한 페이지. rows는 다음 페이지 판단을 위해 limit + 1개까지 담긴다.
// 운영 검색은 관련도 상위 MAX_SEARCH_RESULTS 안에서만 커서 페이지네이션한다.
type SearchPage = { rows: ScoredLink[]; totalCount: number }

type QueryRankingResult = {
    candidates: SearchLinkCandidate[]
    ranked: RankedSearchCandidate[]
}

@Injectable()
export class SearchService {
    private readonly logger = new Logger(SearchService.name)

    constructor(
        private readonly embeddingService: EmbeddingService,
        private readonly searchRepository: SearchRepository,
    ) {}

    async search(
        userId: number,
        input: ListLinksQueryInput,
    ): Promise<SearchPage> {
        const cursor = this.resolveCursor(input.cursor)
        const query = input.q ?? ''
        const { candidates, ranked } = await this.rankQuery(
            userId,
            query,
            input,
        )
        const capped = ranked
            .map((candidate) => ({
                id: candidate.id,
                score: roundSearchScore(candidate.score),
            }))
            // cursor가 비교하는 반올림 점수를 기준으로 다시 정렬해야, 반올림 후
            // 동점이 된 후보도 id 순서대로 다음 페이지에 이어진다.
            .sort(
                (left, right) => right.score - left.score || right.id - left.id,
            )
            .slice(0, MAX_SEARCH_RESULTS)
        const page = takeSearchPage(capped, cursor, input.limit)
        const candidateById = new Map(
            candidates.map((candidate) => [candidate.id, candidate]),
        )

        return {
            rows: page.flatMap((rankedCandidate) => {
                const candidate = candidateById.get(rankedCandidate.id)

                return candidate
                    ? [{ row: candidate, score: rankedCandidate.score }]
                    : []
            }),
            totalCount: capped.length,
        }
    }

    private async rankQuery(
        userId: number,
        query: string,
        scope: ListLinksQueryInput,
    ): Promise<QueryRankingResult> {
        const tokens = this.candidateTokens(query)
        const textCandidateOptions = {
            limit: SEARCH_TEXT_CANDIDATE_LIMIT,
            scope,
        }
        const vectorCandidateOptions = {
            limit: SEARCH_VECTOR_CANDIDATE_LIMIT,
            scope,
        }
        // lexical 후보와 query embedding을 동시에 시작한다. embedding이 먼저
        // 끝나면 lexical 완료를 기다리지 않고 바로 vector 후보를 조회한다.
        const semanticCandidatesPromise = this.tryEmbedQuery(query).then(
            async (queryEmbedding) => ({
                queryEmbedding,
                vectorIds: queryEmbedding
                    ? await this.searchRepository.findVectorCandidateIds(
                          userId,
                          queryEmbedding,
                          vectorCandidateOptions,
                      )
                    : [],
            }),
        )
        const [
            titleIds,
            folderIds,
            tagIds,
            contentIds,
            { queryEmbedding, vectorIds },
        ] = await Promise.all([
            this.searchRepository.findTitleCandidateIds(
                userId,
                tokens,
                textCandidateOptions,
            ),
            this.searchRepository.findFolderKeywordCandidateIds(
                userId,
                tokens,
                textCandidateOptions,
            ),
            this.searchRepository.findTagKeywordCandidateIds(
                userId,
                tokens,
                textCandidateOptions,
            ),
            this.searchRepository.findContentCandidateIds(
                userId,
                tokens,
                textCandidateOptions,
            ),
            semanticCandidatesPromise,
        ])
        const candidates = await this.searchRepository.findCandidates(
            userId,
            this.unionIds(titleIds, folderIds, tagIds, contentIds, vectorIds),
            queryEmbedding,
            scope,
        )
        const ranked = rankSearchCandidates(
            candidates.map((candidate) => ({
                id: candidate.id,
                signals: calculateSearchSignals(tokens.join(' '), {
                    title: candidate.title,
                    folder: candidate.folderName,
                    tags: candidate.tags,
                    content: this.queryContent(candidate),
                    embeddingSimilarity: candidate.embeddingSimilarity,
                }),
            })),
        )

        return { candidates, ranked }
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

    private queryContent(candidate: SearchLinkCandidate): string {
        return [
            candidate.aiSummary,
            candidate.memo,
            candidate.domain,
            candidate.originalUrl,
            candidate.finalUrl,
            candidate.description,
        ]
            .filter((value): value is string => Boolean(value))
            .join(' ')
    }

    private candidateTokens(text: string): string[] {
        return [...new Set(tokenizeLinkText(text))].slice(
            0,
            SEARCH_QUERY_TOKEN_LIMIT,
        )
    }

    private unionIds(...groups: readonly number[][]): number[] {
        return [...new Set(groups.flat())]
    }

    private async tryEmbedQuery(query: string): Promise<number[] | null> {
        try {
            return await this.embeddingService.embedQuery(query)
        } catch (error) {
            const message =
                error instanceof Error ? error.message : String(error)

            this.logger.warn(
                `검색 쿼리 임베딩에 실패해 키워드 신호만 사용합니다. error=${message}`,
            )

            return null
        }
    }
}
