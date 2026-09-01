import { UrlSecurityService } from '../../../common/security/url-security/url-security.service'

import { LINK_CONTENT_IMAGE_URL_MAX_LENGTH } from './link-content.constants'
import { LinkContentService } from './link-content.service'

describe('LinkContentService', () => {
    let service: LinkContentService
    let urlSecurity: jest.Mocked<
        Pick<UrlSecurityService, 'parseHttpUrl' | 'resolvePublicUrl'>
    >
    let fetchSpy: jest.SpiedFunction<typeof fetch>

    beforeEach(() => {
        urlSecurity = {
            parseHttpUrl: jest.fn((rawUrl: string, baseUrl?: URL) => {
                const url = new URL(rawUrl, baseUrl)

                if (url.protocol !== 'http:' && url.protocol !== 'https:') {
                    throw new Error('unsupported protocol')
                }

                return url
            }),
            resolvePublicUrl: jest.fn().mockResolvedValue({
                address: '93.184.216.34',
            }),
        }
        fetchSpy = jest.spyOn(global, 'fetch')
        service = new LinkContentService(
            urlSecurity as unknown as UrlSecurityService,
        )
    })

    afterEach(() => {
        fetchSpy.mockRestore()
    })

    it('링크 미리보기에서 제목, 절대 이미지 URL, 출처를 반환한다', async () => {
        fetchSpy.mockResolvedValueOnce(
            htmlResponse(`
                <meta property="og:title" content="링크 제목" />
                <meta property="og:image" content="/thumbnail.png" />
            `),
        )

        const result = await service.preview('https://www.example.com/article')

        expect(result).toEqual({
            title: '링크 제목',
            thumbnailUrl: 'https://www.example.com/thumbnail.png',
            source: 'example.com',
        })
        expect(fetchSpy).toHaveBeenCalledTimes(1)
    })

    it('브라우저가 아닌 링크 수집기 User-Agent로 HTML을 요청한다', async () => {
        fetchSpy.mockResolvedValueOnce(htmlResponse('<title>링크 제목</title>'))

        await service.preview('https://example.com/article')

        const [requestUrl, requestOptions] = fetchSpy.mock.calls[0]

        expect(requestUrl).toEqual(new URL('https://example.com/article'))
        expect(requestOptions?.headers).toMatchObject({
            'User-Agent': 'Promise9Bot/1.0',
        })
    })

    it('YouTube 미리보기는 oEmbed 제목과 썸네일을 사용한다', async () => {
        fetchSpy.mockResolvedValueOnce(
            jsonResponse({
                title: '식인섬에서 살아남기',
                thumbnail_url:
                    'https://i.ytimg.com/vi/8Pbt-Aum5Q4/hqdefault.jpg',
            }),
        )

        const resourceUrl = 'https://www.youtube.com/watch?v=8Pbt-Aum5Q4&t=14s'
        const result = await service.preview(resourceUrl)

        expect(result).toEqual({
            title: '식인섬에서 살아남기',
            thumbnailUrl: 'https://i.ytimg.com/vi/8Pbt-Aum5Q4/hqdefault.jpg',
            source: 'youtube.com',
        })
        expect(fetchSpy).toHaveBeenCalledTimes(1)

        const [requestUrl, requestOptions] = fetchSpy.mock.calls[0]
        const endpoint = requestUrl as URL

        expect(endpoint.origin + endpoint.pathname).toBe(
            'https://www.youtube.com/oembed',
        )
        expect(endpoint.searchParams.get('url')).toBe(resourceUrl)
        expect(endpoint.searchParams.get('format')).toBe('json')
        expect(requestOptions?.headers).toMatchObject({
            Accept: 'application/json',
        })
    })

    it('YouTube 저장 수집은 oEmbed 제목과 썸네일만 반환한다', async () => {
        fetchSpy.mockResolvedValueOnce(
            jsonResponse({
                title: '영상 제목',
                thumbnail_url: 'https://i.ytimg.com/vi/video/hqdefault.jpg',
            }),
        )

        const result = await service.collect('https://youtu.be/video?t=14')

        expect(result).toEqual({
            title: '영상 제목',
            description: null,
            content: null,
            image: {
                url: 'https://i.ytimg.com/vi/video/hqdefault.jpg',
                source: 'oembed',
            },
        })
        expect(fetchSpy).toHaveBeenCalledTimes(1)
    })

    it('YouTube oEmbed가 실패하면 기존 OG 수집으로 폴백한다', async () => {
        fetchSpy
            .mockResolvedValueOnce(new Response('', { status: 503 }))
            .mockResolvedValueOnce(
                htmlResponse(`
                    <meta property="og:title" content="폴백 제목" />
                    <meta property="og:image" content="/fallback.jpg" />
                `),
            )

        const result = await service.preview(
            'https://www.youtube.com/watch?v=video',
        )

        expect(result).toEqual({
            title: '폴백 제목',
            thumbnailUrl: 'https://www.youtube.com/fallback.jpg',
            source: 'youtube.com',
        })
        expect(fetchSpy).toHaveBeenCalledTimes(2)
    })

    it('robots.txt가 허용한 링크에서 제목, 설명, 본문을 수집한다', async () => {
        fetchSpy
            .mockResolvedValueOnce(
                new Response('User-agent: *\nAllow: /articles/', {
                    status: 200,
                }),
            )
            .mockResolvedValueOnce(
                htmlResponse(`
                    <html>
                        <head>
                            <meta property="og:title" content="링크 제목" />
                            <meta property="og:image" content="/thumbnail.png" />
                            <meta name="description" content="링크 설명" />
                            <script>제외할 코드</script>
                        </head>
                        <body>본문 &amp; 내용</body>
                    </html>
                `),
            )

        const result = await service.collect('https://example.com/articles/1')

        expect(result).toEqual({
            title: '링크 제목',
            description: '링크 설명',
            content: '본문 & 내용',
            image: {
                url: 'https://example.com/thumbnail.png',
                source: 'og:image',
            },
        })
    })

    it('twitter:image만 있는 페이지도 대표 이미지 출처와 함께 수집한다', async () => {
        fetchSpy
            .mockResolvedValueOnce(new Response('', { status: 404 }))
            .mockResolvedValueOnce(
                htmlResponse(`
                    <meta name="twitter:image" content="/twitter.png" />
                `),
            )

        const result = await service.collect('https://example.com/article')

        expect(result).toEqual({
            title: null,
            description: null,
            content: null,
            image: {
                url: 'https://example.com/twitter.png',
                source: 'twitter:image',
            },
        })
    })

    it.each([
        ['HTTP 이외 스킴', 'data:image/png;base64,AAAA'],
        [
            '최대 길이를 초과한 URL',
            `https://cdn.example/${'a'.repeat(LINK_CONTENT_IMAGE_URL_MAX_LENGTH)}`,
        ],
    ])('%s의 대표 이미지는 저장하지 않는다', async (_case, imageUrl) => {
        fetchSpy
            .mockResolvedValueOnce(new Response('', { status: 404 }))
            .mockResolvedValueOnce(
                htmlResponse(`
                    <meta property="og:title" content="링크 제목" />
                    <meta property="og:image" content="${imageUrl}" />
                `),
            )

        const result = await service.collect('https://example.com/article')

        expect(result).toMatchObject({
            title: '링크 제목',
            image: null,
        })
    })

    it('공개 호스트로 검증되지 않은 대표 이미지는 저장하지 않는다', async () => {
        urlSecurity.resolvePublicUrl
            .mockResolvedValueOnce({ address: '93.184.216.34' })
            .mockRejectedValueOnce(new Error('private address'))
        fetchSpy
            .mockResolvedValueOnce(new Response('', { status: 404 }))
            .mockResolvedValueOnce(
                htmlResponse(`
                    <meta property="og:title" content="링크 제목" />
                    <meta property="og:image" content="http://127.0.0.1/private.png" />
                `),
            )

        const result = await service.collect('https://example.com/article')

        expect(result).toMatchObject({
            title: '링크 제목',
            image: null,
        })
    })

    it.each([
        ['script', 'var closedData = true', 'var truncatedData = true'],
        ['style', '.closed { display: none }', '.truncated { color: red }'],
        ['noscript', '닫힌 대체 콘텐츠', '잘린 대체 콘텐츠'],
    ])(
        'HTML 주석과 닫히지 않은 %s 내용을 본문에서 제외한다',
        async (tag, closedContent, truncatedContent) => {
            fetchSpy
                .mockResolvedValueOnce(new Response('', { status: 404 }))
                .mockResolvedValueOnce(
                    htmlResponse(`
                        <body>
                            <p>본문 앞</p>
                            <!-- 본문에 포함하지 않을 주석 -->
                            <${tag}>${closedContent}</${tag}>
                            <p>본문 뒤</p>
                            <${tag}>${truncatedContent}
                    `),
                )

            const result = await service.collect('https://example.com/article')

            expect(result?.content).toBe('본문 앞 본문 뒤')
        },
    )

    it('유사 마크업을 실행 요소로 오인해 실제 본문을 누락하지 않는다', async () => {
        fetchSpy
            .mockResolvedValueOnce(new Response('', { status: 404 }))
            .mockResolvedValueOnce(
                htmlResponse(`
                    <div data-template="> <!--">속성 본문</div>
                    <style>.item::before { content: '<script>' }</style>
                    <script>
                        const comment = '<!--'
                        const close = '</script\u00a0>'
                    </script/>
                    <main>실제 본문</main>
                `),
            )

        const result = await service.collect('https://example.com/article')

        expect(result?.content).toBe('속성 본문 실제 본문')
    })

    it('robots.txt가 링크 경로를 차단하면 페이지를 요청하지 않는다', async () => {
        fetchSpy.mockResolvedValueOnce(
            new Response('User-agent: *\nDisallow: /private/', {
                status: 200,
            }),
        )

        await expect(
            service.collect('https://example.com/private/1'),
        ).resolves.toBeNull()
        expect(fetchSpy).toHaveBeenCalledTimes(1)
    })

    it('robots.txt 조회의 일시적 5xx는 호출부가 재시도할 수 있도록 예외로 전달한다', async () => {
        fetchSpy.mockResolvedValueOnce(new Response('', { status: 503 }))

        await expect(
            service.collect('https://example.com/article'),
        ).rejects.toHaveProperty('status', 502)
        expect(fetchSpy).toHaveBeenCalledTimes(1)
    })

    it('페이지 요청의 네트워크 실패는 호출부가 재시도할 수 있도록 예외로 전달한다', async () => {
        fetchSpy
            .mockResolvedValueOnce(new Response('', { status: 404 }))
            .mockRejectedValueOnce(new Error('network failed'))

        await expect(
            service.collect('https://example.com/article'),
        ).rejects.toHaveProperty('status', 502)
        expect(fetchSpy).toHaveBeenCalledTimes(2)
    })

    it('수집한 제목·설명·본문을 각 입력 제한 길이로 자른다', async () => {
        fetchSpy
            .mockResolvedValueOnce(new Response('', { status: 404 }))
            .mockResolvedValueOnce(
                htmlResponse(`
                    <meta property="og:title" content="${'제'.repeat(600)}" />
                    <meta name="description" content="${'설'.repeat(3_000)}" />
                    <body>${'본'.repeat(17_000)}</body>
                `),
            )

        const result = await service.collect('https://example.com/article')

        expect(result?.title).toHaveLength(512)
        expect(result?.description).toHaveLength(2_000)
        expect(result?.content).toHaveLength(16_000)
    })

    it('리다이렉트된 링크도 robots.txt가 허용한 경우에만 요청한다', async () => {
        fetchSpy
            .mockResolvedValueOnce(
                new Response('User-agent: *\nAllow: /articles/', {
                    status: 200,
                }),
            )
            .mockResolvedValueOnce(
                new Response(null, {
                    status: 302,
                    headers: {
                        location: 'https://redirected.example/private/1',
                    },
                }),
            )
            .mockResolvedValueOnce(
                new Response('User-agent: *\nDisallow: /private/', {
                    status: 200,
                }),
            )

        await expect(
            service.collect('https://example.com/articles/1'),
        ).resolves.toBeNull()
        expect(fetchSpy).toHaveBeenCalledTimes(3)
        expect(fetchSpy).toHaveBeenNthCalledWith(
            3,
            new URL('https://redirected.example/robots.txt'),
            expect.any(Object),
        )
    })
})

function htmlResponse(html: string): Response {
    return new Response(html, {
        status: 200,
        headers: {
            'content-type': 'text/html; charset=utf-8',
        },
    })
}

function jsonResponse(value: unknown): Response {
    return new Response(JSON.stringify(value), {
        status: 200,
        headers: {
            'content-type': 'application/json; charset=utf-8',
        },
    })
}
