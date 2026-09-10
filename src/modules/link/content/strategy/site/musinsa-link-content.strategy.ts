import { findFirstTinyFishImage } from '../../tinyfish/tinyfish-image.selector'
import { LinkContentTinyFishStrategy } from '../link-content-strategy.type'

const MUSINSA_HOSTNAMES = new Set([
    'musinsa.com',
    'www.musinsa.com',
    'store.musinsa.com',
])
const MUSINSA_PRODUCT_PATH = /^\/(?:products|app\/goods)\/(\d+)\/?$/

export const MUSINSA_LINK_CONTENT_STRATEGY: LinkContentTinyFishStrategy = {
    kind: 'tinyfish',
    name: 'musinsa',
    source: 'musinsa.com',
    supports: (url) =>
        MUSINSA_HOSTNAMES.has(url.hostname.toLowerCase()) &&
        MUSINSA_PRODUCT_PATH.test(url.pathname),
    prepareUrl: (url) => {
        const productId = getMusinsaProductId(url)
        return new URL(`https://www.musinsa.com/products/${productId}`)
    },
    fetchOptions: () => ({ includeSelectors: ['#commonLayoutContents'] }),
    selectImage: (resourceUrl, imageLinks) => {
        const productId = getMusinsaProductId(resourceUrl)

        return findFirstTinyFishImage(
            imageLinks,
            (url) =>
                url.protocol === 'https:' &&
                url.hostname === 'image.msscdn.net' &&
                url.pathname.includes(`/images/goods_img/`) &&
                url.pathname.split('/').includes(productId),
        )
    },
}

function getMusinsaProductId(url: URL): string {
    return MUSINSA_PRODUCT_PATH.exec(url.pathname)?.[1] ?? ''
}
