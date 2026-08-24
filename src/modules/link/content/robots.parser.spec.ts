import { describe, expect, it } from 'bun:test'

import { isRobotsPathAllowed } from './robots.parser'

describe('isRobotsPathAllowed', () => {
    const userAgent = 'Promise9Bot/1.0'

    it('user-agent와 규칙 사이의 빈 줄·주석을 무시한다', () => {
        const robotsTxt = [
            'User-agent: *',
            '',
            '# article policy',
            'Disallow: /private/',
        ].join('\n')

        expect(isRobotsPathAllowed(robotsTxt, '/private/1', userAgent)).toBe(
            false,
        )
    })

    it('구체적인 user-agent 규칙이 있으면 wildcard 그룹 대신 적용한다', () => {
        const robotsTxt = [
            'User-agent: *',
            'Disallow: /articles/private/',
            '',
            'User-agent: Promise9Bot',
            'Allow: /articles/',
        ].join('\n')

        expect(
            isRobotsPathAllowed(robotsTxt, '/articles/private/1', userAgent),
        ).toBe(true)
    })

    it('더 구체적인 Allow 규칙과 $ 끝 일치를 지원한다', () => {
        const robotsTxt = [
            'User-agent: *',
            'Disallow: /*.pdf$',
            'Allow: /public.pdf$',
        ].join('\n')

        expect(isRobotsPathAllowed(robotsTxt, '/public.pdf', userAgent)).toBe(
            true,
        )
        expect(isRobotsPathAllowed(robotsTxt, '/private.pdf', userAgent)).toBe(
            false,
        )
        expect(
            isRobotsPathAllowed(
                robotsTxt,
                '/private.pdf?download=1',
                userAgent,
            ),
        ).toBe(true)
    })
})
