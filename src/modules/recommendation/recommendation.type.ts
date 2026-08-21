export type RecommendationCandidateType = 'folder' | 'tag'

export interface RecommendationAggregate {
    type: RecommendationCandidateType
    key: string
    label: string
    linkCount: number
    lastViewedAt: Date | null
    folderId?: number
    color?: string
    normalizedTag?: string
}

export interface RecommendationItem {
    key: string
    type: RecommendationCandidateType
    label: string
    linkCount: number
    lastViewedAt: string | null
    folderId?: number
    color?: string
    normalizedTag?: string
}
