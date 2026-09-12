import { findFirstTinyFishImage } from '../../tinyfish/tinyfish-image.selector'
import { LinkContentTinyFishStrategy } from '../link-content-strategy.type'

const NAVER_BLOG_HOSTNAMES = ['blog.naver.com', 'm.blog.naver.com']
const NAVER_BLOG_POST_PATH = /^\/([A-Za-z0-9_-]{1,64})\/(\d+)\/?$/
const NAVER_BLOG_POST_VIEW_PATH = /^\/PostView\.(?:naver|nhn)$/

type NaverBlogPost = { blogId: string; logNo: string }

export function extractNaverBlogPost(url: URL): NaverBlogPost | null {
    if (!NAVER_BLOG_HOSTNAMES.includes(url.hostname.toLowerCase())) return null

    // 구버전 공유 링크는 게시물을 쿼리로 전달한다. 경로 형태로 맞춰 같은 규칙으로 검증한다.
    const pathname = NAVER_BLOG_POST_VIEW_PATH.test(url.pathname)
        ? `/${url.searchParams.get('blogId') ?? ''}/${url.searchParams.get('logNo') ?? ''}`
        : url.pathname
    const post = NAVER_BLOG_POST_PATH.exec(pathname)

    return post ? { blogId: post[1], logNo: post[2] } : null
}

export const NAVER_BLOG_LINK_CONTENT_STRATEGY: LinkContentTinyFishStrategy = {
    kind: 'tinyfish',
    name: 'naver-blog',
    source: 'blog.naver.com',
    supports: (url) => extractNaverBlogPost(url) !== null,
    // PC 경로는 본문을 mainFrame iframe으로만 제공하므로 본문이 문서에 포함된 모바일 경로로 정규화한다.
    prepareUrl: (url) => {
        const post = extractNaverBlogPost(url)

        return new URL(
            `https://m.blog.naver.com/${post?.blogId ?? ''}/${post?.logNo ?? ''}`,
        )
    },
    // 스마트에디터 ONE의 .se-main-container를 감싸는 본문 컨테이너이며 구버전 에디터
    // 게시물에도 같은 이름으로 존재한다. 카테고리·제목 한 줄만 더 포함한다.
    fetchOptions: () => ({ includeSelectors: ['.post_ct'] }),
    normalizeContent: (_url, content) => ({
        ...content,
        title:
            content.title
                ?.replace(/\s*[:|]\s*네이버\s*블로그\s*$/, '')
                .trim() || null,
    }),
    // 모바일 본문 사진만 사용한다. 프로필(blogpfthumb), 외부 링크 카드 썸네일(dthumb),
    // 블로그 UI 아이콘(ssl.pstatic.net)은 게시물 자체 이미지가 아니므로 제외한다.
    selectImage: (_url, imageLinks) =>
        findFirstTinyFishImage(
            imageLinks,
            (image) =>
                image.protocol === 'https:' &&
                image.hostname === 'mblogthumb-phinf.pstatic.net' &&
                // 같은 사진의 지연 로딩 placeholder(type=w80_blur)가 원본보다 먼저 오므로 제외한다.
                !image.searchParams.get('type')?.includes('blur'),
        ),
}
