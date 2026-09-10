import { HttpException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'

import { ValidatedEnvironment } from '../../../../config/environment'
import { LINK_CONTENT_FETCH } from '../link-content.constants'

import { YoutubeDataClient } from './youtube-data.client'

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

describe('YoutubeDataClient', () => {
    let fetchSpy: jest.SpiedFunction<typeof fetch>
    const videoId = '8Pbt-Aum5Q4'
    const apiKey = 'test-youtube-api-key'
    const client = (key: string | undefined = apiKey) =>
        new YoutubeDataClient({
            get: () => key,
        } as unknown as ConfigService<ValidatedEnvironment, true>)

    beforeEach(() => {
        fetchSpy = jest.spyOn(global, 'fetch')
    })
    afterEach(() => {
        fetchSpy.mockRestore()
        jest.useRealTimers()
    })

    it('공식 API에서 제목·설명·고화질 썸네일을 한 번에 읽는다', async () => {
        fetchSpy.mockResolvedValueOnce(
            new Response(
                JSON.stringify({
                    items: [
                        {
                            id: videoId,
                            snippet: {
                                title: '영상 제목',
                                description: ' 설명란\n두 번째 줄 ',
                                thumbnails: {
                                    default: {
                                        url: 'https://i.ytimg.com/default.jpg',
                                    },
                                    high: {
                                        url: 'https://i.ytimg.com/high.jpg',
                                    },
                                    maxres: {
                                        url: 'https://i.ytimg.com/maxres.jpg',
                                    },
                                },
                            },
                        },
                    ],
                }),
            ),
        )

        await expect(client().fetchVideo(videoId)).resolves.toEqual({
            title: '영상 제목',
            description: '설명란\n두 번째 줄',
            image: 'https://i.ytimg.com/maxres.jpg',
        })
        const [request, options] = fetchSpy.mock.calls[0]
        expect(request).toBeInstanceOf(URL)
        const url = request as URL
        expect(url.origin + url.pathname).toBe(
            'https://www.googleapis.com/youtube/v3/videos',
        )
        expect(Object.fromEntries(url.searchParams)).toEqual({
            part: 'snippet',
            id: videoId,
            fields: 'items(id,snippet(title,description,thumbnails))',
            key: apiKey,
        })
        expect(options?.redirect).toBe('error')
    })

    it.each([
        { items: [] },
        { items: [{ id: 'another-id', snippet: { title: '다른 영상' } }] },
    ])('영상이 조회되지 않으면 null을 반환한다: %j', async (body) => {
        fetchSpy.mockResolvedValueOnce(new Response(JSON.stringify(body)))
        await expect(client().fetchVideo(videoId)).resolves.toBeNull()
    })

    it('설명·썸네일이 없어도 조회된 영상 제목을 반환한다', async () => {
        fetchSpy.mockResolvedValueOnce(
            new Response(
                JSON.stringify({
                    items: [
                        {
                            id: videoId,
                            snippet: { title: '제목', description: '  ' },
                        },
                    ],
                }),
            ),
        )
        await expect(client().fetchVideo(videoId)).resolves.toEqual({
            title: '제목',
            description: null,
            image: null,
        })
    })

    it('maxres가 없으면 다음 해상도의 썸네일을 선택한다', async () => {
        fetchSpy.mockResolvedValueOnce(
            new Response(
                JSON.stringify({
                    items: [
                        {
                            id: videoId,
                            snippet: {
                                title: '제목',
                                thumbnails: {
                                    high: {
                                        url: 'https://i.ytimg.com/high.jpg',
                                    },
                                    default: {
                                        url: 'https://i.ytimg.com/default.jpg',
                                    },
                                },
                            },
                        },
                    ],
                }),
            ),
        )
        await expect(client().fetchVideo(videoId)).resolves.toMatchObject({
            image: 'https://i.ytimg.com/high.jpg',
        })
    })

    it('API 키가 없으면 외부 요청을 실행하지 않는다', async () => {
        const disabled = new YoutubeDataClient({
            get: () => undefined,
        } as unknown as ConfigService<ValidatedEnvironment, true>)
        await expect(disabled.fetchVideo(videoId)).resolves.toBeNull()
        expect(fetchSpy).not.toHaveBeenCalled()
    })

    it.each([403, 429, 500])(
        'HTTP %i 실패를 폴백 호출부에 전달하며 응답을 노출하지 않는다',
        async (status) => {
            fetchSpy.mockResolvedValueOnce(
                new Response(apiKey, { status: Number(status) }),
            )
            const error = await client()
                .fetchVideo(videoId)
                .catch((e: unknown) => e)
            expect(error).toBeInstanceOf(HttpException)
            expect((error as HttpException).getStatus()).toBe(status)
            expect(String(error)).not.toContain(apiKey)
        },
    )

    it.each(['not-json', JSON.stringify({ items: [{}] })])(
        '잘못된 응답을 정상적인 빈 설명으로 취급하지 않는다',
        async (body) => {
            fetchSpy.mockResolvedValueOnce(new Response(body))
            const error = await client()
                .fetchVideo(videoId)
                .catch((e: unknown) => e)
            expect((error as HttpException).getStatus()).toBe(502)
            expect(error).toBeInstanceOf(HttpException)
        },
    )

    it('네트워크 예외에 포함된 API 키를 제거한다', async () => {
        fetchSpy.mockRejectedValueOnce(
            new Error(`request failed: key=${apiKey}`),
        )
        const error = await client()
            .fetchVideo(videoId)
            .catch((e: unknown) => e)
        expect(String(error)).not.toContain(apiKey)
        expect((error as HttpException).getStatus()).toBe(502)
    })

    it('타임아웃 때 요청을 중단하고 오류를 반환한다', async () => {
        jest.useFakeTimers()
        fetchSpy.mockImplementationOnce(
            (_url, options) =>
                new Promise((_resolve, reject) => {
                    options?.signal?.addEventListener('abort', () =>
                        reject(new DOMException('aborted', 'AbortError')),
                    )
                }),
        )
        const result = client()
            .fetchVideo(videoId)
            .catch((e: unknown) => e)
        await advanceTimersAsync(LINK_CONTENT_FETCH.timeoutMs)
        const error = await result
        expect(String(error)).toContain('시간이 초과')
        expect((error as HttpException).getStatus()).toBe(502)
    })
})
