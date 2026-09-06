import { TinyFishFetchError } from './tinyfish-fetch.error'
import { parseTinyFishResponse } from './tinyfish-response.parser'

describe('parseTinyFishResponse', () => {
    it('텍스트와 image_links를 정규화한다', () => {
        expect(
            parseTinyFishResponse({
                results: [
                    {
                        title: 'A &amp; B',
                        description: null,
                        text: '본문&#39;\n본문&#39;\n\n다음',
                        image_links: [
                            'https://cdn.example/avatar.jpg',
                            1,
                            'https://cdn.example/post.jpg',
                        ],
                    },
                ],
                errors: [],
            }),
        ).toEqual({
            status: 'SUCCESS',
            content: {
                title: 'A & B',
                description: null,
                content: "본문'\n\n다음",
                imageLinks: [
                    'https://cdn.example/avatar.jpg',
                    'https://cdn.example/post.jpg',
                ],
            },
        })
    })

    it('유효하지 않은 numeric entity를 replacement character로 바꾼다', () => {
        const result = parseTinyFishResponse({
            results: [
                {
                    title: 'RAW\0 ENTITY&#0; SURROGATE&#xD800; RANGE&#x110000;',
                },
            ],
        })

        expect(result).toMatchObject({
            status: 'SUCCESS',
            content: { title: 'RAW� ENTITY� SURROGATE� RANGE�' },
        })
    })

    it('재시도 가능한 URL 오류는 예외로 반환한다', () => {
        expect(() =>
            parseTinyFishResponse({
                results: [],
                errors: [{ error: 'timeout' }],
            }),
        ).toThrow(TinyFishFetchError)
    })

    it('영구적인 URL 오류는 수집 불가 결과로 반환한다', () => {
        expect(
            parseTinyFishResponse({
                results: [],
                errors: [{ error: 'login_required' }],
            }),
        ).toEqual({
            status: 'UNAVAILABLE',
            reason: 'TinyFish URL 수집 불가: login_required',
        })
    })
})
