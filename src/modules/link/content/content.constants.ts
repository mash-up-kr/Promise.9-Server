// 링크 페이지 정보 수집 요청 설정

// 봇 차단을 피하려고 브라우저처럼 보이는 헤더로 요청한다.
export const LINK_CONTENT_REQUEST_HEADERS = {
    'User-Agent':
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
        '(KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
    Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'ko-KR,ko;q=0.9,en;q=0.8',
} as const

export const LINK_CONTENT_FETCH = {
    timeoutMs: 5000,
    // 과도한 메모리 사용을 막기 위해 링크 페이지 응답은 최대 1MB까지만 읽는다.
    maxBytes: 1024 * 1024,
    maxRedirects: 3,
} as const

export const LINK_CONTENT_REDIRECT_STATUSES: readonly number[] = [
    301, 302, 303, 307, 308,
]

export const MAX_CRAWLED_CONTENT_LENGTH = 16_000
