import {
    selectXImage,
    X_LINK_CONTENT_STRATEGY,
} from './x-link-content.strategy'

describe('X_LINK_CONTENT_STRATEGY', () => {
    it('TinyFish 요청 URL에서는 query만 제거하고 원본은 변경하지 않는다', () => {
        const resourceUrl = new URL(
            'https://x.com/OpenAI/status/1?ref_src=test#reply',
        )

        expect(X_LINK_CONTENT_STRATEGY.prepareUrl(resourceUrl).toString()).toBe(
            'https://x.com/OpenAI/status/1#reply',
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
