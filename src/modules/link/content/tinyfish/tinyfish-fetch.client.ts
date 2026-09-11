import { Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'

import { ValidatedEnvironment } from '../../../../config/environment'

import { TinyFishFetchError } from './tinyfish-fetch.error'
import {
    parseTinyFishResponse,
    TinyFishResponseOutcome,
} from './tinyfish-response.parser'

const TINYFISH_FETCH_ENDPOINT = 'https://api.fetch.tinyfish.ai'
// TinyFish 계정 기본 상한은 분당 150 URL이고 초과하면 HTTP 429다. 상한에 바로 붙으면
// 사용자 요청까지 함께 429를 받으므로, 여유 15를 남긴 135에서 우리가 먼저 차단한다.
// 키 단위 상한이라 이 클라이언트(= 키 하나)의 호출을 전부 한 창에서 센다.
const TINYFISH_RATE_LIMIT_PER_MINUTE = 135
const TINYFISH_RATE_WINDOW_MS = 60_000
const TINYFISH_URL_TIMEOUT_MS = 20_000
const TINYFISH_REQUEST_TIMEOUT_MS = 25_000
const TINYFISH_RESPONSE_MAX_BYTES = 2 * 1024 * 1024

export type TinyFishFetchOptions = {
    includeSelectors?: readonly string[]
    excludeSelectors?: readonly string[]
}

@Injectable()
export class TinyFishFetchClient {
    private readonly apiKey: string | undefined
    // ponytail: 프로세스 메모리의 고정 창 카운터. 단일 인스턴스 기준이라 인스턴스를 늘리면
    // 인스턴스 수만큼 상한이 곱해진다. 그때는 Redis나 DB 테이블로 키 단위 창을 공유한다.
    private rateWindowStartedAt = 0
    private rateWindowCount = 0

    constructor(config: ConfigService<ValidatedEnvironment, true>) {
        this.apiKey = config.get('TINY_FISH_API_KEY', { infer: true })
    }

    isEnabled(): boolean {
        return Boolean(this.apiKey)
    }

    // 분당 예산을 한 칸 쓴다. 남아 있지 않으면 요청을 보내지 않고 재시도 가능한 오류를 던진다.
    // 배경 갱신은 dispatcher가 재시도하고, 사용자 요청은 그대로 실패를 전달받는다.
    private consumeRateBudget(): void {
        const now = Date.now()

        if (now - this.rateWindowStartedAt >= TINYFISH_RATE_WINDOW_MS) {
            this.rateWindowStartedAt = now
            this.rateWindowCount = 0
        }

        if (this.rateWindowCount >= TINYFISH_RATE_LIMIT_PER_MINUTE) {
            throw new TinyFishFetchError({
                message: `TinyFish 분당 호출 상한(${TINYFISH_RATE_LIMIT_PER_MINUTE})에 도달해 요청을 보내지 않았습니다.`,
                retryable: true,
            })
        }

        this.rateWindowCount += 1
    }

    async fetch(
        resourceUrl: URL,
        options?: TinyFishFetchOptions,
    ): Promise<TinyFishResponseOutcome> {
        if (!this.apiKey) {
            throw new TinyFishFetchError({
                message: 'TinyFish Fetch가 비활성화됐습니다.',
                retryable: false,
            })
        }

        this.consumeRateBudget()

        const targetUrl = sanitizeTinyFishUrl(resourceUrl)
        const controller = new AbortController()
        const timeout = setTimeout(
            () => controller.abort(),
            TINYFISH_REQUEST_TIMEOUT_MS,
        )

        try {
            const response = await fetch(TINYFISH_FETCH_ENDPOINT, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-API-Key': this.apiKey,
                },
                body: JSON.stringify({
                    urls: [targetUrl.toString()],
                    ...(options?.includeSelectors
                        ? { include_selectors: options.includeSelectors }
                        : {}),
                    ...(options?.excludeSelectors
                        ? { exclude_selectors: options.excludeSelectors }
                        : {}),
                    format: 'markdown',
                    links: false,
                    image_links: true,
                    ttl: 3600,
                    per_url_timeout_ms: TINYFISH_URL_TIMEOUT_MS,
                }),
                signal: controller.signal,
            })

            if (!response.ok) {
                await cancelResponseBody(response)
                throw new TinyFishFetchError({
                    message: `TinyFish Fetch가 ${response.status} 상태로 응답했습니다.`,
                    retryable:
                        response.status === 429 || response.status >= 500,
                })
            }

            return parseTinyFishResponse(
                JSON.parse(await readLimitedResponseText(response)) as unknown,
            )
        } catch (error) {
            if (error instanceof TinyFishFetchError) throw error

            throw new TinyFishFetchError({
                message:
                    error instanceof Error && error.name === 'AbortError'
                        ? 'TinyFish Fetch 요청 시간이 초과됐습니다.'
                        : 'TinyFish Fetch 요청에 실패했습니다.',
                retryable: true,
                cause: error,
            })
        } finally {
            clearTimeout(timeout)
        }
    }
}

export function sanitizeTinyFishUrl(url: URL): URL {
    const sanitized = new URL(url)
    sanitized.username = ''
    sanitized.password = ''
    sanitized.hash = ''
    return sanitized
}

async function readLimitedResponseText(response: Response): Promise<string> {
    const contentLength = Number(response.headers.get('content-length'))

    if (
        Number.isFinite(contentLength) &&
        contentLength > TINYFISH_RESPONSE_MAX_BYTES
    ) {
        await cancelResponseBody(response)
        throw responseTooLargeError()
    }

    if (!response.body) return ''

    const reader = response.body.getReader()
    const chunks: Uint8Array[] = []
    let receivedBytes = 0

    try {
        while (true) {
            const { done, value } = await reader.read()

            if (done) break
            if (!value) continue

            receivedBytes += value.byteLength

            if (receivedBytes > TINYFISH_RESPONSE_MAX_BYTES) {
                await reader.cancel().catch(() => undefined)
                throw responseTooLargeError()
            }

            chunks.push(value)
        }
    } finally {
        reader.releaseLock()
    }

    return Buffer.concat(chunks, receivedBytes).toString('utf8')
}

function responseTooLargeError(): TinyFishFetchError {
    return new TinyFishFetchError({
        message: 'TinyFish 응답이 허용 크기를 초과했습니다.',
        retryable: false,
    })
}

async function cancelResponseBody(response: Response): Promise<void> {
    try {
        await response.body?.cancel()
    } catch {
        // 이미 닫혔거나 다른 reader가 정리 중인 body에는 추가 작업이 필요 없다.
    }
}
