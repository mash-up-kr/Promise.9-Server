export const SEARCH_QUERY_TOKEN_LIMIT = 12

export const SEARCH_VECTOR_STDDEV_MULTIPLIER = 1

// 정확 폴더 일치는 [0.9, 1], 나머지는 [0, 0.9] 구간에 배치한다.
export const SEARCH_SCORE_RANGE_SPLIT = 0.9
export const SEARCH_EXACT_FOLDER_SCORE_SCALE = 0.1

export const SEARCH_RANKING_WEIGHTS = {
    titleKeyword: 0.3,
    summaryKeyword: 0.25,
    folderKeyword: 0.05,
    tagKeyword: 0.05,
    contentKeyword: 0.05,
    embedding: 0.3,
} as const
