// 요약과 태그 생성에 사용할 링크 페이지 정보.
export type CollectedLinkContent = {
    title: string | null
    description: string | null
    content: string | null
}

// 저장 전 링크 미리보기에 필요한 응답 정보.
export type LinkPreview = {
    title: string | null
    thumbnailUrl: string | null
    source: string
}

// HTML 응답과 리다이렉트가 반영된 최종 URL.
export type FetchedLinkHtml = {
    html: string
    finalUrl: URL
}

// 각 HTML 요청 직전에 실행할 추가 검증 함수.
export type FetchLinkHtmlOptions = {
    beforeRequest?: (url: URL) => Promise<void>
}

export type ParsedLinkInformation = CollectedLinkContent

export type ParsedLinkPreview = {
    title: string | null
    image: string | null
}
