import { findFirstTinyFishImage } from '../../tinyfish/tinyfish-image.selector'
import { LinkContentTinyFishStrategy } from '../link-content-strategy.type'
import { withoutSearchParams } from '../link-content-url.util'

import { normalizeXPostContent } from './x-post-content.parser'

const X_HOSTNAMES = new Set([
    'x.com',
    'www.x.com',
    'twitter.com',
    'www.twitter.com',
])
const X_RESERVED_PATHS = new Set([
    'compose',
    'explore',
    'home',
    'i',
    'intent',
    'login',
    'messages',
    'notifications',
    'search',
    'settings',
    'share',
    'signup',
])

export const X_LINK_CONTENT_STRATEGY: LinkContentTinyFishStrategy = {
    kind: 'tinyfish',
    name: 'x',
    supports: supportsXUrl,
    prepareUrl: (url) => {
        const post = parseXPostUrl(url)
        return post
            ? new URL(`https://x.com/${post.author}/status/${post.id}`)
            : withoutSearchParams(url)
    },
    fetchOptions: (url) => {
        const post = parseXPostUrl(url)
        if (!post) return { excludeSelectors: ['article', 'aside', 'nav'] }
        return {
            includeSelectors: [`article:has(a[href$="/status/${post.id}"])`],
            excludeSelectors: [
                'article article',
                `a[href*="/status/"][href*="/photo/"]:not([href*="/status/${post.id}/photo/"])`,
            ],
        }
    },
    normalizeContent: (url, content) =>
        parseXPostUrl(url) ? normalizeXPostContent(content) : content,
    selectImage: selectXImage,
}

export function selectXImage(
    resourceUrl: URL,
    imageLinks: readonly string[],
): string | null {
    if (!parseXPostUrl(resourceUrl)) return selectXAvatar(imageLinks)
    const photoIndex = parseXPostUrl(resourceUrl)?.photoIndex ?? 1
    const seen = new Set<string>()
    const unique = imageLinks.filter((image) => {
        try {
            const url = new URL(image)
            const key = url.origin + url.pathname
            if (seen.has(key)) return false
            seen.add(key)
            return true
        } catch {
            return false
        }
    })
    let index = 0
    return findFirstTinyFishImage(
        unique,
        (url) =>
            url.protocol === 'https:' &&
            url.hostname === 'pbs.twimg.com' &&
            /^\/(?:media|tweet_video_thumb|ext_tw_video_thumb|amplify_video_thumb|card_img)\//.test(
                url.pathname,
            ) &&
            ++index === photoIndex,
    )
}

function selectXAvatar(imageLinks: readonly string[]): string | null {
    const first = findFirstTinyFishImage(
        imageLinks,
        (url) =>
            url.protocol === 'https:' &&
            url.hostname === 'pbs.twimg.com' &&
            url.pathname.startsWith('/profile_images/'),
    )
    if (!first) return null
    const identity = (url: string) =>
        new URL(url).pathname.replace(
            /_(?:normal|mini|bigger|x96|reasonably_small|200x200|400x400)(?=\.[^.]+$)/,
            '',
        )
    return (
        imageLinks.find((image) => {
            try {
                const url = new URL(image)
                return (
                    url.protocol === 'https:' &&
                    url.hostname === 'pbs.twimg.com' &&
                    identity(image) === identity(first) &&
                    /_400x400\./.test(url.pathname)
                )
            } catch {
                return false
            }
        }) ?? first
    )
}

function supportsXUrl(url: URL): boolean {
    if (!X_HOSTNAMES.has(url.hostname.toLowerCase())) return false

    const segments = url.pathname.split('/').filter(Boolean)

    if (segments.length === 0) return false
    if (parseXPostUrl(url)) return true
    if (segments.length > 1) return false

    return (
        segments.length === 1 &&
        !X_RESERVED_PATHS.has(segments[0].toLowerCase())
    )
}

export function parseXPostUrl(
    url: URL,
): { author: string; id: string; photoIndex?: number } | null {
    if (!X_HOSTNAMES.has(url.hostname)) return null
    const match = url.pathname.match(
        /^\/(?:([A-Za-z0-9_]{1,15})|i\/web)\/status\/(\d+)(?:\/(photo|video)\/([1-4]))?\/?$/,
    )
    if (!match) return null
    return {
        author: match[1] ?? 'i/web',
        id: match[2],
        ...(match[3] === 'photo' ? { photoIndex: Number(match[4]) } : {}),
    }
}
