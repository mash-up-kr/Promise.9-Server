import { HttpException, Injectable, Logger } from '@nestjs/common'

import { BaseException } from '../../../common/exception/base.exception'
import { UrlSecurityService } from '../../../common/security/url-security/url-security.service'
import { LINK_ERROR } from '../link-error.constant'

import {
    OG_PREVIEW_BROWSER_HEADERS,
    OG_PREVIEW_FETCH,
    OG_PREVIEW_REDIRECT_STATUSES,
} from './og.constants'

export interface FetchedHtml {
    html: string
    finalUrl: URL
}

@Injectable()
export class OgFetcherService {
    private readonly logger = new Logger(OgFetcherService.name)

    constructor(private readonly urlSecurity: UrlSecurityService) {}

    // 사용자 URL의 HTML을 SSRF 방어와 함께 받아온다 (타임아웃·리다이렉트·용량 제한).
    async fetchHtml(rawUrl: string): Promise<FetchedHtml> {
        const controller = new AbortController()
        const timeout = setTimeout(
            () => controller.abort(),
            OG_PREVIEW_FETCH.timeoutMs,
        )

        try {
            return await this.followAndRead(rawUrl, controller.signal)
        } catch (error) {
            // URL 검증 실패(400)·비정상 응답(502) 등 이미 구분된 HTTP 예외는 그대로 전달한다.
            if (error instanceof HttpException) {
                throw error
            }

            // 타임아웃(abort)과 그 외 네트워크 오류를 구분해 원인을 드러낸다.
            if (this.isAbortError(error)) {
                throw new BaseException(LINK_ERROR.PREVIEW_TIMEOUT)
            }

            throw new BaseException(LINK_ERROR.PREVIEW_FETCH_FAILED)
        } finally {
            clearTimeout(timeout)
        }
    }

    private isAbortError(error: unknown): boolean {
        return error instanceof Error && error.name === 'AbortError'
    }

    private async followAndRead(
        rawUrl: string,
        signal: AbortSignal,
    ): Promise<FetchedHtml> {
        let currentUrl = this.urlSecurity.parseHttpUrl(rawUrl)

        for (
            let redirectCount = 0;
            redirectCount <= OG_PREVIEW_FETCH.maxRedirects;
            redirectCount++
        ) {
            // 리다이렉트 대상도 매 홉마다 같은 SSRF 기준으로 다시 검증한다.
            await this.urlSecurity.resolvePublicUrl(currentUrl)

            const response = await fetch(currentUrl, {
                headers: OG_PREVIEW_BROWSER_HEADERS,
                redirect: 'manual',
                signal,
            })

            if (!OG_PREVIEW_REDIRECT_STATUSES.includes(response.status)) {
                return this.readHtml(response, currentUrl)
            }

            this.cancelBody(response)
            currentUrl = this.getRedirectUrl(response, currentUrl)
        }

        // maxRedirects를 초과할 때까지 최종 페이지에 도달하지 못한 경우
        this.logger.warn(
            `링크 미리보기 리다이렉트가 너무 많습니다: ${currentUrl.toString()}`,
        )
        throw new BaseException(LINK_ERROR.PREVIEW_REDIRECT_FAILED)
    }

    private async readHtml(
        response: Response,
        finalUrl: URL,
    ): Promise<FetchedHtml> {
        if (!response.ok) {
            this.cancelBody(response)
            // 원문 서버가 2xx가 아닌 상태(봇 차단 403·404·5xx 등)를 응답한 경우.
            // 실제 상태 코드를 로그와 응답 message 양쪽에 남겨 원인을 드러낸다.
            this.logger.warn(
                `링크 미리보기 대상이 비정상 응답을 반환했습니다: ${response.status} ${finalUrl.toString()}`,
            )
            throw new BaseException({
                ...LINK_ERROR.PREVIEW_BAD_STATUS,
                message: `링크 미리보기 대상 페이지가 ${response.status} 상태로 응답했습니다.`,
            })
        }

        const html = await this.readLimitedText(response)

        return { html, finalUrl }
    }

    private getRedirectUrl(response: Response, baseUrl: URL): URL {
        const location = response.headers.get('location')

        if (!location) {
            throw new BaseException(LINK_ERROR.PREVIEW_REDIRECT_FAILED)
        }

        return this.urlSecurity.parseHttpUrl(location, baseUrl)
    }

    // 본문을 maxBytes까지만 읽어 초대형 문서로 메모리가 터지는 것을 막는다.
    private async readLimitedText(response: Response): Promise<string> {
        if (!response.body) {
            return ''
        }

        const reader = response.body.getReader()
        const chunks: Uint8Array[] = []
        let receivedBytes = 0

        try {
            while (true) {
                const { done, value } = await reader.read()

                if (done) break
                if (!value) continue

                receivedBytes += value.byteLength
                chunks.push(value)

                if (receivedBytes >= OG_PREVIEW_FETCH.maxBytes) {
                    await reader.cancel()
                    break
                }
            }
        } finally {
            reader.releaseLock()
        }

        return this.decodeBody(
            Buffer.concat(chunks),
            response.headers.get('content-type'),
        )
    }

    // Content-Type의 charset을 존중해 디코딩한다 (EUC-KR 등). 실패 시 utf-8 폴백.
    private decodeBody(buffer: Buffer, contentType: string | null): string {
        const charset = contentType
            ? /charset=([^;]+)/i.exec(contentType)?.[1]?.trim().toLowerCase()
            : undefined

        try {
            return new TextDecoder(charset || 'utf-8').decode(buffer)
        } catch {
            return buffer.toString('utf8')
        }
    }

    private cancelBody(response: Response) {
        void response.body?.cancel().catch(() => undefined)
    }
}
