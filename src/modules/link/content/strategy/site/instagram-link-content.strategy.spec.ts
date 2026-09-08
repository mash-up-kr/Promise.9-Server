import {
    INSTAGRAM_LINK_CONTENT_STRATEGY,
    normalizeInstagramContent,
    prepareInstagramUrl,
    selectInstagramImage,
} from './instagram-link-content.strategy'

const captioned = (caption: string) => `author

Original audio

View profile

1,977 likes

author

${caption}

View all 48 comments

Add a comment...*Instagram*`

describe('Instagram captioned 수집', () => {
    it.each(['p', 'reel', 'reels', 'tv'])(
        '%s를 한 번의 captioned 요청 URL로 변환한다',
        (kind) => {
            const url = new URL(
                `https://instagram.com/${kind}/DX7lzTOJ1p6/?igsh=abc#comments`,
            )
            const original = url.toString()
            expect(prepareInstagramUrl(url).toString()).toBe(
                `https://www.instagram.com/${kind === 'reels' ? 'reel' : kind}/DX7lzTOJ1p6/embed/captioned/`,
            )
            expect(url.toString()).toBe(original)
        },
    )

    it.each(['embed/', 'embed/captioned/'])(
        '이미 %s인 URL에 경로를 중복 추가하지 않는다',
        (suffix) => {
            expect(
                prepareInstagramUrl(
                    new URL(`https://instagram.com/p/DW04l9PES8g/${suffix}`),
                ).pathname,
            ).toBe('/p/DW04l9PES8g/embed/captioned/')
        },
    )

    it('프로필은 기존 원본 URL을 사용한다', () => {
        expect(
            prepareInstagramUrl(
                new URL('https://instagram.com/author?igsh=abc'),
            ).toString(),
        ).toBe('https://instagram.com/author')
    })

    it('위장 hostname에 Instagram 전용 URL 변환을 적용하지 않는다', () => {
        const url = new URL('https://instagram.com.evil.example/p/DW04l9PES8g/')
        expect(INSTAGRAM_LINK_CONTENT_STRATEGY.supports(url)).toBe(false)
        expect(prepareInstagramUrl(url).hostname).toBe(url.hostname)
    })

    it.each(['p', 'reel'])(
        '%s의 캡션은 제목·설명으로 사용하고 중복 본문은 비운다',
        (kind) => {
            const result = normalizeInstagramContent(
                new URL(`https://instagram.com/${kind}/DX7lzTOJ1p6/`),
                {
                    title: 'Instagram',
                    description: '잘못된 메타데이터',
                    content: captioned('제목 줄\n\n나머지 캡션 #태그'),
                    imageLinks: [],
                },
            )
            expect(result).toEqual({
                title: '제목 줄',
                description: '제목 줄\n\n나머지 캡션 #태그',
                content: null,
                imageLinks: [],
            })
        },
    )

    it('제목의 100자 경계에서 이모지를 나누지 않는다', () => {
        const result = normalizeInstagramContent(
            new URL('https://instagram.com/p/DW04l9PES8g/'),
            {
                title: 'Instagram',
                description: null,
                content: captioned('제'.repeat(99) + '😀나머지\n두 번째 줄'),
                imageLinks: [],
            },
        )
        expect(result.title).toBe('제'.repeat(99) + '😀')
    })

    it('프로필의 제목과 본문은 기존 결과를 유지한다', () => {
        const content = {
            title: 'Author (@author)',
            description: '프로필 소개',
            content: '프로필 본문',
            imageLinks: [],
        }
        expect(
            normalizeInstagramContent(
                new URL('https://instagram.com/author'),
                content,
            ),
        ).toEqual(content)
    })

    it('캡션 경계를 찾지 못하면 메타데이터나 UI를 대신 저장하지 않는다', () => {
        expect(
            normalizeInstagramContent(
                new URL('https://instagram.com/reel/DX7lzTOJ1p6/'),
                {
                    title: 'Instagram',
                    description: '1,977 likes',
                    content: 'View profile',
                    imageLinks: [],
                },
            ),
        ).toEqual({
            title: null,
            description: null,
            content: null,
            imageLinks: [],
        })
    })
})

describe('Instagram 이미지 선택', () => {
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

describe('Instagram Reel 표지 보완', () => {
    const reel = new URL('https://www.instagram.com/reel/DX7lzTOJ1p6/')
    const mediaId = '3889868956217334394'
    const imageId = '18588123736054628'
    const image = (id: string, host = 'scontent.cdninstagram.com') => {
        const url = new URL(
            `https://${host}/v/t51.82787-15/683900142_18588123742054628_1842156675459391844_n.jpg`,
        )
        url.searchParams.set(
            'ig_cache_key',
            Buffer.from(id).toString('base64') + '.3-ccb7-5',
        )
        return url.toString()
    }

    it('추천 이미지를 건너뛰고 파일명 ID와 캐시 키 보조 ID가 다른 실제 표지를 선택한다', () => {
        const cover = image(mediaId + imageId)
        expect(
            selectInstagramImage(reel, [
                image('3981219167379804392' + imageId),
                cover,
            ]),
        ).toBe(cover)
    })

    it.each([
        '38898689562173343940' + imageId,
        '3889868956217334394' + '9999999999999999',
        'not-a-media-id',
    ])('접두사만 일치하거나 형식이 잘못된 캐시 키를 거부한다: %s', (key) => {
        expect(selectInstagramImage(reel, [image(key)])).toBeNull()
    })

    it('위장 CDN, HTTP, 프로필 이미지를 거부한다', () => {
        const cover = image(mediaId + imageId)
        expect(
            selectInstagramImage(reel, [
                image(mediaId + imageId, 'cdninstagram.com.evil.example'),
                cover.replace('https:', 'http:'),
                cover.replace('-15/', '-19/'),
                cover.replace('ig_cache_key=', 'other='),
            ]),
        ).toBeNull()
    })

    it('Meta CDN의 대상 표지도 선택한다', () => {
        const cover = image(
            mediaId + imageId,
            'instagram.fcgk30-1.fna.fbcdn.net',
        )
        expect(selectInstagramImage(reel, [cover])).toBe(cover)
    })
})
