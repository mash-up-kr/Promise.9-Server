import { LINK_CONTENT_BROWSER_USER_AGENT } from '../../link-content.constants'
import {
    LinkContentOEmbedPreview,
    LinkContentStrategy,
} from '../link-content-strategy.type'
import { matchesHostname } from '../link-content-url.matcher'

const YOUTUBE_OEMBED_ENDPOINT = 'https://www.youtube.com/oembed'

export const YOUTUBE_LINK_CONTENT_STRATEGY: LinkContentStrategy = {
    kind: 'oembed',
    name: 'youtube',
    supports: (url) =>
        matchesHostname(url, 'youtube.com') || matchesHostname(url, 'youtu.be'),
    userAgent: LINK_CONTENT_BROWSER_USER_AGENT,
    source: 'youtube.com',
    oEmbed: {
        buildEndpoint: buildYoutubeOEmbedUrl,
        parse: parseYoutubeOEmbed,
    },
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
