import { LinkContentStrategy } from '../link-content-strategy.type'

export const DEFAULT_LINK_CONTENT_STRATEGY: LinkContentStrategy = {
    kind: 'html',
    name: 'default',
    supports: () => true,
}
