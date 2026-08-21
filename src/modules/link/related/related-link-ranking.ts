import {
    normalizeCosineSimilarity,
    tagJaccardSimilarity,
    tokenJaccardSimilarity,
} from '../link-similarity.util'

import { RELATED_LINK_RANKING_WEIGHTS } from './related-link.constant'

type RelatedLinkSignalKey = keyof typeof RELATED_LINK_RANKING_WEIGHTS

export type RelatedLinkComparableFeatures = {
    folderId?: number | null
    tags?: readonly string[] | null
    title?: string | null
}

export type RelatedLinkCandidateFeatures = RelatedLinkComparableFeatures & {
    embeddingSimilarity?: number | null
}

export type RelatedLinkRankingCandidate = {
    id: number
    signals: Partial<Record<RelatedLinkSignalKey, number | null | undefined>>
}

export type RankedRelatedLinkCandidate = {
    id: number
    score: number
}

const RELATED_LINK_SIGNAL_KEYS = Object.keys(
    RELATED_LINK_RANKING_WEIGHTS,
) as RelatedLinkSignalKey[]

export function rankRelatedLinkCandidates(
    candidates: readonly RelatedLinkRankingCandidate[],
): RankedRelatedLinkCandidate[] {
    return candidates
        .map((candidate) => {
            let weightedScore = 0
            let availableWeight = 0

            for (const key of RELATED_LINK_SIGNAL_KEYS) {
                const rawSignal = candidate.signals[key]

                if (rawSignal === null) continue

                weightedScore +=
                    clampRelatedLinkSignal(rawSignal) *
                    RELATED_LINK_RANKING_WEIGHTS[key]
                availableWeight += RELATED_LINK_RANKING_WEIGHTS[key]
            }

            return {
                id: candidate.id,
                score:
                    availableWeight > 0 ? weightedScore / availableWeight : 0,
            }
        })
        .sort((left, right) => right.score - left.score || right.id - left.id)
}

function clampRelatedLinkSignal(value: number | undefined): number {
    if (value === undefined || Number.isNaN(value)) {
        return 0
    }

    return Math.min(1, Math.max(0, value))
}

export function calculateRelatedLinkSignals(
    source: RelatedLinkComparableFeatures,
    candidate: RelatedLinkCandidateFeatures,
) {
    return {
        folder:
            source.folderId !== null &&
            source.folderId !== undefined &&
            candidate.folderId !== null &&
            candidate.folderId !== undefined &&
            source.folderId === candidate.folderId
                ? 1
                : 0,
        tag: tagJaccardSimilarity(source.tags, candidate.tags),
        title: tokenJaccardSimilarity(source.title, candidate.title),
        embedding:
            candidate.embeddingSimilarity === null ||
            candidate.embeddingSimilarity === undefined
                ? null
                : normalizeCosineSimilarity(candidate.embeddingSimilarity),
    }
}
