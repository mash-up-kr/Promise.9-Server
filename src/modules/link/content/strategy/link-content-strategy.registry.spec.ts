import { resolveLinkContentStrategy } from './link-content-strategy.registry'

describe('resolveLinkContentStrategy', () => {
    it.each([
        'https://youtube.com/watch?v=video',
        'https://www.youtube.com/watch?v=video',
        'https://youtu.be/video',
    ])('YouTube URL에 Data API 우선 전략을 적용한다: %s', (rawUrl) => {
        const strategy = resolveLinkContentStrategy(new URL(rawUrl))

        expect(strategy.name).toBe('youtube')
        expect(strategy.kind).toBe('youtube')
        expect(strategy.source).toBe('youtube.com')
    })

    it.each([
        ['https://x.com/OpenAI/status/2041581000120267067', 'x'],
        ['https://x.com/i/web/status/2041581000120267067', 'x'],
        ['https://twitter.com/OpenAI', 'x'],
        ['https://www.instagram.com/instagram/', 'instagram'],
        ['https://www.instagram.com/p/example/', 'instagram'],
        ['https://www.instagram.com/reel/example/', 'instagram'],
        [
            'https://www.behance.net/gallery/122200727/Google-Feature-Drop',
            'behance',
        ],
        ['https://be.net/gallery/32715299/Coves-Free-Font', 'behance'],
        ['https://www.musinsa.com/products/4438679', 'musinsa'],
        ['https://store.musinsa.com/app/goods/4438679', 'musinsa'],
        ['https://www.coupang.com/vp/products/9332072213', 'coupang'],
        ['https://m.coupang.com/vm/products/9332072213', 'coupang'],
    ])(
        '지원 URL에 사이트별 TinyFish 전략을 적용한다: %s',
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
        'https://behance.net.evil.example/gallery/123/project',
        'https://www.behance.net/search/projects',
        'https://musinsa.com.evil.example/products/4438679',
        'https://www.musinsa.com/search/goods?keyword=boots',
        'https://coupang.com.evil.example/vp/products/9332072213',
        'https://www.coupang.com/np/search?q=mouse',
        'https://x.com/login',
        'https://www.instagram.com/accounts/login/',
    ])('등록되지 않은 URL에는 기본 OG 전략을 적용한다: %s', (rawUrl) => {
        const strategy = resolveLinkContentStrategy(new URL(rawUrl))

        expect(strategy.name).toBe('default')
        expect(strategy.kind).toBe('html')
    })
})
