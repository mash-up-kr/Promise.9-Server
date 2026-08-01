import { LINK_SEARCH_KEYWORD_BOOST } from './link.constants'

export type VectorCandidate = { id: number; score: number }
export type ScoredCandidate = { id: number; score: number }

export function scoreSearchCandidates(
    vectorCandidates: VectorCandidate[],
    keywordCandidateIds: number[],
    limit: number,
): ScoredCandidate[] {
    const similarityById = new Map(
        vectorCandidates.map((candidate) => [candidate.id, candidate.score]),
    )
    const keywordIds = new Set(keywordCandidateIds)

    return [...new Set([...similarityById.keys(), ...keywordIds])]
        .map((id) => {
            const similarity = similarityById.get(id) ?? 0
            const score = keywordIds.has(id)
                ? Math.min(1, similarity + LINK_SEARCH_KEYWORD_BOOST)
                : similarity

            return { id, score }
        })
        .sort((a, b) => b.score - a.score)
        .slice(0, limit)
}
