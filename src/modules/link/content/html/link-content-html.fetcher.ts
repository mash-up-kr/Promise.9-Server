import { HttpException, Injectable, Logger } from '@nestjs/common'

import { BaseException } from '../../../../common/exception/base.exception'
import { UrlSecurityService } from '../../../../common/security/url-security/url-security.service'
import { LINK_ERROR } from '../../link-error.constant'
import {
    buildLinkContentRequestHeaders,
    LINK_CONTENT_FETCH,
    LINK_CONTENT_REDIRECT_STATUSES,
} from '../link-content.constants'
import { FetchedLinkHtml } from '../link-content.type'
import {
    cancelLinkContentResponse,
    readLinkContentText,
} from '../link-content-response.reader'
import { isRobotsPathAllowed } from '../robots.parser'

import { resolveLinkContentHtmlUserAgent } from './link-content-html-request.policy'

type LinkContentHtmlFetchOptions = {
    respectRobots: boolean
}

class RobotsDisallowedError extends Error {}

@Injectable()
export class LinkContentHtmlFetcher {
    private readonly logger = new Logger(LinkContentHtmlFetcher.name)

    constructor(private readonly urlSecurity: UrlSecurityService) {}

    async fetch(
        resourceUrl: URL,
        options: LinkContentHtmlFetchOptions,
    ): Promise<FetchedLinkHtml | null> {
        const controller = new AbortController()
        const timeout = setTimeout(
            () => controller.abort(),
            LINK_CONTENT_FETCH.timeoutMs,
        )

        try {
            return await this.followAndRead(
                resourceUrl,
                options,
                controller.signal,
            )
        } catch (error) {
            if (error instanceof RobotsDisallowedError) return null
            if (error instanceof HttpException) throw error

            if (this.isAbortError(error)) {
                throw new BaseException(LINK_ERROR.PREVIEW_TIMEOUT)
            }

            throw new BaseException(LINK_ERROR.PREVIEW_FETCH_FAILED)
        } finally {
            clearTimeout(timeout)
        }
    }

    private async followAndRead(
        resourceUrl: URL,
        options: LinkContentHtmlFetchOptions,
        signal: AbortSignal,
    ): Promise<FetchedLinkHtml> {
        let currentUrl = new URL(resourceUrl)

        for (
            let redirectCount = 0;
            redirectCount <= LINK_CONTENT_FETCH.maxRedirects;
            redirectCount++
        ) {
            await this.urlSecurity.resolvePublicUrl(currentUrl)

            if (options.respectRobots) {
                await this.assertCrawlingAllowed(currentUrl)
            }

            const response = await fetch(currentUrl, {
                headers: buildLinkContentRequestHeaders(
                    resolveLinkContentHtmlUserAgent(currentUrl),
                ),
                redirect: 'manual',
                signal,
            })

            if (!LINK_CONTENT_REDIRECT_STATUSES.includes(response.status)) {
                return this.readHtml(response, currentUrl)
            }

            cancelLinkContentResponse(response)
            currentUrl = this.getRedirectUrl(response, currentUrl)
        }

        this.logger.warn(
            `링크 미리보기 리다이렉트가 너무 많습니다: ${currentUrl.toString()}`,
        )
        throw new BaseException(LINK_ERROR.PREVIEW_REDIRECT_FAILED)
    }

    private async assertCrawlingAllowed(url: URL): Promise<void> {
        if (!(await this.isCrawlingAllowed(url))) {
            throw new RobotsDisallowedError(
                'robots.txt에서 크롤링을 허용하지 않았습니다.',
            )
        }
    }

    private async isCrawlingAllowed(url: URL): Promise<boolean> {
        const controller = new AbortController()
        const userAgent = resolveLinkContentHtmlUserAgent(url)
        const timeout = setTimeout(
            () => controller.abort(),
            LINK_CONTENT_FETCH.timeoutMs,
        )

        try {
            const robotsUrl = new URL('/robots.txt', url.origin)
            const response = await fetch(robotsUrl, {
                headers: {
                    ...buildLinkContentRequestHeaders(userAgent),
                    Accept: 'text/plain,*/*',
                },
                redirect: 'manual',
                signal: controller.signal,
            })

            if (response.status === 404) {
                cancelLinkContentResponse(response)
                return true
            }

            if (!response.ok) {
                cancelLinkContentResponse(response)

                if (response.status === 429 || response.status >= 500) {
                    throw new BaseException(LINK_ERROR.PREVIEW_FETCH_FAILED)
                }

                return false
            }

            return isRobotsPathAllowed(
                await readLinkContentText(response),
                url.pathname + url.search,
                userAgent,
            )
        } catch (error) {
            if (error instanceof HttpException) throw error

            if (this.isAbortError(error)) {
                throw new BaseException(LINK_ERROR.PREVIEW_TIMEOUT)
            }

            throw new BaseException(LINK_ERROR.PREVIEW_FETCH_FAILED)
        } finally {
            clearTimeout(timeout)
        }
    }

    private async readHtml(
        response: Response,
        finalUrl: URL,
    ): Promise<FetchedLinkHtml> {
        if (!response.ok) {
            cancelLinkContentResponse(response)
            this.logger.warn(
                `링크 미리보기 대상이 비정상 응답을 반환했습니다: ${response.status} ${finalUrl.toString()}`,
            )
            throw new BaseException({
                ...LINK_ERROR.PREVIEW_BAD_STATUS,
                message: `링크 미리보기 대상 페이지가 ${response.status} 상태로 응답했습니다.`,
            })
        }

        return {
            html: await readLinkContentText(response),
            finalUrl,
        }
    }

    private getRedirectUrl(response: Response, baseUrl: URL): URL {
        const location = response.headers.get('location')

        if (!location) {
            throw new BaseException(LINK_ERROR.PREVIEW_REDIRECT_FAILED)
        }

        return this.urlSecurity.parseHttpUrl(location, baseUrl)
    }

    private isAbortError(error: unknown): boolean {
        return error instanceof Error && error.name === 'AbortError'
    }
}
