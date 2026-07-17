// 링크 OG 미리보기 조회 설정

// 봇 차단을 피하려고 브라우저처럼 보이는 헤더로 요청한다.
export const OG_PREVIEW_BROWSER_HEADERS = {
    'User-Agent':
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
        '(KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
    Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'ko-KR,ko;q=0.9,en;q=0.8',
} as const

export const OG_PREVIEW_FETCH = {
    timeoutMs: 5000,
    // OG 메타는 <head>에 있어 앞부분만으로 충분하므로 본문을 1MB까지만 읽는다.
    maxBytes: 1024 * 1024,
    maxRedirects: 3,
} as const

export const OG_PREVIEW_REDIRECT_STATUSES: readonly number[] = [
    301, 302, 303, 307, 308,
]
