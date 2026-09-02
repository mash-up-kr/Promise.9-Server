import { resolveLinkContentStrategy } from './link-content-strategy.registry'

describe('resolveLinkContentStrategy', () => {
    it.each([
        'https://youtube.com/watch?v=video',
        'https://www.youtube.com/watch?v=video',
        'https://youtu.be/video',
    ])('YouTube URL에 oEmbed 전략을 적용한다: %s', (rawUrl) => {
        const strategy = resolveLinkContentStrategy(new URL(rawUrl))

        expect(strategy.name).toBe('youtube')
        expect(strategy.kind).toBe('oembed')
        expect(strategy.source).toBe('youtube.com')
    })

    it.each([
        ['https://x.com/OpenAI/status/2041581000120267067', 'x'],
        ['https://x.com/i/web/status/2041581000120267067', 'x'],
        ['https://twitter.com/OpenAI', 'x'],
        ['https://www.instagram.com/instagram/', 'instagram'],
        ['https://www.instagram.com/p/example/', 'instagram'],
        ['https://www.instagram.com/reel/example/', 'instagram'],
    ])(
        '지원하는 소셜 URL에 사이트별 TinyFish 전략을 적용한다: %s',
        (rawUrl, expectedName) => {
            const strategy = resolveLinkContentStrategy(new URL(rawUrl))

            expect(strategy.name).toBe(expectedName)
            expect(strategy.kind).toBe('tinyfish')
        },
    )

    it.each([
        'https://example.com/article',
        'https://youtube.com.evil.example/watch?v=video',
        'https://brunch.co.kr.evil.example/article',
        'https://x.com.evil.example/OpenAI/status/1',
        'https://instagram.com.evil.example/p/example',
        'https://x.com/login',
        'https://www.instagram.com/accounts/login/',
    ])('등록되지 않은 URL에는 기본 OG 전략을 적용한다: %s', (rawUrl) => {
        const strategy = resolveLinkContentStrategy(new URL(rawUrl))

        expect(strategy.name).toBe('default')
        expect(strategy.kind).toBe('html')
    })
})
