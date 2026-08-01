// 메모 최대 길이
export const LINK_MEMO_MAX_LENGTH = 1000

// 하이브리드 검색: 키워드·벡터 각 경로에서 뽑을 후보 수
export const LINK_SEARCH_CANDIDATE_LIMIT = 50

// 하이브리드 검색: 키워드(ILIKE) 정확 일치 시 코사인 유사도에 더할 가산점.
// 의미가 비슷한 것들 사이에서 검색어를 정확히 포함한 링크를 상위로 끌어올린다.
export const LINK_SEARCH_KEYWORD_BOOST = 0.3
