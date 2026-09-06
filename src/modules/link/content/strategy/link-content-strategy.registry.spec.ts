import { LINK_CONTENT_BROWSER_USER_AGENT } from '../link-content.constants'

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
        'https://brunch.co.kr/@author/1',
        'https://api.brunch.co.kr/article/1',
    ])('Brunch URL에 전용 User-Agent 전략을 적용한다: %s', (rawUrl) => {
        const strategy = resolveLinkContentStrategy(new URL(rawUrl))

        expect(strategy.name).toBe('brunch')
        expect(strategy.kind).toBe('html')
        expect(strategy.userAgent).toBe('Promise9Bot/1.0')
    })

    it.each([
        'https://example.com/article',
        'https://youtube.com.evil.example/watch?v=video',
        'https://brunch.co.kr.evil.example/article',
    ])('등록되지 않은 URL에는 기본 OG 전략을 적용한다: %s', (rawUrl) => {
        const strategy = resolveLinkContentStrategy(new URL(rawUrl))

        expect(strategy.name).toBe('default')
        expect(strategy.kind).toBe('html')
        expect(strategy.userAgent).toBe(LINK_CONTENT_BROWSER_USER_AGENT)
    })
})
