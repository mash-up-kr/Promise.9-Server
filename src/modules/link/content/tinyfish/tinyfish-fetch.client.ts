import { Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'

import { ValidatedEnvironment } from '../../../../config/environment'

import { TinyFishFetchError } from './tinyfish-fetch.error'
import {
    parseTinyFishResponse,
    TinyFishResponseOutcome,
} from './tinyfish-response.parser'

const TINYFISH_FETCH_ENDPOINT = 'https://api.fetch.tinyfish.ai'
// 공식 대기 시간은 Retry-After를 따른다. 헤더가 없거나 잘못된 경우의 운영 기본값이다.
const TINYFISH_DEFAULT_COOLDOWN_MS = 60_000
const TINYFISH_URL_TIMEOUT_MS = 20_000
const TINYFISH_REQUEST_TIMEOUT_MS = 25_000
const TINYFISH_RESPONSE_MAX_BYTES = 2 * 1024 * 1024

export type TinyFishFetchOptions = {
    includeSelectors?: readonly string[]
    excludeSelectors?: readonly string[]
}

type TinyFishKeyState = {
    apiKey: string
    configIndex: number
    cooldownUntil: number
}

@Injectable()
export class TinyFishFetchClient {
    // 단일 프로세스에서 공유한다. 여러 프로세스에서는 순번과 cooldown이 공유되지 않는다.
    private readonly keys: TinyFishKeyState[]
    private nextKeyIndex = 0

    constructor(config: ConfigService<ValidatedEnvironment, true>) {
        const configuredKeys =
            config.get('TINY_FISH_API_KEYS', { infer: true }) ??
            config.get('TINY_FISH_API_KEY', { infer: true })
        const keys = new Map<string, TinyFishKeyState>()
        for (const [index, value] of (
            configuredKeys?.split(',') ?? []
        ).entries()) {
            const apiKey = value.trim()
            if (!apiKey || keys.has(apiKey)) continue

            // 중복 제거 후에도 환경변수 목록의 원래 위치(1부터)를 로그에서 찾을 수 있다.
            keys.set(apiKey, {
                apiKey,
                configIndex: index + 1,
                cooldownUntil: 0,
            })
        }
        this.keys = [...keys.values()]
    }

    isEnabled(): boolean {
        return this.keys.length > 0
    }

    // 첫 await 전에 순번을 이동해 동시 호출도 분산한다. 같은 URL은 키마다 한 번만 시도한다.
    private selectKey(attempted: Set<TinyFishKeyState>): TinyFishKeyState {
        const now = Date.now()

        for (let offset = 0; offset < this.keys.length; offset += 1) {
            const index = (this.nextKeyIndex + offset) % this.keys.length
            const key = this.keys[index]

            if (key.cooldownUntil > now || attempted.has(key)) continue

            this.nextKeyIndex = (index + 1) % this.keys.length
            attempted.add(key)
            return key
        }

        // 미리보기는 기존 오류로 반환하고 분석은 dispatcher의 SQS 재시도를 따른다.
        throw new TinyFishFetchError({
            message:
                'TinyFish에서 현재 요청에 사용할 수 있는 API 키가 없습니다.',
            retryable: true,
        })
    }

    async fetch(
        resourceUrl: URL,
        options?: TinyFishFetchOptions,
    ): Promise<TinyFishResponseOutcome> {
        if (!this.isEnabled()) {
            throw new TinyFishFetchError({
                message: 'TinyFish Fetch가 비활성화됐습니다.',
                retryable: false,
            })
        }

        const targetUrl = sanitizeTinyFishUrl(resourceUrl)
        const attempted = new Set<TinyFishKeyState>()
        const controller = new AbortController()
        const timeout = setTimeout(
            () => controller.abort(),
            TINYFISH_REQUEST_TIMEOUT_MS,
        )

        try {
            // 키 전환을 포함한 전체 요청에 기존 25초 timeout을 적용한다.
            while (true) {
                controller.signal.throwIfAborted()
                const key = this.selectKey(attempted)
                const response = await fetch(TINYFISH_FETCH_ENDPOINT, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'X-API-Key': key.apiKey,
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

                if (response.status === 429) {
                    // body 정리를 기다리기 전에 다른 호출에서도 이 키를 제외한다.
                    key.cooldownUntil = Math.max(
                        key.cooldownUntil,
                        Date.now() +
                            resolveCooldownMs(
                                response.headers.get('retry-after'),
                            ),
                    )
                    await cancelResponseBody(response)
                    continue
                }

                if (!response.ok) {
                    await cancelResponseBody(response)
                    throw new TinyFishFetchError({
                        // 호출부의 기존 오류 로그로 남기며, API 응답은 공통 예외로 변환한다.
                        message:
                            response.status === 401
                                ? `TinyFish Fetch API 키 인증에 실패했습니다. status=401, keyIndex=${key.configIndex}`
                                : `TinyFish Fetch가 ${response.status} 상태로 응답했습니다.`,
                        retryable: response.status >= 500,
                    })
                }

                return parseTinyFishResponse(
                    JSON.parse(
                        await readLimitedResponseText(response),
                    ) as unknown,
                )
            }
        } catch (error) {
            if (error instanceof TinyFishFetchError) throw error

            throw new TinyFishFetchError({
                message:
                    controller.signal.aborted ||
                    (error instanceof Error && error.name === 'AbortError')
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

function resolveCooldownMs(retryAfter: string | null): number {
    // TinyFish 공식 오류 문서의 Retry-After는 초 단위다.
    if (retryAfter !== null && /^\d+$/.test(retryAfter.trim())) {
        const delay = Number(retryAfter) * 1000
        if (Number.isSafeInteger(delay)) return delay
    }

    return TINYFISH_DEFAULT_COOLDOWN_MS
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
