import { LINK_CONTENT_BROWSER_USER_AGENT } from '../../link-content.constants'
import { LinkContentStrategy } from '../link-content-strategy.type'

export const DEFAULT_LINK_CONTENT_STRATEGY: LinkContentStrategy = {
    kind: 'html',
    name: 'default',
    supports: () => true,
    userAgent: LINK_CONTENT_BROWSER_USER_AGENT,
}
