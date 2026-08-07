import { SiteRule } from './site-rule.interface'

// PC 네이버 블로그(blog.naver.com)는 본문이 iframe(#mainFrame) 안이라 og:image가 빈약하다.
// 모바일(m.blog.naver.com)은 같은 경로에서 og 메타를 제대로 내려주므로 host만 바꿔 재사용한다.
export const naverBlogRule: SiteRule = {
    name: 'naver-blog',

    matches(url) {
        return url.hostname.toLowerCase() === 'blog.naver.com'
    },

    rewriteUrl(url) {
        const rewritten = new URL(url)
        rewritten.hostname = 'm.blog.naver.com'
        return rewritten
    },
}
