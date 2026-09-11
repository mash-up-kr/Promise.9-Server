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
        fetchSpy.mockRestore()
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
    // TinyFish 키는 분당 150 URL이 상한이다. 상한에 붙으면 사용자 요청도 429를 받으므로
    // 여유를 남긴 135에서 우리가 먼저 끊는다.
    describe('분당 호출 상한', () => {
        const okResponse = () =>
            new Response(JSON.stringify({ results: [] }), {
                status: 200,
                headers: { 'Content-Type': 'application/json' },
            })

        it('135회까지는 요청을 보내고 136번째는 보내지 않고 차단한다', async () => {
            const client = createClient('tinyfish-api-key')
            fetchSpy.mockImplementation(() => Promise.resolve(okResponse()))

            for (let i = 0; i < 135; i += 1) {
                await client
                    .fetch(new URL('https://example.com/a'))
                    .catch(() => undefined)
            }
            expect(fetchSpy).toHaveBeenCalledTimes(135)

            await expect(
                client.fetch(new URL('https://example.com/a')),
            ).rejects.toMatchObject({
                name: 'TinyFishFetchError',
                // 배경 갱신은 재시도로 회복하고, 원격에 부하를 더 주지 않는다.
                retryable: true,
            })
            expect(fetchSpy).toHaveBeenCalledTimes(135)
        })

        it('1분이 지나면 예산이 다시 찬다', async () => {
            const client = createClient('tinyfish-api-key')
            fetchSpy.mockImplementation(() => Promise.resolve(okResponse()))
            const nowSpy = jest.spyOn(Date, 'now').mockReturnValue(1_000_000)

            for (let i = 0; i < 135; i += 1) {
                await client
                    .fetch(new URL('https://example.com/a'))
                    .catch(() => undefined)
            }
            await expect(
                client.fetch(new URL('https://example.com/a')),
            ).rejects.toThrow()

            nowSpy.mockReturnValue(1_000_000 + 60_000)
            await client
                .fetch(new URL('https://example.com/a'))
                .catch(() => undefined)
            expect(fetchSpy).toHaveBeenCalledTimes(136)

            nowSpy.mockRestore()
        })
    })
})

function createClient(apiKey: string | undefined): TinyFishFetchClient {
    const config = {
        get: jest.fn().mockReturnValue(apiKey),
    } as unknown as ConfigService<ValidatedEnvironment, true>

    return new TinyFishFetchClient(config)
}
