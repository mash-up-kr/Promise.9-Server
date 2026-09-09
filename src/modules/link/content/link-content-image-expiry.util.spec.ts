import { extractImageExpiry } from './link-content-image-expiry.util'

describe('extractImageExpiry', () => {
    const OE_HEX = '68d1a000'
    const OE_EPOCH_SECONDS = parseInt(OE_HEX, 16)

    it('Instagram CDN 이미지의 oe 파라미터(16진수 UNIX 초)를 만료 시각으로 해석한다', () => {
        const url = `https://scontent.cdninstagram.com/v/t51.2885-15/photo.jpg?ig_cache_key=abc&oe=${OE_HEX}`

        expect(extractImageExpiry(url)).toEqual(
            new Date(OE_EPOCH_SECONDS * 1000),
        )
    })

    it('fbcdn.net 호스트도 동일하게 해석한다', () => {
        const url = `https://instagram.fcgk30-1.fna.fbcdn.net/v/t51.75761-15/photo.jpg?oe=${OE_HEX}`

        expect(extractImageExpiry(url)).toEqual(
            new Date(OE_EPOCH_SECONDS * 1000),
        )
    })

    it('Instagram CDN이 아니면 oe 파라미터가 있어도 무시한다', () => {
        const url = 'https://static.toss.tech/thumbnail.png?oe=68d1a000'

        expect(extractImageExpiry(url)).toBeNull()
    })

    it('oe 파라미터가 없으면 null을 반환한다', () => {
        const url =
            'https://scontent.cdninstagram.com/v/t51.2885-15/photo.jpg?ig_cache_key=abc'

        expect(extractImageExpiry(url)).toBeNull()
    })

    it('oe 값이 16진수가 아니면 null을 반환한다', () => {
        const url =
            'https://scontent.cdninstagram.com/v/t51.2885-15/photo.jpg?oe=not-hex'

        expect(extractImageExpiry(url)).toBeNull()
    })

    it('잘못된 URL이면 null을 반환한다', () => {
        expect(extractImageExpiry('not a url')).toBeNull()
    })
})
