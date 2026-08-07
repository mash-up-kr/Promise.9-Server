import { HttpException, Injectable, Logger } from '@nestjs/common'

import { BaseException } from '../../../common/exception/base.exception'
import { UrlSecurityService } from '../../../common/security/url-security/url-security.service'
import { LINK_ERROR } from '../link-error.constant'

import {
    LINK_CONTENT_FETCH,
    LINK_CONTENT_REDIRECT_STATUSES,
    LINK_CONTENT_REQUEST_HEADERS,
    LINK_CONTENT_TEXT_LIMIT,
    LINK_CONTENT_USER_AGENT,
} from './link-content.constants'
import { parseLinkInformation, parseLinkPreview } from './link-content.parser'
import {
    CollectedLinkContent,
    FetchedLinkHtml,
    FetchLinkHtmlOptions,
    LinkPreview,
} from './link-content.type'
import { isRobotsPathAllowed } from './robots.parser'
import { resolveSiteRule } from './site-rules'

@Injectable()
export class LinkContentService {
    private readonly logger = new Logger(LinkContentService.name)

    constructor(private readonly urlSecurity: UrlSecurityService) {}

    // 저장 전 화면에 사용할 링크 제목, 대표 이미지, 출처를 수집한다.
    // 도메인별 특수 규칙(site rule)이 있으면 URL 변형·결과 후처리·완전 대체를 적용한다.
    async preview(url: string): Promise<LinkPreview> {
        const parsed = this.urlSecurity.parseHttpUrl(url)
        const rule = resolveSiteRule(parsed)

        // 파이프라인을 통째로 대체하는 규칙이면 그 결과를 그대로 쓴다 (예: API 호출형).
        if (rule?.fetchPreview) {
            return rule.fetchPreview(parsed)
        }

        // fetch 전 URL 변형(예: PC→모바일). 없으면 원본 그대로 요청한다.
        const target = rule?.rewriteUrl?.(parsed) ?? parsed
        let fetched = await this.fetchHtml(target.toString())

        // 단축링크(예: naver.me)는 최초 URL엔 규칙이 안 걸리고 리다이렉트로 도착한
        // 최종 URL(map.naver.com/.../place/{id})에 걸린다. 최종 URL에도 rewrite 규칙을
        // 한 번 더 적용해 재요청한다. (naver.me → map.naver.com/place → m.place)
        let activeRule = rule
        const finalRule = resolveSiteRule(fetched.finalUrl)
        const rewrittenFinal = finalRule?.rewriteUrl?.(fetched.finalUrl)
        if (
            rewrittenFinal &&
            rewrittenFinal.toString() !== fetched.finalUrl.toString()
        ) {
            fetched = await this.fetchHtml(rewrittenFinal.toString())
            activeRule = finalRule
        }

        const { title, image } = parseLinkPreview(fetched.html)
        const preview: LinkPreview = {
            title,
            thumbnailUrl: this.toAbsoluteImage(image, fetched.finalUrl),
            source: this.toSource(fetched.finalUrl),
        }

        // 파싱 결과 후처리(예: 제네릭 og 무효화). 없으면 그대로 반환한다.
        return (
            activeRule?.transformPreview?.(preview, fetched.finalUrl) ?? preview
        )
    }

    // robots.txt가 허용한 링크에서 요약과 태그 생성에 필요한 정보를 수집한다.
    async collect(url: string): Promise<CollectedLinkContent | null> {
        try {
            const { html } = await this.fetchHtml(url, {
                beforeRequest: this.validateCrawlingAllowed,
            })
            const information = parseLinkInformation(html)
            const collected = {
                title: this.limitText(
                    information.title,
                    LINK_CONTENT_TEXT_LIMIT.title,
                ),
                description: this.limitText(
                    information.description,
                    LINK_CONTENT_TEXT_LIMIT.description,
                ),
                content: this.limitText(
                    information.content,
                    LINK_CONTENT_TEXT_LIMIT.content,
                ),
            }

            return this.hasCollectedContent(collected) ? collected : null
        } catch {
            return null
        }
    }

    private readonly validateCrawlingAllowed = async (
        requestUrl: URL,
    ): Promise<void> => {
        if (!(await this.isCrawlingAllowed(requestUrl))) {
            throw new Error('robots.txt에서 크롤링을 허용하지 않았습니다.')
        }
    }

    // 사용자 URL의 HTML을 SSRF 방어와 함께 받아온다 (타임아웃·리다이렉트·용량 제한).
    private async fetchHtml(
        rawUrl: string,
        options: FetchLinkHtmlOptions = {},
    ): Promise<FetchedLinkHtml> {
        const controller = new AbortController()
        const timeout = setTimeout(
            () => controller.abort(),
            LINK_CONTENT_FETCH.timeoutMs,
        )

        try {
            return await this.followAndRead(rawUrl, controller.signal, options)
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

    // 페이지 요청과 같은 UA로 robots.txt를 확인하며, 확인 실패 시 보수적으로 차단한다.
    private async isCrawlingAllowed(url: URL): Promise<boolean> {
        const controller = new AbortController()
        const timeout = setTimeout(
            () => controller.abort(),
            LINK_CONTENT_FETCH.timeoutMs,
        )

        try {
            const robotsUrl = new URL('/robots.txt', url.origin)
            const response = await fetch(robotsUrl, {
                headers: {
                    ...LINK_CONTENT_REQUEST_HEADERS,
                    Accept: 'text/plain,*/*',
                },
                redirect: 'manual',
                signal: controller.signal,
            })

            if (response.status === 404) {
                this.cancelBody(response)
                return true
            }

            if (!response.ok) {
                this.cancelBody(response)
                return false
            }

            return isRobotsPathAllowed(
                await this.readLimitedText(response),
                url.pathname + url.search,
                LINK_CONTENT_USER_AGENT,
            )
        } catch {
            return false
        } finally {
            clearTimeout(timeout)
        }
    }

    // 대표 이미지 상대 경로를 최종 링크 URL 기준의 절대 경로로 변환한다.
    private toAbsoluteImage(image: string | null, baseUrl: URL): string | null {
        if (!image) return null

        try {
            return new URL(image, baseUrl).toString()
        } catch {
            return null
        }
    }

    // 최종 URL의 호스트에서 표시용 도메인(선행 www. 제거)을 만든다.
    private toSource(finalUrl: URL): string {
        return finalUrl.hostname.replace(/^www\./, '')
    }

    // 제목, 설명, 본문 중 하나라도 수집됐는지 확인한다.
    private hasCollectedContent(content: CollectedLinkContent): boolean {
        return Boolean(content.title || content.description || content.content)
    }

    // HTML에서 수집한 문자열을 저장·AI 입력에 허용된 길이까지만 유지한다.
    private limitText(value: string | null, maxLength: number): string | null {
        return value?.slice(0, maxLength) || null
    }

    // 네트워크 예외가 AbortController의 타임아웃 취소인지 구분한다.
    private isAbortError(error: unknown): boolean {
        return error instanceof Error && error.name === 'AbortError'
    }

    // 리다이렉트의 각 URL을 다시 검증하고 최종 HTML 응답을 읽는다.
    private async followAndRead(
        rawUrl: string,
        signal: AbortSignal,
        options: FetchLinkHtmlOptions,
    ): Promise<FetchedLinkHtml> {
        let currentUrl = this.urlSecurity.parseHttpUrl(rawUrl)

        for (
            let redirectCount = 0;
            redirectCount <= LINK_CONTENT_FETCH.maxRedirects;
            redirectCount++
        ) {
            // 리다이렉트 대상도 매 홉마다 같은 SSRF 기준으로 다시 검증한다.
            await this.urlSecurity.resolvePublicUrl(currentUrl)
            await options.beforeRequest?.(currentUrl)

            const response = await fetch(currentUrl, {
                headers: LINK_CONTENT_REQUEST_HEADERS,
                redirect: 'manual',
                signal,
            })

            if (!LINK_CONTENT_REDIRECT_STATUSES.includes(response.status)) {
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
    ): Promise<FetchedLinkHtml> {
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

                if (receivedBytes >= LINK_CONTENT_FETCH.maxBytes) {
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
