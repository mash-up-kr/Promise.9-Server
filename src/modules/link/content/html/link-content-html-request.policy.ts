import {
    LINK_CONTENT_BOT_USER_AGENT,
    LINK_CONTENT_BROWSER_USER_AGENT,
} from '../link-content.constants'
import { matchesHostname } from '../strategy/link-content-url.util'

// HTML을 직접 요청할 때만 적용하는 도메인별 User-Agent 정책이다.
export function resolveLinkContentHtmlUserAgent(url: URL): string {
    return matchesHostname(url, 'brunch.co.kr')
        ? LINK_CONTENT_BOT_USER_AGENT
        : LINK_CONTENT_BROWSER_USER_AGENT
}
