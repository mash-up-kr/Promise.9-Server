export const SEARCH_QUERY_TOKEN_LIMIT = 12

export const SEARCH_RANKING_WEIGHTS = {
    titleKeyword: 0.1,
    folderKeyword: 0.1,
    tagKeyword: 0.25,
    contentKeyword: 0.1,
    embedding: 0.45,
} as const
