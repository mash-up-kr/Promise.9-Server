import { isSupportedShortUrl } from './site-short-url.resolver'

describe('isSupportedShortUrl', () => {
    it.each([
        'https://naver.me/example',
        'https://link.coupang.com/a/example',
        'https://link.coupang.com/re/AFFSDP?lptag=example',
    ])('지원하는 공식 단축 URL을 판별한다: %s', (raw) => {
        expect(isSupportedShortUrl(new URL(raw))).toBe(true)
    })

    it.each([
        'https://link.coupang.com/',
        'https://link.coupang.com/not-a-product',
        'https://link.coupang.com.evil.test/a/example',
        'https://naver.me.evil.test/example',
    ])('비지원 경로나 유사 도메인을 제외한다: %s', (raw) => {
        expect(isSupportedShortUrl(new URL(raw))).toBe(false)
    })
})
