import { findFirstTinyFishImage } from '../../tinyfish/tinyfish-image.selector'
import { LinkContentTinyFishStrategy } from '../link-content-strategy.type'
import { withoutSearchParams } from '../link-content-url.util'

const INSTAGRAM_HOSTNAMES = new Set(['instagram.com', 'www.instagram.com'])
const INSTAGRAM_CONTENT_PATHS = new Set(['p', 'reel', 'reels', 'tv'])
const INSTAGRAM_POST_TITLE_MAX_LENGTH = 100
const INSTAGRAM_TITLE_PREFIX_PATTERN = / on Instagram:\s*(["“])/g
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
    imageFallbackUrl: instagramReelEmbedUrl,
    normalizeTitle: normalizeInstagramTitle,
    selectImage: selectInstagramImage,
}

export function normalizeInstagramTitle(
    resourceUrl: URL,
    title: string | null,
): string | null {
    if (!title || !isInstagramContentUrl(resourceUrl)) return title

    const titlePrefix = Array.from(
        title.matchAll(INSTAGRAM_TITLE_PREFIX_PATTERN),
    ).at(-1)
    if (!titlePrefix) return limitInstagramPostTitle(title)

    const closingQuote = titlePrefix[1] === '“' ? '”' : '"'
    const captionStart = (titlePrefix.index ?? 0) + titlePrefix[0].length
    const captionWithClosingQuote = title.slice(captionStart).trim()
    const caption = captionWithClosingQuote.endsWith(closingQuote)
        ? captionWithClosingQuote.slice(0, -closingQuote.length).trimEnd()
        : captionWithClosingQuote
    const firstLine = caption
        .split(/\r?\n/)
        .map((line) => line.trim())
        .find(Boolean)

    return firstLine ? limitInstagramPostTitle(firstLine) : null
}

function limitInstagramPostTitle(title: string): string | null {
    return (
        Array.from(title).slice(0, INSTAGRAM_POST_TITLE_MAX_LENGTH).join('') ||
        null
    )
}

export function selectInstagramImage(
    resourceUrl: URL,
    imageLinks: readonly string[],
): string | null {
    if (/^\/reels?\//.test(resourceUrl.pathname)) {
        const shortcode = instagramReelShortcode(resourceUrl)
        if (!shortcode) return null

        const alphabet =
            'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'
        const mediaId = Array.from(shortcode)
            .reduce((id, char) => id * 64n + BigInt(alphabet.indexOf(char)), 0n)
            .toString()

        return findFirstTinyFishImage(imageLinks, (url) => {
            if (!isInstagramImageUrl(url)) return false
            if (!/\/v\/t\d+\.\d+-15\//.test(url.pathname)) return false

            const cacheKey = url.searchParams.get('ig_cache_key')?.split('.')[0]
            if (!cacheKey || !/^[A-Za-z0-9+/]+={0,2}$/.test(cacheKey)) {
                return false
            }

            const decoded = Buffer.from(cacheKey, 'base64').toString('utf8')
            // 관측된 embed 캐시 키는 미디어 ID + 17자리 보조 식별자다.
            // 보조 식별자는 파일명의 ID와 다를 수 있다. 전체 길이와 숫자 형식을
            // 함께 검사해 다른 길이의 미디어 ID가 접두사로 일치하는 것을 막는다.
            return (
                decoded === mediaId ||
                (decoded.length === mediaId.length + 17 &&
                    /^\d+$/.test(decoded) &&
                    decoded.slice(0, mediaId.length) === mediaId)
            )
        })
    }

    const isPost = /^\/(?:p|tv)\//.test(resourceUrl.pathname)

    return findFirstTinyFishImage(imageLinks, (url) => {
        if (!isInstagramImageUrl(url)) return false

        return isPost
            ? url.searchParams.has('ig_cache_key')
            : /\/v\/t\d+\.\d+-19\//.test(url.pathname)
    })
}

function instagramReelShortcode(url: URL): string | null {
    return (
        url.pathname.match(/^\/reels?\/([A-Za-z0-9_-]{1,11})\/?$/)?.[1] ?? null
    )
}

export function instagramReelEmbedUrl(resourceUrl: URL): URL | null {
    const shortcode = instagramReelShortcode(resourceUrl)
    if (!shortcode || !INSTAGRAM_HOSTNAMES.has(resourceUrl.hostname))
        return null

    return new URL(`/reel/${shortcode}/embed/`, 'https://www.instagram.com')
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
