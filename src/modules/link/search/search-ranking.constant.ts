export const SEARCH_QUERY_TOKEN_LIMIT = 12

export const SEARCH_VECTOR_STDDEV_MULTIPLIER = 1

export const SEARCH_RANKING_WEIGHTS = {
    titleKeyword: 0.3,
    summaryKeyword: 0.25,
    folderKeyword: 0.05,
    tagKeyword: 0.05,
    contentKeyword: 0.05,
    embedding: 0.3,
} as const
