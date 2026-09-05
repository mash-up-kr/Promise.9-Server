export type LinkContentOEmbedPreview = {
    title: string | null
    image: string | null
}

type LinkContentStrategyBase = {
    name: string
    supports: (url: URL) => boolean
    source?: string
}

export type LinkContentHtmlStrategy = LinkContentStrategyBase & {
    kind: 'html'
}

export type LinkContentOEmbedStrategy = LinkContentStrategyBase & {
    kind: 'oembed'
    oEmbed: {
        buildEndpoint: (resourceUrl: URL) => URL
        parse: (value: unknown) => LinkContentOEmbedPreview | null
    }
}

export type LinkContentTinyFishStrategy = LinkContentStrategyBase & {
    kind: 'tinyfish'
    prepareUrl: (resourceUrl: URL) => URL
    selectImage: (
        resourceUrl: URL,
        imageLinks: readonly string[],
    ) => string | null
}

// kind가 수집 방식을 결정한다. 수집 방식과 무관한 optional 필드를 허용하지 않아
// 사이트 설정만 보고도 어떤 수집 흐름이 실행되는지 알 수 있게 한다.
export type LinkContentStrategy =
    | LinkContentHtmlStrategy
    | LinkContentOEmbedStrategy
    | LinkContentTinyFishStrategy
