import { findFirstTinyFishImage } from '../../tinyfish/tinyfish-image.selector'
import { TinyFishResponseContent } from '../../tinyfish/tinyfish-response.parser'
import { LinkContentTinyFishStrategy } from '../link-content-strategy.type'
import { withoutSearchParams } from '../link-content-url.util'

import { parseInstagramCaption } from './instagram-caption.parser'

const INSTAGRAM_HOSTNAMES = new Set(['instagram.com', 'www.instagram.com'])
const INSTAGRAM_CONTENT_PATHS = new Set(['p', 'reel', 'reels', 'tv'])
const INSTAGRAM_POST_TITLE_MAX_LENGTH = 100
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
    prepareUrl: prepareInstagramUrl,
    normalizeContent: normalizeInstagramContent,
    selectImage: selectInstagramImage,
}

export function normalizeInstagramContent(
    resourceUrl: URL,
    content: TinyFishResponseContent,
): TinyFishResponseContent {
    if (!isInstagramContentUrl(resourceUrl)) return content

    const caption = parseInstagramCaption(content.content)
    return {
        ...content,
        title: caption ? limitInstagramPostTitle(caption.split('\n')[0]) : null,
        description: caption,
        // 캡션은 description 하나로 DB와 AI에 전달한다.
        content: null,
    }
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
        url.pathname.match(
            /^\/reels?\/([A-Za-z0-9_-]{1,11})(?:\/embed(?:\/captioned)?)?\/?$/,
        )?.[1] ?? null
    )
}

export function prepareInstagramUrl(resourceUrl: URL): URL {
    const match = resourceUrl.pathname.match(
        /^\/(p|reel|reels|tv)\/([A-Za-z0-9_-]{1,11})(?:\/(?:embed(?:\/captioned)?)?)?\/?$/,
    )
    if (!match || !INSTAGRAM_HOSTNAMES.has(resourceUrl.hostname)) {
        return withoutSearchParams(resourceUrl)
    }

    const kind = match[1] === 'reels' ? 'reel' : match[1]
    return new URL(
        `/${kind}/${match[2]}/embed/captioned/`,
        'https://www.instagram.com',
    )
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
