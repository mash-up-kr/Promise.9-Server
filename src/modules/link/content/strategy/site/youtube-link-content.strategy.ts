import {
    LinkContentOEmbedPreview,
    LinkContentStrategy,
} from '../link-content-strategy.type'
import { matchesHostname } from '../link-content-url.util'

const YOUTUBE_OEMBED_ENDPOINT = 'https://www.youtube.com/oembed'

export const YOUTUBE_LINK_CONTENT_STRATEGY: LinkContentStrategy = {
    kind: 'youtube',
    name: 'youtube',
    supports: (url) =>
        matchesHostname(url, 'youtube.com') || matchesHostname(url, 'youtu.be'),
    source: 'youtube.com',
    getVideoId: extractYoutubeVideoId,
    oEmbed: {
        buildEndpoint: buildYoutubeOEmbedUrl,
        parse: parseYoutubeOEmbed,
    },
}

export function extractYoutubeVideoId(url: URL): string | null {
    const segments = url.pathname.split('/').filter(Boolean)
    let videoId: string | null = null

    if (matchesHostname(url, 'youtu.be') && segments.length === 1) {
        videoId = segments[0]
    } else if (matchesHostname(url, 'youtube.com')) {
        if (url.pathname === '/watch') {
            videoId = url.searchParams.get('v')
        } else if (
            segments.length === 2 &&
            ['shorts', 'embed', 'live'].includes(segments[0])
        ) {
            videoId = segments[1]
        }
    }

    return videoId && /^[A-Za-z0-9_-]{11}$/.test(videoId) ? videoId : null
}

function buildYoutubeOEmbedUrl(resourceUrl: URL): URL {
    const endpoint = new URL(YOUTUBE_OEMBED_ENDPOINT)
    endpoint.searchParams.set('url', resourceUrl.toString())
    endpoint.searchParams.set('format', 'json')

    return endpoint
}

function parseYoutubeOEmbed(value: unknown): LinkContentOEmbedPreview | null {
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
