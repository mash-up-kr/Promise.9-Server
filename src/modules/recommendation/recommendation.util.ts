import {
    RecommendationAggregate,
    RecommendationItem,
} from './recommendation.type'

const compareText = (left: string, right: string): number => {
    if (left === right) return 0
    return left < right ? -1 : 1
}

const compareRecommendationItems = (
    left: RecommendationAggregate,
    right: RecommendationAggregate,
): number => {
    if (left.linkCount !== right.linkCount) {
        return right.linkCount - left.linkCount
    }

    const leftViewedAt = left.lastViewedAt
        ? left.lastViewedAt.getTime()
        : Number.NEGATIVE_INFINITY
    const rightViewedAt = right.lastViewedAt
        ? right.lastViewedAt.getTime()
        : Number.NEGATIVE_INFINITY
    if (leftViewedAt !== rightViewedAt) return rightViewedAt - leftViewedAt

    const typeOrder = compareText(left.type, right.type)
    if (typeOrder !== 0) return typeOrder

    return compareText(left.key, right.key)
}

export const rankRecommendationCandidates = (
    candidates: readonly RecommendationAggregate[],
    limit: number,
): RecommendationItem[] => {
    return [...candidates]
        .sort(compareRecommendationItems)
        .slice(0, limit)
        .map((candidate): RecommendationItem => {
            return {
                key: candidate.key,
                type: candidate.type,
                label: candidate.label,
                linkCount: candidate.linkCount,
                lastViewedAt: candidate.lastViewedAt?.toISOString() ?? null,
                ...(candidate.type === 'folder'
                    ? {
                          folderId: candidate.folderId,
                          color: candidate.color,
                      }
                    : { normalizedTag: candidate.normalizedTag }),
            }
        })
}
