import { ConfigService } from '@nestjs/config'

import { ValidatedEnvironment } from '../../../../config/environment'

import {
    sanitizeTinyFishUrl,
    TinyFishFetchClient,
} from './tinyfish-fetch.client'

describe('TinyFishFetchClient', () => {
    let fetchSpy: jest.SpiedFunction<typeof fetch>

    beforeEach(() => {
        fetchSpy = jest.spyOn(global, 'fetch')
    })

    afterEach(() => {
        jest.restoreAllMocks()
    })

    it.each([
        [undefined, false],
        ['tinyfish-api-key', true],
    ])('API key 존재 여부로 활성화한다', (apiKey, expected) => {
        expect(createClient(apiKey).isEnabled()).toBe(expected)
    })

    it('외부 전송 전에 userinfo와 fragment를 제거하고 query는 유지한다', () => {
        expect(
            sanitizeTinyFishUrl(
                new URL(
                    'https://user:secret@x.com/OpenAI/status/1?page=2#reply',
                ),
            ).toString(),
        ).toBe('https://x.com/OpenAI/status/1?page=2')
    })

    it('정리한 URL로 요청하고 파싱한 응답을 반환한다', async () => {
        fetchSpy.mockResolvedValueOnce(
            new Response(
                JSON.stringify({
                    results: [{ title: 'X 게시물', text: '본문' }],
                    errors: [],
                }),
                { status: 200 },
            ),
        )

        await expect(
            createClient('tinyfish-api-key').fetch(
                new URL(
                    'https://user:secret@x.com/OpenAI/status/1?page=2#reply',
                ),
            ),
        ).resolves.toEqual({
            status: 'SUCCESS',
            content: {
                title: 'X 게시물',
                description: null,
                content: '본문',
                imageLinks: [],
            },
        })

        const request = fetchSpy.mock.calls[0][1]
        const requestBody = request?.body

        if (typeof requestBody !== 'string') {
            throw new Error('TinyFish 요청 body가 문자열이 아닙니다.')
        }

        const body = JSON.parse(requestBody) as { urls: string[] }

        expect(body.urls).toEqual(['https://x.com/OpenAI/status/1?page=2'])
    })

    it('전략의 선택자 옵션을 전달하고 기본 요청 설정을 유지한다', async () => {
        fetchSpy.mockResolvedValueOnce(
            new Response(
                JSON.stringify({
                    results: [{ title: 'X', text: '본문' }],
                    errors: [],
                }),
            ),
        )
        await createClient('tinyfish-api-key').fetch(
            new URL('https://x.com/NASA/status/1'),
            {
                includeSelectors: ['article'],
                excludeSelectors: ['article article'],
            },
        )
        const body: unknown = JSON.parse(
            fetchSpy.mock.calls[0][1]?.body as string,
        )
        expect(body).toMatchObject({
            include_selectors: ['article'],
            exclude_selectors: ['article article'],
            format: 'markdown',
            image_links: true,
            ttl: 3600,
            per_url_timeout_ms: 20000,
        })
    })

    it('오류 응답 body를 취소한 뒤 재시도 가능한 예외를 던진다', async () => {
        let canceled = false
        const body = new ReadableStream({
            start(controller) {
                controller.enqueue(new TextEncoder().encode('unavailable'))
            },
            cancel() {
                canceled = true
            },
        })
        fetchSpy.mockResolvedValueOnce(new Response(body, { status: 503 }))

        await expect(
            createClient('tinyfish-api-key').fetch(
                new URL('https://x.com/OpenAI/status/1'),
            ),
        ).rejects.toMatchObject({ retryable: true })
        expect(canceled).toBe(true)
    })

    it('응답을 읽는 중 제한을 초과하면 body를 취소한다', async () => {
        let canceled = false
        const body = new ReadableStream({
            start(controller) {
                controller.enqueue(new Uint8Array(2 * 1024 * 1024 + 1))
            },
            cancel() {
                canceled = true
            },
        })
        fetchSpy.mockResolvedValueOnce(new Response(body, { status: 200 }))

        await expect(
            createClient('tinyfish-api-key').fetch(
                new URL('https://x.com/OpenAI/status/1'),
            ),
        ).rejects.toMatchObject({ retryable: false })
        expect(canceled).toBe(true)
    })
    describe('멀티 키 라운드 로빈과 cooldown', () => {
        const url = new URL('https://example.com/a')
        const okResponse = () =>
            new Response(
                JSON.stringify({
                    results: [{ title: '제목', text: '본문' }],
                    errors: [],
                }),
            )
        const sentKeys = () =>
            fetchSpy.mock.calls.map(([, init]) =>
                new Headers(init?.headers).get('X-API-Key'),
            )

        beforeEach(() => {
            fetchSpy.mockImplementation(() => Promise.resolve(okResponse()))
        })

        it('키가 없어도 기존 비활성 오류를 반환한다', async () => {
            await expect(
                createClient(undefined).fetch(url),
            ).rejects.toMatchObject({ retryable: false })
            expect(fetchSpy).not.toHaveBeenCalled()
        })

        it('멀티 키 설정을 우선 사용하고 공백과 중복을 제거한다', async () => {
            const client = createClient('legacy', ' A, B, A, C ')
            expect(client.isEnabled()).toBe(true)
            for (let i = 0; i < 6; i += 1) await client.fetch(url)
            expect(sentKeys()).toEqual(['A', 'B', 'C', 'A', 'B', 'C'])
        })

        it('동시 호출을 순서대로 분산하고 135개에서도 로컬 차단하지 않는다', async () => {
            const client = createClient(undefined, 'A,B')
            await Promise.all(
                Array.from({ length: 280 }, () => client.fetch(url)),
            )
            expect(sentKeys()).toEqual(
                Array.from({ length: 280 }, (_, i) =>
                    i % 2 === 0 ? 'A' : 'B',
                ),
            )
        })

        it('429를 받은 키만 건너뛰고 같은 URL과 옵션을 다음 키로 재요청한다', async () => {
            jest.spyOn(Date, 'now').mockReturnValue(1_000_000)
            fetchSpy.mockResolvedValueOnce(
                new Response('', {
                    status: 429,
                    headers: { 'Retry-After': '120' },
                }),
            )
            const client = createClient(undefined, 'A,B,C')
            await expect(
                client.fetch(url, { includeSelectors: ['article'] }),
            ).resolves.toMatchObject({ status: 'SUCCESS' })
            await client.fetch(url)
            await client.fetch(url)
            expect(sentKeys()).toEqual(['A', 'B', 'C', 'B'])
            expect(fetchSpy.mock.calls[1][1]?.body).toBe(
                fetchSpy.mock.calls[0][1]?.body,
            )
        })

        it.each([
            ['10', 10_000],
            ['120', 120_000],
            [null, 60_000],
            ['invalid', 60_000],
            ['-1', 60_000],
            ['', 60_000],
        ])(
            'Retry-After=%s의 cooldown이 끝나면 키를 다시 사용한다',
            async (header, duration) => {
                const now = jest.spyOn(Date, 'now').mockReturnValue(1_000_000)
                const client = createClient('A')
                fetchSpy.mockResolvedValueOnce(
                    new Response('', {
                        status: 429,
                        headers:
                            header === null ? {} : { 'Retry-After': header },
                    }),
                )
                await expect(client.fetch(url)).rejects.toMatchObject({
                    retryable: true,
                })
                now.mockReturnValue(1_000_000 + duration - 1)
                await expect(client.fetch(url)).rejects.toMatchObject({
                    retryable: true,
                })
                expect(fetchSpy).toHaveBeenCalledTimes(1)
                now.mockReturnValue(1_000_000 + duration)
                await expect(client.fetch(url)).resolves.toMatchObject({
                    status: 'SUCCESS',
                })
                expect(sentKeys()).toEqual(['A', 'A'])
            },
        )

        it('모든 키가 429이면 기존 재시도 가능한 오류로 종료하고 추가 전송하지 않는다', async () => {
            const client = createClient(undefined, 'A,B')
            fetchSpy.mockImplementation(() =>
                Promise.resolve(new Response('', { status: 429 })),
            )
            await expect(client.fetch(url)).rejects.toMatchObject({
                retryable: true,
            })
            await expect(client.fetch(url)).rejects.toMatchObject({
                retryable: true,
            })
            expect(sentKeys()).toEqual(['A', 'B'])
        })

        it('Retry-After가 0이어도 한 URL에서 같은 키를 반복 시도하지 않는다', async () => {
            const client = createClient(undefined, 'A,B,A')
            fetchSpy.mockImplementation(() =>
                Promise.resolve(
                    new Response('', {
                        status: 429,
                        headers: { 'Retry-After': '0' },
                    }),
                ),
            )
            await expect(client.fetch(url)).rejects.toMatchObject({
                retryable: true,
            })
            expect(sentKeys()).toEqual(['A', 'B'])
        })

        it('동시 429 응답이 먼저 설정된 긴 cooldown을 줄이지 않는다', async () => {
            const now = jest.spyOn(Date, 'now').mockReturnValue(1_000_000)
            const pending: ((response: Response) => void)[] = []
            fetchSpy.mockImplementation(
                () => new Promise((resolve) => pending.push(resolve)),
            )
            const client = createClient('A')
            const first = client.fetch(url).catch((error: unknown) => error)
            const second = client.fetch(url).catch((error: unknown) => error)
            pending[0](
                new Response('', {
                    status: 429,
                    headers: { 'Retry-After': '120' },
                }),
            )
            expect(await first).toMatchObject({ retryable: true })
            pending[1](
                new Response('', {
                    status: 429,
                    headers: { 'Retry-After': '10' },
                }),
            )
            expect(await second).toMatchObject({ retryable: true })
            now.mockReturnValue(1_060_000)
            await expect(client.fetch(url)).rejects.toMatchObject({
                retryable: true,
            })
            expect(fetchSpy).toHaveBeenCalledTimes(2)
        })

        it('401은 원래 목록 인덱스만 알리고 다른 키로 전환하거나 키를 제외하지 않는다', async () => {
            const client = createClient(
                undefined,
                'fixture-a,fixture-a,fixture-b',
            )
            await client.fetch(url)
            fetchSpy.mockResolvedValueOnce(
                new Response('fixture-b must stay private', { status: 401 }),
            )
            await expect(client.fetch(url)).rejects.toMatchObject({
                message:
                    'TinyFish Fetch API 키 인증에 실패했습니다. status=401, keyIndex=3',
                retryable: false,
                cause: undefined,
            })
            expect(sentKeys()).toEqual(['fixture-a', 'fixture-b'])
            await client.fetch(url)
            await client.fetch(url)
            expect(sentKeys()).toEqual([
                'fixture-a',
                'fixture-b',
                'fixture-a',
                'fixture-b',
            ])
        })

        it('기존 단일 키의 401도 인덱스 1로 식별한다', async () => {
            fetchSpy.mockResolvedValueOnce(new Response('', { status: 401 }))
            await expect(
                createClient('fixture-legacy').fetch(url),
            ).rejects.toMatchObject({
                message:
                    'TinyFish Fetch API 키 인증에 실패했습니다. status=401, keyIndex=1',
                retryable: false,
            })
        })

        it.each([
            [401, false],
            [500, true],
        ])(
            'HTTP %s는 키 전환 없이 기존 오류 정책을 따른다',
            async (status, retryable) => {
                const client = createClient(undefined, 'A,B')
                fetchSpy.mockResolvedValueOnce(new Response('', { status }))
                await expect(client.fetch(url)).rejects.toMatchObject({
                    retryable,
                })
                expect(sentKeys()).toEqual(['A'])
            },
        )

        it('대상 사이트의 429는 TinyFish 키 cooldown으로 처리하지 않는다', async () => {
            const client = createClient('A')
            fetchSpy.mockResolvedValueOnce(
                new Response(
                    JSON.stringify({
                        results: [],
                        errors: [{ error: 'target_http_error', status: 429 }],
                    }),
                ),
            )
            await expect(client.fetch(url)).rejects.toMatchObject({
                retryable: true,
            })
            await expect(client.fetch(url)).resolves.toMatchObject({
                status: 'SUCCESS',
            })
            expect(sentKeys()).toEqual(['A', 'A'])
        })

        it('429 body 정리를 기다리기 전에 cooldown을 공유한다', async () => {
            const client = createClient('A')
            let releaseCancel!: () => void
            let notifyCancel!: () => void
            const cancelStarted = new Promise<void>((resolve) => {
                notifyCancel = resolve
            })
            const body = new ReadableStream({
                cancel: () => {
                    notifyCancel()
                    return new Promise<void>((resolve) => {
                        releaseCancel = resolve
                    })
                },
            })
            fetchSpy.mockResolvedValueOnce(new Response(body, { status: 429 }))
            const first = client.fetch(url).catch((error: unknown) => error)
            await cancelStarted
            await expect(client.fetch(url)).rejects.toMatchObject({
                retryable: true,
            })
            expect(fetchSpy).toHaveBeenCalledTimes(1)
            releaseCancel()
            expect(await first).toMatchObject({ retryable: true })
        })

        it('키 전환 후에도 전체 요청 timeout 25초를 유지한다', async () => {
            const originalSetTimeout = global.setTimeout
            let expire!: () => void
            const timeoutSpy = jest
                .spyOn(global, 'setTimeout')
                .mockImplementation((callback, delay) => {
                    expire = () => callback()
                    const timer = originalSetTimeout(callback, delay)
                    clearTimeout(timer)
                    return timer
                })
            let notifySecondRequest!: () => void
            const secondRequestStarted = new Promise<void>((resolve) => {
                notifySecondRequest = resolve
            })
            const client = createClient(undefined, 'A,B')
            fetchSpy
                .mockResolvedValueOnce(new Response('', { status: 429 }))
                .mockImplementationOnce(
                    (_input, init) =>
                        new Promise((_resolve, reject) => {
                            init?.signal?.addEventListener('abort', () =>
                                reject(
                                    new DOMException('aborted', 'AbortError'),
                                ),
                            )
                            notifySecondRequest()
                        }),
                )
            const result = client.fetch(url).catch((error: unknown) => error)
            await secondRequestStarted
            expect(timeoutSpy).toHaveBeenCalledTimes(1)
            expect(timeoutSpy).toHaveBeenCalledWith(
                expect.any(Function),
                25_000,
            )
            expect(fetchSpy.mock.calls[1][1]?.signal).toBe(
                fetchSpy.mock.calls[0][1]?.signal,
            )
            expire()
            expect(await result).toMatchObject({
                retryable: true,
                message: 'TinyFish Fetch 요청 시간이 초과됐습니다.',
            })
            expect(sentKeys()).toEqual(['A', 'B'])
        })
    })
})

function createClient(
    apiKey: string | undefined,
    apiKeys?: string,
): TinyFishFetchClient {
    const config = {
        get: jest.fn((name: string) =>
            name === 'TINY_FISH_API_KEYS' ? apiKeys : apiKey,
        ),
    } as unknown as ConfigService<ValidatedEnvironment, true>

    return new TinyFishFetchClient(config)
}
