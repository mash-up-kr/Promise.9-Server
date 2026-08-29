// 링크 페이지 정보 수집 요청 설정

export const LINK_CONTENT_USER_AGENT =
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
    '(KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36'

// 일반적인 HTML 응답 형식을 요청하고 한국어 콘텐츠를 우선한다.
export const LINK_CONTENT_REQUEST_HEADERS = {
    'User-Agent': LINK_CONTENT_USER_AGENT,
    Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'ko-KR,ko;q=0.9,en;q=0.8',
} as const

export const LINK_CONTENT_FETCH = {
    timeoutMs: 5000,
    // 과도한 메모리 사용을 막기 위해 링크 페이지와 robots 응답을 최대 1MB까지만 읽는다.
    maxBytes: 1024 * 1024,
    maxRedirects: 3,
} as const

// 외부 페이지가 제공하는 OG 이미지 URL이 JSONB와 API 응답을 과도하게 키우지 않게 제한한다.
export const LINK_CONTENT_IMAGE_URL_MAX_LENGTH = 8 * 1024

export const LINK_CONTENT_REDIRECT_STATUSES: readonly number[] = [
    301, 302, 303, 307, 308,
]

// DB 컬럼과 LLM 입력 크기에 맞춰 수집 결과의 필드별 최대 길이를 제한한다.
export const LINK_CONTENT_TEXT_LIMIT = {
    title: 512,
    description: 2_000,
    content: 16_000,
} as const
