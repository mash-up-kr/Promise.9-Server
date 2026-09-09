import {
    selectXImage,
    X_LINK_CONTENT_STRATEGY,
} from './x-link-content.strategy'

describe('X_LINK_CONTENT_STRATEGY', () => {
    it('게시물 요청 URL은 fragment·query를 제거하고 원본은 변경하지 않는다', () => {
        const resourceUrl = new URL(
            'https://x.com/OpenAI/status/1?ref_src=test#reply',
        )

        expect(X_LINK_CONTENT_STRATEGY.prepareUrl(resourceUrl).toString()).toBe(
            'https://x.com/OpenAI/status/1',
        )
        expect(resourceUrl.toString()).toBe(
            'https://x.com/OpenAI/status/1?ref_src=test#reply',
        )
    })

    it('avatar를 건너뛰고 첫 본문 미디어를 선택한다', () => {
        expect(
            selectXImage(new URL('https://x.com/OpenAI/status/1'), [
                'https://pbs.twimg.com/profile_images/avatar.jpg',
                'https://pbs.twimg.com/tweet_video_thumb/post.jpg',
                'https://pbs.twimg.com/media/comment.jpg',
            ]),
        ).toBe('https://pbs.twimg.com/tweet_video_thumb/post.jpg')
    })

    it('텍스트 게시물의 avatar를 대표 이미지로 사용하지 않는다', () => {
        expect(
            selectXImage(new URL('https://x.com/OpenAI/status/1'), [
                'https://pbs.twimg.com/profile_images/avatar.jpg',
            ]),
        ).toBeNull()
    })
})

describe('X URL과 수집 범위', () => {
    it.each([
        'https://twitter.com/NASA/status/123?s=20',
        'https://x.com/NASA/status/123/photo/2',
    ])('동일 게시물은 동일한 요청 URL을 사용한다: %s', (raw) => {
        expect(
            X_LINK_CONTENT_STRATEGY.prepareUrl(new URL(raw)).toString(),
        ).toBe('https://x.com/NASA/status/123')
    })
    it('프로필은 피드를 제외하고 계정 정보를 수집한다', () => {
        expect(
            X_LINK_CONTENT_STRATEGY.fetchOptions!(
                new URL('https://x.com/NASA'),
            ),
        ).toEqual({ excludeSelectors: ['article', 'aside', 'nav'] })
        const content = {
            title: 'NASA',
            description: '소개',
            content: '프로필',
            imageLinks: [],
        }
        expect(
            X_LINK_CONTENT_STRATEGY.normalizeContent!(
                new URL('https://x.com/NASA'),
                content,
            ),
        ).toEqual(content)
    })
    it('이미지 해상도 중복을 제거하고 선택된 두 번째 사진을 사용한다', () => {
        expect(
            selectXImage(new URL('https://x.com/NASA/status/123/photo/2'), [
                'https://pbs.twimg.com/media/one?name=medium',
                'https://pbs.twimg.com/media/one?name=large',
                'https://pbs.twimg.com/media/two?name=medium',
            ]),
        ).toBe('https://pbs.twimg.com/media/two?name=medium')
    })
    it.each([
        'https://x.com/NASA/status/no-id',
        'https://x.com.evil.test/NASA/status/123',
    ])('잘못된 URL은 게시물 전략에서 제외한다: %s', (raw) => {
        expect(X_LINK_CONTENT_STRATEGY.supports(new URL(raw))).toBe(false)
    })
})

describe('X 케이스별 대표 이미지', () => {
    const avatar = 'https://pbs.twimg.com/profile_images/123/author_normal.jpg'
    const largeAvatar =
        'https://pbs.twimg.com/profile_images/123/author_400x400.jpg'
    const replay =
        'https://prod-fastly-us-east-1.video.pscp.tv/Transcoding/v1/replay_thumbnail/test.jpg?token=expiring'
    it('프로필은 배너·피드 대신 동일 계정의 큰 avatar를 선택한다', () => {
        expect(
            selectXImage(new URL('https://x.com/NASA'), [
                'https://pbs.twimg.com/profile_banners/banner.jpg',
                avatar,
                'https://pbs.twimg.com/profile_images/456/other_400x400.jpg',
                'https://pbs.twimg.com/media/feed.jpg',
                largeAvatar,
            ]),
        ).toBe(largeAvatar)
    })
    it('라이브의 만료 URL을 게시자 avatar로 대체하지 않는다', () => {
        expect(
            selectXImage(new URL('https://x.com/NASA/status/1'), [
                avatar,
                replay,
                largeAvatar,
            ]),
        ).toBeNull()
    })
    it('라이브와 자체 사진이 함께 있으면 자체 사진을 우선한다', () => {
        expect(
            selectXImage(new URL('https://x.com/NASA/status/1'), [
                avatar,
                replay,
                'https://pbs.twimg.com/media/own.jpg',
            ]),
        ).toBe('https://pbs.twimg.com/media/own.jpg')
    })
    it('유사 도메인과 일반 글의 avatar는 대체 이미지가 아니다', () => {
        expect(
            selectXImage(new URL('https://x.com/NASA/status/1'), [
                avatar,
                replay.replace('.video.pscp.tv', '.video.pscp.tv.evil.test'),
            ]),
        ).toBeNull()
    })
    it('존재하지 않는 사진 순번은 avatar로 대체하지 않는다', () => {
        expect(
            selectXImage(new URL('https://x.com/NASA/status/1/photo/2'), [
                avatar,
                replay,
            ]),
        ).toBeNull()
    })
})
