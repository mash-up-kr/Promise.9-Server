import { resolveLinkContentStrategy } from '../link-content-strategy.registry'

import { MUSINSA_LINK_CONTENT_STRATEGY as strategy } from './musinsa-link-content.strategy'

const MUSINSA_PRODUCT_URL = new URL('https://www.musinsa.com/products/4438679')

describe('무신사 상품 전략', () => {
    it.each([
        'https://www.musinsa.com/products/4438679',
        'https://musinsa.com/products/4438679/',
        'https://store.musinsa.com/app/goods/4438679',
    ])('상품 상세 URL을 TinyFish로 수집한다: %s', (raw) => {
        const resolved = resolveLinkContentStrategy(new URL(raw))

        expect(resolved.name).toBe('musinsa')
        expect(resolved.kind).toBe('tinyfish')
        expect(resolved.source).toBe('musinsa.com')
    })

    it('기존 상품 경로와 추적 쿼리를 canonical URL로 정리한다', () => {
        expect(
            strategy
                .prepareUrl(
                    new URL(
                        'https://store.musinsa.com/app/goods/4438679?utm_source=share#reviews',
                    ),
                )
                .toString(),
        ).toBe('https://www.musinsa.com/products/4438679')
    })

    it('상품 상세 영역만 TinyFish에 요청한다', () => {
        expect(strategy.fetchOptions!(MUSINSA_PRODUCT_URL)).toEqual({
            includeSelectors: ['#commonLayoutContents'],
        })
    })

    it('추천 상품을 제외하고 대상 상품 ID의 첫 대표 이미지를 선택한다', () => {
        const productImage =
            'https://image.msscdn.net/thumbnails/images/goods_img/20240913/4438679/4438679_17320086087779_big.jpg?w=1200'

        expect(
            strategy.selectImage(MUSINSA_PRODUCT_URL, [
                'https://image.msscdn.net/static/assets/bi/favicon/favicon.svg',
                'https://image.msscdn.net/images/goods_img/20240913/4438681/4438681_500.jpg',
                productImage,
            ]),
        ).toBe(productImage)
    })

    it('대상 상품 이미지가 없거나 CDN이 유사 도메인이면 null을 반환한다', () => {
        expect(
            strategy.selectImage(MUSINSA_PRODUCT_URL, [
                'https://image.msscdn.net/images/goods_img/20240913/4438681/4438681_500.jpg',
                'https://image.msscdn.net.evil.test/images/goods_img/20240913/4438679/image.jpg',
            ]),
        ).toBeNull()
    })

    it.each([
        'https://www.musinsa.com/',
        'https://www.musinsa.com/search/goods?keyword=boots',
        'https://www.musinsa.com/products/not-a-number',
        'https://www.musinsa.com/products/4438679/reviews',
        'https://musinsa.com.evil.test/products/4438679',
    ])('상품 상세가 아닌 URL에는 전용 전략을 적용하지 않는다: %s', (raw) => {
        expect(strategy.supports(new URL(raw))).toBe(false)
    })
})
