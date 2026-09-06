import { LINK_CONTENT_BOT_USER_AGENT } from '../../link-content.constants'
import { LinkContentStrategy } from '../link-content-strategy.type'
import { matchesHostname } from '../link-content-url.matcher'

export const BRUNCH_LINK_CONTENT_STRATEGY: LinkContentStrategy = {
    kind: 'html',
    name: 'brunch',
    supports: (url) => matchesHostname(url, 'brunch.co.kr'),
    userAgent: LINK_CONTENT_BOT_USER_AGENT,
}
