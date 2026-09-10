import { resolveLinkContentStrategy } from '../link-content-strategy.registry'

import { COUPANG_LINK_CONTENT_STRATEGY as strategy } from './coupang-link-content.strategy'

const COUPANG_PRODUCT_URL = new URL(
    'https://www.coupang.com/vp/products/9332072213?itemId=27669136218&vendorItemId=94631318376',
)

describe('쿠팡 상품 전략', () => {
    it.each([
        'https://www.coupang.com/vp/products/9332072213',
        'https://coupang.com/vp/products/9332072213/',
        'https://m.coupang.com/vm/products/9332072213',
    ])('상품 상세 URL을 TinyFish로 수집한다: %s', (raw) => {
        const resolved = resolveLinkContentStrategy(new URL(raw))

        expect(resolved.name).toBe('coupang')
        expect(resolved.kind).toBe('tinyfish')
        expect(resolved.source).toBe('coupang.com')
    })

    it('옵션 식별자는 유지하고 추적 쿼리는 제거한 canonical URL을 만든다', () => {
        expect(
            strategy
                .prepareUrl(
                    new URL(
                        'https://m.coupang.com/vm/products/9332072213?itemId=27669136218&vendorItemId=94631318376&sourceType=share',
                    ),
                )
                .toString(),
        ).toBe(
            'https://www.coupang.com/vp/products/9332072213?itemId=27669136218&vendorItemId=94631318376',
        )
    })

    it('상품 상단 영역만 TinyFish에 요청한다', () => {
        expect(strategy.fetchOptions!(COUPANG_PRODUCT_URL)).toEqual({
            includeSelectors: ['.prod-atf'],
        })
    })

    it('쿠팡 상품 이미지 경로의 첫 후보를 선택한다', () => {
        const productImage =
            'https://thumbnail7.coupangcdn.com/thumbnails/remote/657x657q90trim/image/retail/images/product.jpg.webp'

        expect(
            strategy.selectImage(COUPANG_PRODUCT_URL, [
                'https://image7.coupangcdn.com/image/coupang/rds/logo/rocket.png',
                productImage,
            ]),
        ).toBe(productImage)
    })

    it('상품 이미지가 없거나 CDN이 유사 도메인이면 null을 반환한다', () => {
        expect(
            strategy.selectImage(COUPANG_PRODUCT_URL, [
                'https://static.coupangcdn.com/image/retail/images/product.jpg',
                'https://thumbnail7.coupangcdn.com.evil.test/thumbnails/remote/image/retail/product.jpg',
            ]),
        ).toBeNull()
    })

    it.each([
        'https://www.coupang.com/',
        'https://www.coupang.com/np/search?q=mouse',
        'https://www.coupang.com/vp/products/not-a-number',
        'https://www.coupang.com/vp/products/9332072213/reviews',
        'https://coupang.com.evil.test/vp/products/9332072213',
    ])('상품 상세가 아닌 URL에는 전용 전략을 적용하지 않는다: %s', (raw) => {
        expect(strategy.supports(new URL(raw))).toBe(false)
    })
})
