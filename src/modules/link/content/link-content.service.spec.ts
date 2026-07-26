import { UrlSecurityService } from '../../../common/security/url-security/url-security.service'

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
                return new URL(rawUrl, baseUrl)
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
        })
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
