// 링크 분석의 최소 재시도 단위. 실패한 작업만 다시 실행해 AI 중복 호출을 막는다.
// CONTENT는 크롤링과 title·description 저장, EMBEDDING은 검색용 벡터 생성을 담당한다.
export const LINK_ANALYSIS_TASKS = [
    'CONTENT',
    'SUMMARY',
    'TAGS',
    'EMBEDDING',
] as const

// SUMMARY·TAGS는 CONTENT 결과를 입력으로 쓰므로 단독 재시도 시 크롤링을 다시 실행한다.
export const LINK_ANALYSIS_CONTENT_DEPENDENT_TASKS = [
    'SUMMARY',
    'TAGS',
] as const

// 인라인 1회를 포함한 총 시도 횟수 상한. 초과하면 재발행을 멈추고 실패로 확정한다.
export const LINK_ANALYSIS_MAX_ATTEMPTS = 4

// 재시도 메시지 포맷. 인라인 실행이 실패한 작업만 tasks에 담아 발행한다.
export const LINK_ANALYSIS_MESSAGE_VERSION = 2 as const
