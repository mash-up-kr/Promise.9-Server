import { Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'

import { ValidatedEnvironment } from '../../../../config/environment'

import { TinyFishFetchError } from './tinyfish-fetch.error'
import {
    parseTinyFishResponse,
    TinyFishResponseOutcome,
} from './tinyfish-response.parser'

const TINYFISH_FETCH_ENDPOINT = 'https://api.fetch.tinyfish.ai'
const TINYFISH_URL_TIMEOUT_MS = 20_000
const TINYFISH_REQUEST_TIMEOUT_MS = 25_000
const TINYFISH_RESPONSE_MAX_BYTES = 2 * 1024 * 1024

@Injectable()
export class TinyFishFetchClient {
    private readonly apiKey: string | undefined

    constructor(config: ConfigService<ValidatedEnvironment, true>) {
        this.apiKey = config.get('TINY_FISH_API_KEY', { infer: true })
    }

    isEnabled(): boolean {
        return Boolean(this.apiKey)
    }

    async fetch(resourceUrl: URL): Promise<TinyFishResponseOutcome> {
        if (!this.apiKey) {
            throw new TinyFishFetchError({
                message: 'TinyFish Fetch가 비활성화됐습니다.',
                retryable: false,
            })
        }

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
