import {
    normalizeCosineSimilarity,
    tokenizeLinkText,
} from '../link-similarity.util'

import { SEARCH_RANKING_WEIGHTS } from './search-ranking.constant'

type SearchSignalKey = keyof typeof SEARCH_RANKING_WEIGHTS

export type SearchRankingCandidate = {
    id: number
    signals: Partial<Record<SearchSignalKey, number | null | undefined>>
}

export type RankedSearchCandidate = {
    id: number
    score: number
}

export type SearchCandidateFeatures = {
    title?: string | null
    tags?: readonly string[] | null
    content?: string | null
    embeddingSimilarity?: number | null
}

const SEARCH_SIGNAL_KEYS = Object.keys(
    SEARCH_RANKING_WEIGHTS,
) as SearchSignalKey[]

export function rankSearchCandidates(
    candidates: readonly SearchRankingCandidate[],
): RankedSearchCandidate[] {
    return candidates
        .map((candidate) => {
            let weightedScore = 0
            let availableWeight = 0

            for (const key of SEARCH_SIGNAL_KEYS) {
                const rawSignal = candidate.signals[key]

                // null은 계산되지 않은 신호다. 실제로 계산된 0과 구분해
                // 결측 신호의 가중치만 제외하고 나머지 가중치를 재정규화한다.
                if (rawSignal === null) continue

                weightedScore +=
                    clampSearchSignal(rawSignal) * SEARCH_RANKING_WEIGHTS[key]
                availableWeight += SEARCH_RANKING_WEIGHTS[key]
            }

            return {
                id: candidate.id,
                score:
                    availableWeight > 0 ? weightedScore / availableWeight : 0,
            }
        })
        .sort((left, right) => right.score - left.score || right.id - left.id)
}

function clampSearchSignal(value: number | undefined): number {
    if (value === undefined || Number.isNaN(value)) {
        return 0
    }

    return Math.min(1, Math.max(0, value))
}

// 검색어 토큰 중 대상 필드가 부분일치로 포함하는 비율이다. 문서 길이가 긴
// 요약·메모가 불필요하게 불리해지는 Jaccard 대신 query coverage를 사용한다.
// 후보 조회의 SQL 표현식과 같이 대상 필드는 소문자화하고 공백만 제거한다.
// 구두점까지 제거하면 SQL 후보에는 없던 문서가 점수 단계에서만 일치하므로,
// 후보 회수와 점수 계산의 부분일치 기준을 동일하게 유지한다.
export function queryTokenCoverage(
    query: string | null | undefined,
    target: string | null | undefined,
): number {
    return queryTokenCoverageAcrossTargets(query, [target])
}

function queryTokenCoverageAcrossTargets(
    query: string | null | undefined,
    targets: readonly (string | null | undefined)[],
): number {
    const queryTokens = new Set(tokenizeLinkText(query))

    if (queryTokens.size === 0) {
        return 0
    }

    const normalizedTargets = targets.map(normalizeKeywordTarget)
    let matches = 0

    for (const token of queryTokens) {
        if (normalizedTargets.some((target) => target.includes(token))) {
            matches += 1
        }
    }

    return matches / queryTokens.size
}

function normalizeKeywordTarget(text: string | null | undefined): string {
    return text?.toLocaleLowerCase('und').replace(/\s/gu, '') ?? ''
}

export function calculateSearchSignals(
    query: string,
    candidate: SearchCandidateFeatures,
) {
    return {
        titleKeyword: queryTokenCoverage(query, candidate.title),
        tagKeyword: queryTokenCoverageAcrossTargets(
            query,
            candidate.tags ?? [],
        ),
        contentKeyword: queryTokenCoverage(query, candidate.content),
        embedding:
            candidate.embeddingSimilarity === null ||
            candidate.embeddingSimilarity === undefined
                ? null
                : normalizeCosineSimilarity(candidate.embeddingSimilarity),
    }
}
