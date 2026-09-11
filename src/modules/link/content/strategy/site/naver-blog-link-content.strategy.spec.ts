import { resolveLinkContentStrategy } from '../link-content-strategy.registry'

import { NAVER_BLOG_LINK_CONTENT_STRATEGY as strategy } from './naver-blog-link-content.strategy'

const NAVER_BLOG_POST_URL = new URL(
    'https://blog.naver.com/edl-enterprise/223710776930',
)
// TinyFish 응답에서 확인한 실제 이미지 후보다. 흐린 placeholder가 원본보다 먼저 온다.
const POST_IMAGE_PLACEHOLDER = `https://mblogthumb-phinf.pstatic.net/MjAyNDEyMzFfMTI1/MDAxNzM1NjM4MTg0ODQ5.O0nhmVPV-HPjiMGGv00ranWga_wW5gWbSnON-_AjJzog.VsRvSzq3ePIlk1zaMWMTWohMB2fnbyEAI9vT22sIcNkg.PNG/cover.png?type=w80_blur`
const POST_IMAGE = `https://mblogthumb-phinf.pstatic.net/MjAyNDEyMzFfMTI1/MDAxNzM1NjM4MTg0ODQ5.O0nhmVPV-HPjiMGGv00ranWga_wW5gWbSnON-_AjJzog.VsRvSzq3ePIlk1zaMWMTWohMB2fnbyEAI9vT22sIcNkg.PNG/cover.png?type=w800`
const LINK_CARD_IMAGE =
    'https://dthumb-phinf.pstatic.net/?src=%22https%3A%2F%2Fdesignus-img.s3.ap-northeast-2.amazonaws.com%2Fasset%2Fog_thumbnail.png%22&type=ff500_300'
const PROFILE_IMAGE =
    'https://blogpfthumb-phinf.pstatic.net/MjAyNTA0MTFfMTQ0/MDAxNzQ0MzU1NDQyNDIx.profile.jpg'

describe('네이버 블로그 전략', () => {
    it.each([
        'https://blog.naver.com/edl-enterprise/223710776930',
        'https://m.blog.naver.com/edl-enterprise/223710776930/',
        'https://blog.naver.com/PostView.naver?blogId=edl-enterprise&logNo=223710776930',
    ])('게시물 URL을 TinyFish로 수집한다: %s', (raw) => {
        const resolved = resolveLinkContentStrategy(new URL(raw))

        expect(resolved.name).toBe('naver-blog')
        expect(resolved.kind).toBe('tinyfish')
        expect(resolved.source).toBe('blog.naver.com')
    })

    it.each([
        'https://blog.naver.com/edl-enterprise/223710776930?fromRss=true#comment',
        'https://m.blog.naver.com/PostView.nhn?blogId=edl-enterprise&logNo=223710776930&proxyReferer=x',
    ])('본문이 포함된 모바일 게시물 URL로 정규화한다: %s', (raw) => {
        expect(strategy.prepareUrl(new URL(raw)).toString()).toBe(
            'https://m.blog.naver.com/edl-enterprise/223710776930',
        )
    })

    it('본문 영역만 TinyFish에 요청한다', () => {
        expect(strategy.fetchOptions!(NAVER_BLOG_POST_URL)).toEqual({
            includeSelectors: ['.post_ct'],
        })
    })

    it('제목에서 네이버 블로그 접미사를 제거한다', () => {
        expect(
            strategy.normalizeContent!(NAVER_BLOG_POST_URL, {
                title: '디자이너를 위한 레퍼런스 사이트 7개 : 네이버 블로그',
                description: '안녕하세요, 이디엘엔터프라이즈 디자인팀입니다.',
                content: '본문',
                imageLinks: [],
            }),
        ).toEqual({
            title: '디자이너를 위한 레퍼런스 사이트 7개',
            description: '안녕하세요, 이디엘엔터프라이즈 디자인팀입니다.',
            content: '본문',
            imageLinks: [],
        })
    })

    it('프로필·링크 카드 썸네일을 제외하고 본문 사진을 선택한다', () => {
        expect(
            strategy.selectImage(NAVER_BLOG_POST_URL, [
                PROFILE_IMAGE,
                LINK_CARD_IMAGE,
                'https://ssl.pstatic.net/static/blog/icon/blog_Icon_180x180.png',
                POST_IMAGE,
            ]),
        ).toBe(POST_IMAGE)
    })

    it('지연 로딩 placeholder 대신 같은 사진의 원본 후보를 선택한다', () => {
        expect(
            strategy.selectImage(NAVER_BLOG_POST_URL, [
                POST_IMAGE_PLACEHOLDER,
                POST_IMAGE,
                LINK_CARD_IMAGE,
            ]),
        ).toBe(POST_IMAGE)
    })

    it('본문 사진이 없거나 CDN이 유사 도메인이면 null을 반환한다', () => {
        expect(
            strategy.selectImage(NAVER_BLOG_POST_URL, [
                PROFILE_IMAGE,
                LINK_CARD_IMAGE,
                POST_IMAGE_PLACEHOLDER,
                'https://mblogthumb-phinf.pstatic.net.evil.test/image.png',
                'http://mblogthumb-phinf.pstatic.net/image.png',
            ]),
        ).toBeNull()
    })

    it.each([
        'https://blog.naver.com/edl-enterprise',
        'https://blog.naver.com/edl-enterprise/223710776930/comment',
        'https://m.blog.naver.com/PostList.naver?blogId=edl-enterprise',
        'https://blog.naver.com/PostView.naver?blogId=edl-enterprise',
        'https://blog.naver.com.evil.test/edl-enterprise/223710776930',
        'https://blog.naver.com/edl-enterprise/not-a-number',
    ])('게시물이 아닌 URL에는 전용 전략을 적용하지 않는다: %s', (raw) => {
        expect(strategy.supports(new URL(raw))).toBe(false)
    })
})
