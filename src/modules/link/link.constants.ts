// 메모 최대 길이
export const LINK_MEMO_MAX_LENGTH = 1000

// 운영 검색은 전체 일치 행을 끝없이 나열하지 않고 관련도 상위 결과만 제공한다.
export const MAX_SEARCH_RESULTS = 30

// 제목·태그·본문은 pg_trgm 후보를 최종 결과 수만큼만 회수한다.
// 짧은 토큰은 인덱스를 못 탈 수 있어 후보 수를 더 키우지 않는다.
export const SEARCH_TEXT_CANDIDATE_LIMIT = MAX_SEARCH_RESULTS

// 벡터 후보는 ANN 인덱스 없이 사용자 범위를 exact scan한다.
// LIMIT은 거리 계산량보다 후속 hydrate·재랭킹 대상을 제한하는 역할을 한다.
export const SEARCH_VECTOR_CANDIDATE_LIMIT = MAX_SEARCH_RESULTS

// 하이브리드 검색: 점수 반올림 자릿수(1e5 = 소수점 5자리).
// 응답 값과 커서 비교 값에 같은 정밀도를 써서 페이지 경계가 어긋나지 않게 한다.
export const LINK_SEARCH_SCORE_PRECISION = 1e5
