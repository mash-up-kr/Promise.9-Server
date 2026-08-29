export const RELATED_LINK_TITLE_TOKEN_LIMIT = 12
export const DEFAULT_RELATED_LINK_LIMIT = 5

// 각 신호별 후보는 최종 결과의 2배까지만 hydrate한다.
export const RELATED_LINK_CONTEXT_CANDIDATE_LIMIT =
    DEFAULT_RELATED_LINK_LIMIT * 2
export const RELATED_LINK_VECTOR_CANDIDATE_LIMIT =
    DEFAULT_RELATED_LINK_LIMIT * 2

export const RELATED_LINK_RANKING_WEIGHTS = {
    folder: 0.1,
    tag: 0.25,
    title: 0.1,
    embedding: 0.55,
} as const
