export type LinkImageSource =
    'og:image' | 'twitter:image' | 'oembed' | 'tinyfish' | 'youtube-data-api'

export type CollectedLinkImage = {
    url: string
    source: LinkImageSource
}

// 요약·태그·이미지 분석에 사용할 링크 페이지 정보.
export type CollectedLinkContent = {
    title: string | null
    description: string | null
    content: string | null
    image: CollectedLinkImage | null
    analysisUnavailableReason?: string
    // 공식 API가 응답한 결과. 필드 부재를 "수집 실패"가 아니라 "삭제됨"으로 해석해
    // 저장된 값을 지운다. 스크래핑 경로는 부재가 실패와 구분되지 않으므로 설정하지 않는다.
    authoritative?: boolean
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

export type ParsedLinkInformation = {
    title: string | null
    description: string | null
    content: string | null
}

export type ParsedLinkPreview = {
    title: string | null
    image: string | null
    imageSource: LinkImageSource | null
}
