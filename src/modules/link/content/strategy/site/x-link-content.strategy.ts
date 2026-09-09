import { TinyFishFetchError } from '../../tinyfish/tinyfish-fetch.error'
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
        const photoLink = post.photoIndex
            ? `a:is([href$="/status/${post.id}/photo/${post.photoIndex}"], [href*="/status/${post.id}/photo/${post.photoIndex}?"], [href*="/status/${post.id}/photo/${post.photoIndex}#"], [href*="/status/${post.id}/photo/${post.photoIndex}/"])`
            : null
        return {
            // ID 뒤의 경계는 확인하되 query·fragment·미디어 경로를 허용한다.
            includeSelectors: [
                `article:has(a:is([href$="/status/${post.id}"], [href*="/status/${post.id}?"], [href*="/status/${post.id}#"], [href*="/status/${post.id}/"]))`,
            ],
            excludeSelectors: [
                'article article',
                // 지정 링크에 이미지 요소가 있을 때만 다른 미디어 링크를 제외한다.
                // 빈 링크·로딩 상태라면 확보된 자체 미디어를 남긴다.
                ...(photoLink
                    ? [
                          `article:has(${photoLink}:has(img)) a:is([href*="/photo/"], [href*="/video/"]):not(${photoLink})`,
                      ]
                    : []),
                `a[href*="/status/"][href*="/photo/"]:not([href*="/status/${post.id}/photo/"])`,
            ],
        }
    },
    normalizeContent: (url, content) => {
        if (!parseXPostUrl(url)) return content
        const normalized = normalizeXPostContent(content)
        if (!normalized.content && !selectXImage(url, normalized.imageLinks)) {
            throw new TinyFishFetchError({
                message: 'X 게시물의 본문과 이미지를 수집하지 못했습니다.',
                retryable: true,
            })
        }
        return normalized
    },
    selectImage: selectXImage,
}

export function selectXImage(
    resourceUrl: URL,
    imageLinks: readonly string[],
): string | null {
    if (!parseXPostUrl(resourceUrl)) return selectXAvatar(imageLinks)
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
    const candidates = unique.filter((image) => {
        const url = new URL(image)
        return (
            url.protocol === 'https:' &&
            url.hostname === 'pbs.twimg.com' &&
            /^\/(?:media|tweet_video_thumb|ext_tw_video_thumb|amplify_video_thumb|card_img)\//.test(
                url.pathname,
            )
        )
    })
    // 순번은 DOM 사진 링크로 제한한다. image_links 배열 위치로 추정하지 않는다.
    return candidates[0] ?? null
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
