import { DEFAULT_LINK_CONTENT_STRATEGY } from './site/default-link-content.strategy'
import { INSTAGRAM_LINK_CONTENT_STRATEGY } from './site/instagram-link-content.strategy'
import { X_LINK_CONTENT_STRATEGY } from './site/x-link-content.strategy'
import { YOUTUBE_LINK_CONTENT_STRATEGY } from './site/youtube-link-content.strategy'
import { LinkContentStrategy } from './link-content-strategy.type'

// 전용 처리가 필요한 사이트만 등록하고, 나머지는 기존 OG 수집 방식을 사용한다.
const LINK_CONTENT_STRATEGIES: readonly LinkContentStrategy[] = [
    X_LINK_CONTENT_STRATEGY,
    INSTAGRAM_LINK_CONTENT_STRATEGY,
    YOUTUBE_LINK_CONTENT_STRATEGY,
]

export function resolveLinkContentStrategy(url: URL): LinkContentStrategy {
    return (
        LINK_CONTENT_STRATEGIES.find((strategy) => strategy.supports(url)) ??
        DEFAULT_LINK_CONTENT_STRATEGY
    )
}
