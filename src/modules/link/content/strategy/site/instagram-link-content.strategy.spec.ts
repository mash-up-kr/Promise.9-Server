import {
    INSTAGRAM_LINK_CONTENT_STRATEGY,
    selectInstagramImage,
} from './instagram-link-content.strategy'

describe('INSTAGRAM_LINK_CONTENT_STRATEGY', () => {
    it('TinyFish 요청 URL에서는 query만 제거하고 원본은 변경하지 않는다', () => {
        const resourceUrl = new URL(
            'https://instagram.com/p/example?img_index=2#comments',
        )

        expect(
            INSTAGRAM_LINK_CONTENT_STRATEGY.prepareUrl(resourceUrl).toString(),
        ).toBe('https://instagram.com/p/example#comments')
        expect(resourceUrl.toString()).toBe(
            'https://instagram.com/p/example?img_index=2#comments',
        )
    })

    it('게시물 경로 종류와 무관하게 ig_cache_key 이미지를 선택한다', () => {
        expect(
            selectInstagramImage(new URL('https://instagram.com/p/example'), [
                'https://scontent.cdninstagram.com/v/t51.2885-19/avatar.jpg',
                'https://scontent.cdninstagram.com/v/t39.30808-6/post.jpg?ig_cache_key=abc',
            ]),
        ).toBe(
            'https://scontent.cdninstagram.com/v/t39.30808-6/post.jpg?ig_cache_key=abc',
        )
    })

    it('Meta fbcdn.net의 Instagram 게시물 이미지도 선택한다', () => {
        expect(
            selectInstagramImage(new URL('https://instagram.com/p/example'), [
                'https://instagram.fcgk30-1.fna.fbcdn.net/v/t51.75761-15/post.jpg?ig_cache_key=abc',
            ]),
        ).toBe(
            'https://instagram.fcgk30-1.fna.fbcdn.net/v/t51.75761-15/post.jpg?ig_cache_key=abc',
        )
    })

    it.each([
        'https://scontent.cdninstagram.com/v/t51.82787-15/recommended.jpg',
        'https://cdninstagram.com.evil.example/v/t51.82787-15/post.jpg?ig_cache_key=abc',
        'https://instagram.evil.example/v/t51.82787-15/post.jpg?ig_cache_key=abc',
        'http://scontent.cdninstagram.com/v/t51.82787-15/post.jpg?ig_cache_key=abc',
    ])('게시물의 불확실한 이미지 후보를 제외한다: %s', (image) => {
        expect(
            selectInstagramImage(new URL('https://instagram.com/p/example'), [
                image,
            ]),
        ).toBeNull()
    })

    it('Reel의 추천 게시물 이미지를 대표 이미지로 오인하지 않는다', () => {
        expect(
            selectInstagramImage(
                new URL('https://instagram.com/reel/example'),
                [
                    'https://scontent.cdninstagram.com/v/t51.2885-15/recommended.jpg?ig_cache_key=abc',
                ],
            ),
        ).toBeNull()
    })
})
