export const SEARCH_QUERY_TOKEN_LIMIT = 12

export const SEARCH_RANKING_WEIGHTS = {
    titleKeyword: 0.1,
    folderKeyword: 0.15,
    tagKeyword: 0.1,
    contentKeyword: 0.05,
    embedding: 0.6,
} as const
