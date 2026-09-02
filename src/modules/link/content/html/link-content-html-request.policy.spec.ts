import {
    LINK_CONTENT_BOT_USER_AGENT,
    LINK_CONTENT_BROWSER_USER_AGENT,
} from '../link-content.constants'

import { resolveLinkContentHtmlUserAgent } from './link-content-html-request.policy'

describe('resolveLinkContentHtmlUserAgent', () => {
    it.each([
        'https://brunch.co.kr/@author/1',
        'https://api.brunch.co.kr/article/1',
    ])('Brunch HTML 요청에는 전용 User-Agent를 사용한다: %s', (rawUrl) => {
        expect(resolveLinkContentHtmlUserAgent(new URL(rawUrl))).toBe(
            LINK_CONTENT_BOT_USER_AGENT,
        )
    })

    it.each([
        'https://example.com/article',
        'https://brunch.co.kr.evil.example/article',
    ])('그 밖의 HTML 요청에는 브라우저 User-Agent를 사용한다: %s', (rawUrl) => {
        expect(resolveLinkContentHtmlUserAgent(new URL(rawUrl))).toBe(
            LINK_CONTENT_BROWSER_USER_AGENT,
        )
    })
})
