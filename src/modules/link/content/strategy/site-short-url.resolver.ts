import { HttpException } from '@nestjs/common'

import { BaseException } from '../../../../common/exception/base.exception'
import { UrlSecurityService } from '../../../../common/security/url-security/url-security.service'
import { LINK_ERROR } from '../../link-error.constant'
import {
    buildLinkContentRequestHeaders,
    LINK_CONTENT_BROWSER_USER_AGENT,
    LINK_CONTENT_FETCH,
    LINK_CONTENT_REDIRECT_STATUSES,
} from '../link-content.constants'
import { cancelLinkContentResponse } from '../link-content-response.reader'

const SHORT_URLS = [
    { hostname: 'naver.me', pathname: /^\// },
    { hostname: 'link.coupang.com', pathname: /^\/(?:a\/|re\/AFFSDP)/ },
] as const

export function isSupportedShortUrl(url: URL): boolean {
    return SHORT_URLS.some(
        (shortUrl) =>
            url.hostname === shortUrl.hostname &&
            shortUrl.pathname.test(url.pathname),
    )
}

// 지원 사이트의 단축 URL만 해석하고 최종 URL로 수집 전략을 다시 결정한다.
export async function resolveSiteShortUrl(
    url: URL,
    security: UrlSecurityService,
): Promise<URL> {
    const controller = new AbortController()
    const timer = setTimeout(
        () => controller.abort(),
        LINK_CONTENT_FETCH.timeoutMs,
    )
    try {
        let current = url
        for (let count = 0; count <= LINK_CONTENT_FETCH.maxRedirects; count++) {
            await security.resolvePublicUrl(current)
            if (!isSupportedShortUrl(current)) return current
            const response = await fetch(current, {
                headers: buildLinkContentRequestHeaders(
                    LINK_CONTENT_BROWSER_USER_AGENT,
                ),
                redirect: 'manual',
                signal: controller.signal,
            })
            cancelLinkContentResponse(response)
            if (!LINK_CONTENT_REDIRECT_STATUSES.includes(response.status)) {
                if (!response.ok)
                    throw new BaseException(LINK_ERROR.PREVIEW_BAD_STATUS)
                return current
            }
            const location = response.headers.get('location')
            if (!location)
                throw new BaseException(LINK_ERROR.PREVIEW_REDIRECT_FAILED)
            current = security.parseHttpUrl(location, current)
        }
        throw new BaseException(LINK_ERROR.PREVIEW_REDIRECT_FAILED)
    } catch (error) {
        if (error instanceof HttpException) throw error
        throw new BaseException(
            controller.signal.aborted
                ? LINK_ERROR.PREVIEW_TIMEOUT
                : LINK_ERROR.PREVIEW_FETCH_FAILED,
        )
    } finally {
        clearTimeout(timer)
    }
}
