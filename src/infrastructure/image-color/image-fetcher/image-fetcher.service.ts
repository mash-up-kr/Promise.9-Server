import http, { type IncomingHttpHeaders, type IncomingMessage } from 'node:http'
import https, { type RequestOptions } from 'node:https'
import { isIP } from 'node:net'
import { Readable } from 'node:stream'

import {
    BadGatewayException,
    BadRequestException,
    GatewayTimeoutException,
    HttpException,
    Injectable,
} from '@nestjs/common'

import { UrlSecurityService } from '../../url-security/url-security.service'

import {
    DEFAULT_IMAGE_FETCH_OPTIONS,
    IMAGE_REDIRECT_STATUSES,
    MAX_IMAGE_FETCH_OPTIONS,
} from './image-fetcher.constants'
import {
    FetchedImage,
    ImageFetchOptions,
    ResolvedImageFetchOptions,
} from './image-fetcher.type'
import { ImageResponseReader } from './image-response.reader'

type ImageFetchTimeout = {
    promise: Promise<never>
    timeout: ReturnType<typeof setTimeout>
}

@Injectable()
export class ImageFetcherService {
    constructor(
        private readonly urlSecurity: UrlSecurityService,
        private readonly responseReader: ImageResponseReader,
    ) {}

    async fetch(
        imageUrl: string,
        options: ImageFetchOptions = {},
    ): Promise<FetchedImage> {
        const resolvedOptions = this.resolveOptions(options)
        const controller = new AbortController()
        const timeoutError = new GatewayTimeoutException(
            '이미지 요청 시간이 초과되었습니다.',
        )
        const imageFetchTimeout = this.createTimeout(
            resolvedOptions.timeoutMs,
            controller,
            timeoutError,
        )

        try {
            return await Promise.race([
                this.fetchWithSignal(
                    imageUrl,
                    resolvedOptions,
                    controller.signal,
                ),
                imageFetchTimeout.promise,
            ])
        } catch (error) {
            if (error instanceof HttpException) {
                throw error
            }

            if (this.isAbortError(error)) {
                throw timeoutError
            }

            throw new BadGatewayException('이미지 URL 요청에 실패했습니다.')
        } finally {
            clearTimeout(imageFetchTimeout.timeout)
        }
    }

    private async fetchWithSignal(
        imageUrl: string,
        options: ResolvedImageFetchOptions,
        signal: AbortSignal,
    ): Promise<FetchedImage> {
        const initialUrl = this.urlSecurity.parseHttpUrl(imageUrl)
        const { response, finalUrl } = await this.fetchResponse(
            initialUrl,
            options,
            signal,
        )

        if (!response.ok) {
            this.cancelResponseBody(response)
            throw new BadGatewayException(
                `이미지 요청에 실패했습니다. status=${response.status}`,
            )
        }

        const { contentType, buffer } = await this.responseReader.read(
            response,
            options.maxBytes,
            signal,
        )

        return {
            sourceUrl: finalUrl.toString(),
            contentType,
            byteLength: buffer.byteLength,
            buffer,
        }
    }

    private async fetchResponse(
        initialUrl: URL,
        options: ResolvedImageFetchOptions,
        signal: AbortSignal,
    ): Promise<{ response: Response; finalUrl: URL }> {
        let currentUrl = initialUrl

        for (
            let redirectCount = 0;
            redirectCount <= options.maxRedirects;
            redirectCount++
        ) {
            // 리다이렉트 대상도 사용자 입력 URL과 같은 보안 기준으로 다시 검증한다.
            const { address } =
                await this.urlSecurity.resolvePublicUrl(currentUrl)

            const response = await this.request(currentUrl, address, signal)

            if (!IMAGE_REDIRECT_STATUSES.includes(response.status)) {
                return { response, finalUrl: currentUrl }
            }

            try {
                if (redirectCount === options.maxRedirects) {
                    throw new BadGatewayException(
                        '이미지 URL 리다이렉트 횟수가 너무 많습니다.',
                    )
                }

                currentUrl = this.getRedirectUrl(response, currentUrl)
            } finally {
                this.cancelResponseBody(response)
            }
        }

        throw new BadGatewayException(
            '이미지 URL 리다이렉트 처리에 실패했습니다.',
        )
    }

    private request(
        url: URL,
        address: string,
        signal: AbortSignal,
    ): Promise<Response> {
        const transport = url.protocol === 'https:' ? https : http
        const requestOptions = this.createRequestOptions(url, address, signal)

        return new Promise((resolve, reject) => {
            const request = transport.request(requestOptions, (response) => {
                resolve(this.toFetchResponse(response))
            })

            request.on('error', reject)
            request.end()
        })
    }

    private createRequestOptions(
        url: URL,
        address: string,
        signal: AbortSignal,
    ): RequestOptions {
        const defaultPort = url.protocol === 'https:' ? 443 : 80
        const port = url.port ? Number(url.port) : defaultPort

        // 검증된 IP로 직접 연결하되, 가상 호스트와 TLS 검증은 원래 호스트 기준으로 유지한다.
        return {
            hostname: address,
            port,
            path: `${url.pathname}${url.search}`,
            method: 'GET',
            headers: {
                Host: url.host,
            },
            servername: this.getServername(url),
            signal,
        }
    }

    private getServername(url: URL): string | undefined {
        const hostname = url.hostname.replace(/^\[(.*)]$/, '$1')

        return isIP(hostname) ? undefined : hostname
    }

    private toFetchResponse(response: IncomingMessage): Response {
        return new Response(Readable.toWeb(response) as ReadableStream, {
            status: response.statusCode,
            statusText: response.statusMessage,
            headers: this.toHeaders(response.headers),
        })
    }

    private toHeaders(headers: IncomingHttpHeaders): Headers {
        const responseHeaders = new Headers()

        for (const [name, value] of Object.entries(headers)) {
            if (Array.isArray(value)) {
                for (const item of value) {
                    responseHeaders.append(name, item)
                }

                continue
            }

            if (value !== undefined) {
                responseHeaders.set(name, String(value))
            }
        }

        return responseHeaders
    }

    private getRedirectUrl(response: Response, baseUrl: URL): URL {
        const location = response.headers.get('location')

        if (!location) {
            throw new BadGatewayException(
                '이미지 URL 리다이렉트 위치가 없습니다.',
            )
        }

        return this.urlSecurity.parseHttpUrl(location, baseUrl)
    }

    private cancelResponseBody(response: Response) {
        if (response.body) {
            void response.body.cancel().catch(() => undefined)
        }
    }

    private resolveOptions(
        options: ImageFetchOptions,
    ): ResolvedImageFetchOptions {
        const mergedOptions = {
            ...DEFAULT_IMAGE_FETCH_OPTIONS,
            ...options,
        }

        return {
            timeoutMs: this.resolveIntegerOption(
                mergedOptions.timeoutMs,
                'timeoutMs',
                1,
                MAX_IMAGE_FETCH_OPTIONS.timeoutMs,
            ),
            maxBytes: this.resolveIntegerOption(
                mergedOptions.maxBytes,
                'maxBytes',
                1,
                MAX_IMAGE_FETCH_OPTIONS.maxBytes,
            ),
            maxRedirects: this.resolveIntegerOption(
                mergedOptions.maxRedirects,
                'maxRedirects',
                0,
                MAX_IMAGE_FETCH_OPTIONS.maxRedirects,
            ),
        }
    }

    private resolveIntegerOption(
        value: unknown,
        optionName: string,
        minValue: number,
        maxValue: number,
    ): number {
        if (
            typeof value !== 'number' ||
            !Number.isSafeInteger(value) ||
            value < minValue
        ) {
            const message =
                minValue === 1
                    ? `${optionName} 옵션은 양의 정수여야 합니다.`
                    : `${optionName} 옵션은 ${minValue} 이상의 정수여야 합니다.`

            throw new BadRequestException(message)
        }

        if (value > maxValue) {
            throw new BadRequestException(
                `${optionName} 옵션은 ${maxValue} 이하여야 합니다.`,
            )
        }

        return value
    }

    private createTimeout(
        timeoutMs: number,
        controller: AbortController,
        timeoutError: GatewayTimeoutException,
    ): ImageFetchTimeout {
        let rejectTimeout!: (error: GatewayTimeoutException) => void
        const promise = new Promise<never>((_, reject) => {
            rejectTimeout = reject
        })
        const timeout = setTimeout(() => {
            controller.abort(timeoutError)
            rejectTimeout(timeoutError)
        }, timeoutMs)

        return { promise, timeout }
    }

    private isAbortError(error: unknown): boolean {
        return error instanceof Error && error.name === 'AbortError'
    }
}
