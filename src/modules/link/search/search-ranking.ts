import {
    normalizeCosineSimilarity,
    tokenizeLinkText,
} from '../link-similarity.util'

import {
    SEARCH_RANKING_WEIGHTS,
    SEARCH_VECTOR_STDDEV_MULTIPLIER,
} from './search-ranking.constant'

type SearchSignalKey = keyof typeof SEARCH_RANKING_WEIGHTS
type SearchSignals = Partial<Record<SearchSignalKey, number | null | undefined>>

export type SearchRankingCandidate = {
    id: number
    signals: SearchSignals
}

export type RankedSearchCandidate = {
    id: number
    score: number
}

export type SearchCandidateFeatures = {
    title?: string | null
    aiSummary?: string | null
    folder?: string | null
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
    const vectorThreshold = calculateVectorThreshold(candidates)

    return candidates
        .filter(({ signals }) => {
            if (hasKeywordMatch(signals)) return true

            const similarity = signals.embedding

            return (
                vectorThreshold !== null &&
                typeof similarity === 'number' &&
                Number.isFinite(similarity) &&
                normalizeCosineSimilarity(similarity) > vectorThreshold
            )
        })
        .map(({ id, signals }) => ({
            id,
            score: calculateWeightedScore(signals),
        }))
        .sort((left, right) => right.score - left.score || right.id - left.id)
}

function calculateVectorThreshold(
    candidates: readonly SearchRankingCandidate[],
): number | null {
    // 페이지나 최종 상위 30개가 아니라 요청 범위의 후보 합집합을 사용한다.
    // 키워드 일치 후보의 벡터도 포함하며 계산 불가능한 신호는 제외한다.
    const similarities = candidates.flatMap(({ signals }) => {
        const similarity = signals.embedding

        return typeof similarity === 'number' && Number.isFinite(similarity)
            ? [normalizeCosineSimilarity(similarity)]
            : []
    })

    if (similarities.length === 0) return null

    // 동일 점수의 합산 오차로 평균 경계가 흔들리지 않도록 편차를 합산한다.
    const referenceSimilarity = similarities[0]
    const mean =
        referenceSimilarity +
        similarities.reduce(
            (sum, similarity) => sum + (similarity - referenceSimilarity),
            0,
        ) /
            similarities.length
    const variance =
        similarities.reduce(
            (sum, similarity) => sum + (similarity - mean) ** 2,
            0,
        ) / similarities.length

    return mean + SEARCH_VECTOR_STDDEV_MULTIPLIER * Math.sqrt(variance)
}

function hasKeywordMatch(signals: SearchSignals): boolean {
    // 기타 본문(메모·URL 등)의 일치만으로는 관련성 필터를 우회하지 않는다.
    return (
        clampSearchSignal(signals.titleKeyword ?? undefined) > 0 ||
        clampSearchSignal(signals.summaryKeyword ?? undefined) > 0 ||
        clampSearchSignal(signals.tagKeyword ?? undefined) > 0 ||
        clampSearchSignal(signals.folderKeyword ?? undefined) > 0
    )
}

function calculateWeightedScore(signals: SearchSignals): number {
    let weightedScore = 0
    let availableWeightPercent = 0

    for (const key of SEARCH_SIGNAL_KEYS) {
        const rawSignal = signals[key]

        // 계산 불가인 null만 제외하고, 실제 0과 생략된 undefined는 유지한다.
        if (rawSignal === null) continue

        const weight = SEARCH_RANKING_WEIGHTS[key]
        weightedScore += clampSearchSignal(rawSignal) * weight
        // 소수 가중치의 누적 오차가 분모에 섞이지 않도록 정수 백분율로 합산한다.
        availableWeightPercent += weight * 100
    }

    return availableWeightPercent > 0
        ? weightedScore / (availableWeightPercent / 100)
        : 0
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
        summaryKeyword: queryTokenCoverage(query, candidate.aiSummary),
        folderKeyword: queryTokenCoverage(query, candidate.folder),
        tagKeyword: queryTokenCoverageAcrossTargets(
            query,
            candidate.tags ?? [],
        ),
        contentKeyword: queryTokenCoverage(query, candidate.content),
        embedding:
            typeof candidate.embeddingSimilarity !== 'number' ||
            !Number.isFinite(candidate.embeddingSimilarity)
                ? null
                : normalizeCosineSimilarity(candidate.embeddingSimilarity),
    }
}
