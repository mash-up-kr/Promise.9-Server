export type YoutubeOEmbedPreview = {
    title: string | null
    image: string | null
}

const YOUTUBE_OEMBED_ENDPOINT = 'https://www.youtube.com/oembed'

export function isYoutubeUrl(url: URL): boolean {
    const hostname = url.hostname.toLowerCase()

    return (
        hostname === 'youtu.be' ||
        hostname === 'youtube.com' ||
        hostname.endsWith('.youtube.com')
    )
}

export function buildYoutubeOEmbedUrl(resourceUrl: URL): URL {
    const endpoint = new URL(YOUTUBE_OEMBED_ENDPOINT)
    endpoint.searchParams.set('url', resourceUrl.toString())
    endpoint.searchParams.set('format', 'json')

    return endpoint
}

export function parseYoutubeOEmbed(
    value: unknown,
): YoutubeOEmbedPreview | null {
    if (!value || typeof value !== 'object') return null

    const response = value as Record<string, unknown>
    const title = readNonEmptyString(response.title)
    const image = readNonEmptyString(response.thumbnail_url)

    return title || image ? { title, image } : null
}

function readNonEmptyString(value: unknown): string | null {
    if (typeof value !== 'string') return null

    return value.trim() || null
}
