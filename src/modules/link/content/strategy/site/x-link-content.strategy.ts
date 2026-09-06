import { findFirstTinyFishImage } from '../../tinyfish/tinyfish-image.selector'
import { LinkContentTinyFishStrategy } from '../link-content-strategy.type'
import { withoutSearchParams } from '../link-content-url.util'

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
    prepareUrl: withoutSearchParams,
    selectImage: selectXImage,
}

export function selectXImage(
    _resourceUrl: URL,
    imageLinks: readonly string[],
): string | null {
    return findFirstTinyFishImage(
        imageLinks,
        (url) =>
            url.hostname === 'pbs.twimg.com' &&
            /^\/(?:media|tweet_video_thumb|ext_tw_video_thumb|amplify_video_thumb|card_img)\//.test(
                url.pathname,
            ),
    )
}

function supportsXUrl(url: URL): boolean {
    if (!X_HOSTNAMES.has(url.hostname.toLowerCase())) return false

    const segments = url.pathname.split('/').filter(Boolean)

    if (segments.length === 0) return false
    if (segments[1] === 'status') return segments.length >= 3
    if (
        segments[0] === 'i' &&
        segments[1] === 'web' &&
        segments[2] === 'status'
    ) {
        return segments.length >= 4
    }

    return (
        segments.length === 1 &&
        !X_RESERVED_PATHS.has(segments[0].toLowerCase())
    )
}
