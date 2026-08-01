// 메모 최대 길이
export const LINK_MEMO_MAX_LENGTH = 1000

// 하이브리드 검색: 키워드·벡터 각 경로에서 뽑을 후보 수
export const LINK_SEARCH_CANDIDATE_LIMIT = 50

// 하이브리드 검색: 키워드 부분일치 시 코사인 유사도에 더할 가산점.
// 의미가 비슷한 것들 사이에서 검색어를 정확히 포함한 링크를 상위로 끌어올린다.
export const LINK_SEARCH_KEYWORD_BOOST = 0.3

// 하이브리드 검색: 점수 반올림 자릿수(1e5 = 소수점 5자리).
// 응답 값과 커서 비교 값에 같은 정밀도를 써서 페이지 경계가 어긋나지 않게 한다.
export const LINK_SEARCH_SCORE_PRECISION = 1e5
