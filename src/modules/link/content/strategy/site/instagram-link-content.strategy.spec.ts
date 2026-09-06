import {
    INSTAGRAM_LINK_CONTENT_STRATEGY,
    normalizeInstagramTitle,
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

    it('게시물 제목에서 작성자를 제거하고 캡션 첫 줄을 사용한다', () => {
        expect(
            normalizeInstagramTitle(
                new URL('https://instagram.com/p/example'),
                '브이지피 서울 on Instagram: "자양동 골목이 요즘 그렇게 핫하다고 해서 다녀왔는데\n\n칼레오커피로스터스"',
            ),
        ).toBe('자양동 골목이 요즘 그렇게 핫하다고 해서 다녀왔는데')
    })

    it('게시물 제목을 100자로 제한한다', () => {
        expect(
            normalizeInstagramTitle(
                new URL('https://instagram.com/reel/example'),
                `작성자 on Instagram: "${'제'.repeat(120)}"`,
            ),
        ).toBe('제'.repeat(100))
    })

    it('100자 경계의 이모지를 나누지 않는다', () => {
        expect(
            normalizeInstagramTitle(
                new URL('https://instagram.com/p/example'),
                `작성자 on Instagram: "${'제'.repeat(99)}😀나머지"`,
            ),
        ).toBe(`${'제'.repeat(99)}😀`)
    })

    it('여러 줄 캡션 첫 줄의 사용자 인용부호를 유지한다', () => {
        expect(
            normalizeInstagramTitle(
                new URL('https://instagram.com/p/example'),
                '작성자 on Instagram: "그는 "안녕"이라고 말했다"\n다음 내용"',
            ),
        ).toBe('그는 "안녕"이라고 말했다"')
    })

    it('작성자 이름에 포함된 구분자 대신 캡션 앞 구분자를 사용한다', () => {
        expect(
            normalizeInstagramTitle(
                new URL('https://instagram.com/p/example'),
                'Tips on Instagram: Daily on Instagram: "실제 캡션"',
            ),
        ).toBe('실제 캡션')
    })

    it('곡선 인용부호로 감싼 캡션도 정규화한다', () => {
        expect(
            normalizeInstagramTitle(
                new URL('https://instagram.com/p/example'),
                '작성자 on Instagram: “실제 캡션”',
            ),
        ).toBe('실제 캡션')
    })

    it('프로필 제목은 작성자 정보를 유지한다', () => {
        expect(
            normalizeInstagramTitle(
                new URL('https://instagram.com/example'),
                'Example (@example) • Instagram photos and videos',
            ),
        ).toBe('Example (@example) • Instagram photos and videos')
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
