import { findFirstTinyFishImage } from '../../tinyfish/tinyfish-image.selector'
import { LinkContentTinyFishStrategy } from '../link-content-strategy.type'

const COUPANG_HOSTNAMES = new Set([
    'coupang.com',
    'www.coupang.com',
    'm.coupang.com',
])
const COUPANG_PRODUCT_PATH = /^\/v[pm]\/products\/(\d+)\/?$/
const COUPANG_IMAGE_HOSTNAME =
    /^(?:thumbnail\d*|image\d+|img\d+[a-z]?)\.coupangcdn\.com$/

export const COUPANG_LINK_CONTENT_STRATEGY: LinkContentTinyFishStrategy = {
    kind: 'tinyfish',
    name: 'coupang',
    source: 'coupang.com',
    supports: (url) =>
        COUPANG_HOSTNAMES.has(url.hostname.toLowerCase()) &&
        COUPANG_PRODUCT_PATH.test(url.pathname),
    prepareUrl: (url) => {
        const productId = COUPANG_PRODUCT_PATH.exec(url.pathname)?.[1]
        const prepared = new URL(
            `https://www.coupang.com/vp/products/${productId}`,
        )

        for (const key of ['itemId', 'vendorItemId']) {
            const value = url.searchParams.get(key)
            if (value && /^\d+$/.test(value))
                prepared.searchParams.set(key, value)
        }

        return prepared
    },
    selectImage: (_resourceUrl, imageLinks) =>
        findFirstTinyFishImage(
            imageLinks,
            (url) =>
                url.protocol === 'https:' &&
                COUPANG_IMAGE_HOSTNAME.test(url.hostname) &&
                ['/image/retail/', '/image/vendor_inventory/'].some((path) =>
                    url.pathname.includes(path),
                ),
        ),
}
