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
})

function createClient(apiKey: string | undefined): TinyFishFetchClient {
    const config = {
        get: jest.fn().mockReturnValue(apiKey),
    } as unknown as ConfigService<ValidatedEnvironment, true>

    return new TinyFishFetchClient(config)
}
