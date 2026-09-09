import { findFirstTinyFishImage } from '../../tinyfish/tinyfish-image.selector'
import { LinkContentTinyFishStrategy } from '../link-content-strategy.type'

const BEHANCE_HOSTNAMES = new Set(['behance.net', 'www.behance.net', 'be.net'])
const BEHANCE_PROJECT_PATH = /^\/gallery\/\d+(?:\/[^/]+)?\/?$/

export const BEHANCE_LINK_CONTENT_STRATEGY: LinkContentTinyFishStrategy = {
    kind: 'tinyfish',
    name: 'behance',
    source: 'behance.net',
    supports: (url) =>
        BEHANCE_HOSTNAMES.has(url.hostname.toLowerCase()) &&
        BEHANCE_PROJECT_PATH.test(url.pathname),
    prepareUrl: (url) => new URL(url.pathname, 'https://www.behance.net'),
    fetchOptions: () => ({ includeSelectors: ['.project-content-wrap'] }),
    selectImage: (_resourceUrl, imageLinks) =>
        findFirstTinyFishImage(
            imageLinks,
            (url) =>
                url.protocol === 'https:' &&
                url.hostname === 'mir-s3-cdn-cf.behance.net' &&
                url.pathname.startsWith('/project_modules/'),
        ),
}
