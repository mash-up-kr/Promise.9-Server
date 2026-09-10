import { BadRequestException } from '@nestjs/common'

import { UrlSecurityService } from '../../../../common/security/url-security/url-security.service'
import { LINK_ERROR } from '../../link-error.constant'
import { LINK_CONTENT_FETCH } from '../link-content.constants'

import { LinkContentHtmlFetcher } from './link-content-html.fetcher'

// jest는 advanceTimersByTimeAsync로 진행하고, 이를 지원하지 않는 bun test는 microtask를 비운 뒤 동기 API로 대신한다.
async function advanceTimersAsync(ms: number): Promise<void> {
    const advanceAsync = (
        jest as { advanceTimersByTimeAsync?: (ms: number) => Promise<void> }
    ).advanceTimersByTimeAsync
    if (advanceAsync) {
        await advanceAsync(ms)
        return
    }
    for (let i = 0; i < 25; i++) await Promise.resolve()
    jest.advanceTimersByTime(ms)
    for (let i = 0; i < 25; i++) await Promise.resolve()
}

describe('LinkContentHtmlFetcher', () => {
    const security = {
        resolvePublicUrl: jest
            .fn()
            .mockResolvedValue({ address: '93.184.216.34' }),
        parseHttpUrl: (raw: string, base?: URL) => new URL(raw, base),
    }
    beforeEach(() => {
        security.resolvePublicUrl.mockClear()
    })
    afterEach(() => {
        jest.restoreAllMocks()
        jest.useRealTimers()
    })

    it.each([301, 302, 303, 307, 308])(
        'robots %i의 상대 경로를 따라간 뒤 HTML을 읽는다',
        async (status) => {
            const fetchSpy = jest
                .spyOn(global, 'fetch')
                .mockResolvedValueOnce(
                    new Response('', {
                        status,
                        headers: { location: '/canonical-robots.txt' },
                    }),
                )
                .mockResolvedValueOnce(new Response('User-agent: *\nAllow: /'))
                .mockResolvedValueOnce(new Response('<title>허용</title>'))
            const fetcher = new LinkContentHtmlFetcher(
                security as unknown as UrlSecurityService,
            )
            await expect(
                fetcher.fetch(new URL('https://example.com/article'), {
                    respectRobots: true,
                }),
            ).resolves.toMatchObject({ html: '<title>허용</title>' })
            expect(
                fetchSpy.mock.calls.map(([url]) => (url as URL).toString()),
            ).toEqual([
                'https://example.com/robots.txt',
                'https://example.com/canonical-robots.txt',
                'https://example.com/article',
            ])
            expect(security.resolvePublicUrl).toHaveBeenCalledWith(
                new URL('https://example.com/canonical-robots.txt'),
            )
        },
    )

    it('다른 호스트의 robots 정책도 원래 HTML의 UA와 경로에 적용한다', async () => {
        const fetchSpy = jest
            .spyOn(global, 'fetch')
            .mockResolvedValueOnce(
                new Response('', {
                    status: 302,
                    headers: { location: 'https://policy.example/robots.txt' },
                }),
            )
            .mockResolvedValueOnce(
                new Response('User-agent: Promise9Bot\nDisallow: /private'),
            )
        const fetcher = new LinkContentHtmlFetcher(
            security as unknown as UrlSecurityService,
        )
        await expect(
            fetcher.fetch(new URL('https://brunch.co.kr/private/article'), {
                respectRobots: true,
            }),
        ).resolves.toBeNull()
        expect(fetchSpy).toHaveBeenCalledTimes(2)
        expect(fetchSpy.mock.calls[1][1]?.headers).toMatchObject({
            'User-Agent': 'Promise9Bot/1.0',
        })
        expect(security.resolvePublicUrl).toHaveBeenCalledWith(
            new URL('https://policy.example/robots.txt'),
        )
    })

    it('robots 리다이렉트 목적지가 내부망이면 요청 전에 거부한다', async () => {
        const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValueOnce(
            new Response('', {
                status: 302,
                headers: { location: 'http://127.0.0.1/robots.txt' },
            }),
        )
        const publicSecurity = {
            ...security,
            resolvePublicUrl: jest.fn((url: URL) => {
                if (url.hostname === '127.0.0.1')
                    return Promise.reject(
                        new BadRequestException('내부망 차단'),
                    )
                return Promise.resolve({ address: '93.184.216.34' })
            }),
        }
        const fetcher = new LinkContentHtmlFetcher(
            publicSecurity as unknown as UrlSecurityService,
        )
        await expect(
            fetcher.fetch(new URL('https://example.com/article'), {
                respectRobots: true,
            }),
        ).rejects.toThrow(BadRequestException)
        expect(fetchSpy).toHaveBeenCalledTimes(1)
    })

    it('robots 리다이렉트 순환은 횟수 제한에서 실패한다', async () => {
        const fetchSpy = jest.spyOn(global, 'fetch').mockImplementation(() =>
            Promise.resolve(
                new Response('', {
                    status: 302,
                    headers: { location: '/robots.txt' },
                }),
            ),
        )
        const fetcher = new LinkContentHtmlFetcher(
            security as unknown as UrlSecurityService,
        )
        await expect(
            fetcher.fetch(new URL('https://example.com/article'), {
                respectRobots: true,
            }),
        ).rejects.toMatchObject({
            response: {
                error: {
                    errorCode: LINK_ERROR.PREVIEW_REDIRECT_FAILED.errorCode,
                },
            },
        })
        expect(fetchSpy).toHaveBeenCalledTimes(
            LINK_CONTENT_FETCH.maxRedirects + 1,
        )
    })

    it('robots 리다이렉트에 Location이 없으면 실패한다', async () => {
        jest.spyOn(global, 'fetch').mockResolvedValueOnce(
            new Response('', { status: 302 }),
        )
        const fetcher = new LinkContentHtmlFetcher(
            security as unknown as UrlSecurityService,
        )
        await expect(
            fetcher.fetch(new URL('https://example.com/article'), {
                respectRobots: true,
            }),
        ).rejects.toMatchObject({
            response: {
                error: {
                    errorCode: LINK_ERROR.PREVIEW_REDIRECT_FAILED.errorCode,
                },
            },
        })
    })

    it.each(['html', 'robots'])(
        '%s 리다이렉트 후 robots 조회도 전체 5초에 중단한다',
        async (redirectType) => {
            jest.useFakeTimers()
            const signals: AbortSignal[] = []
            let calls = 0
            jest.spyOn(global, 'fetch').mockImplementation(
                async (_url, init) => {
                    signals.push(init!.signal as AbortSignal)
                    calls++
                    if (calls === 1) {
                        await new Promise((resolve) =>
                            setTimeout(resolve, 4900),
                        )
                        return redirectType === 'html'
                            ? new Response('User-agent: *\nAllow: /')
                            : new Response('', {
                                  status: 302,
                                  headers: { location: '/next-robots.txt' },
                              })
                    }
                    if (calls === 2 && redirectType === 'html')
                        return new Response('', {
                            status: 302,
                            headers: {
                                location: 'https://other.example/article',
                            },
                        })
                    return new Promise<Response>((_resolve, reject) => {
                        init!.signal!.addEventListener(
                            'abort',
                            () =>
                                reject(
                                    new DOMException('Aborted', 'AbortError'),
                                ),
                            { once: true },
                        )
                    })
                },
            )
            const fetcher = new LinkContentHtmlFetcher(
                security as unknown as UrlSecurityService,
            )
            let settled = false
            const result = fetcher
                .fetch(new URL('https://example.com/article'), {
                    respectRobots: true,
                })
                .catch((error: unknown) => error)
                .finally(() => {
                    settled = true
                })
            await advanceTimersAsync(5000)
            expect(calls).toBe(redirectType === 'html' ? 3 : 2)
            expect(signals[1].aborted).toBe(true)
            expect(
                signals.every(
                    (signal) => signal === signals[0] && signal.aborted,
                ),
            ).toBe(true)
            expect(await result).toMatchObject({
                response: {
                    error: { errorCode: LINK_ERROR.PREVIEW_TIMEOUT.errorCode },
                },
            })
            expect(settled).toBe(true)
        },
    )
})
