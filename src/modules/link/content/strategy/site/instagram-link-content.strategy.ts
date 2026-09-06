import { findFirstTinyFishImage } from '../../tinyfish/tinyfish-image.selector'
import { LinkContentTinyFishStrategy } from '../link-content-strategy.type'
import { withoutSearchParams } from '../link-content-url.util'

const INSTAGRAM_HOSTNAMES = new Set(['instagram.com', 'www.instagram.com'])
const INSTAGRAM_CONTENT_PATHS = new Set(['p', 'reel', 'reels', 'tv'])
const INSTAGRAM_POST_TITLE_MAX_LENGTH = 100
const INSTAGRAM_TITLE_SEPARATOR = ' on Instagram:'
const INSTAGRAM_RESERVED_PATHS = new Set([
    'accounts',
    'developer',
    'direct',
    'emails',
    'explore',
    'legal',
    'privacy',
    'web',
])

export const INSTAGRAM_LINK_CONTENT_STRATEGY: LinkContentTinyFishStrategy = {
    kind: 'tinyfish',
    name: 'instagram',
    supports: supportsInstagramUrl,
    prepareUrl: withoutSearchParams,
    normalizeTitle: normalizeInstagramTitle,
    selectImage: selectInstagramImage,
}

export function normalizeInstagramTitle(
    resourceUrl: URL,
    title: string | null,
): string | null {
    if (!title || !isInstagramContentUrl(resourceUrl)) return title

    const separatorIndex = title.indexOf(INSTAGRAM_TITLE_SEPARATOR)
    if (separatorIndex < 0) {
        return title.slice(0, INSTAGRAM_POST_TITLE_MAX_LENGTH) || null
    }

    const caption = title
        .slice(separatorIndex + INSTAGRAM_TITLE_SEPARATOR.length)
        .trim()
        .replace(/^["“]/, '')
    const firstLine = caption
        .split(/\r?\n/)
        .map((line) => line.trim())
        .find(Boolean)
        ?.replace(/["”]$/, '')

    return firstLine?.slice(0, INSTAGRAM_POST_TITLE_MAX_LENGTH) || null
}

export function selectInstagramImage(
    resourceUrl: URL,
    imageLinks: readonly string[],
): string | null {
    if (/^\/reels?\//.test(resourceUrl.pathname)) return null

    const isPost = /^\/(?:p|tv)\//.test(resourceUrl.pathname)

    return findFirstTinyFishImage(imageLinks, (url) => {
        if (!isInstagramImageUrl(url)) return false

        return isPost
            ? url.searchParams.has('ig_cache_key')
            : /\/v\/t\d+\.\d+-19\//.test(url.pathname)
    })
}

function supportsInstagramUrl(url: URL): boolean {
    if (!INSTAGRAM_HOSTNAMES.has(url.hostname.toLowerCase())) return false

    const segments = url.pathname.split('/').filter(Boolean)

    if (segments.length === 0) return false
    if (INSTAGRAM_CONTENT_PATHS.has(segments[0])) return segments.length >= 2

    return (
        segments.length === 1 &&
        !INSTAGRAM_RESERVED_PATHS.has(segments[0].toLowerCase())
    )
}

function isInstagramContentUrl(url: URL): boolean {
    const [firstSegment] = url.pathname.split('/').filter(Boolean)

    return Boolean(
        firstSegment && INSTAGRAM_CONTENT_PATHS.has(firstSegment.toLowerCase()),
    )
}

function isInstagramImageUrl(url: URL): boolean {
    if (url.protocol !== 'https:') return false

    const hostname = url.hostname.toLowerCase()

    return (
        hostname === 'cdninstagram.com' ||
        hostname.endsWith('.cdninstagram.com') ||
        (hostname.startsWith('instagram.') && hostname.endsWith('.fbcdn.net'))
    )
}
