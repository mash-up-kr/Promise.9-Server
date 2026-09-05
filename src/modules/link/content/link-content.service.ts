import { Injectable, Logger } from '@nestjs/common'

import { BaseException } from '../../../common/exception/base.exception'
import { describeError } from '../../../common/exception/error.util'
import { UrlSecurityService } from '../../../common/security/url-security/url-security.service'
import { LINK_ERROR } from '../link-error.constant'

import { LinkContentHtmlFetcher } from './html/link-content-html.fetcher'
import { resolveLinkContentStrategy } from './strategy/link-content-strategy.registry'
import {
    LinkContentOEmbedPreview,
    LinkContentOEmbedStrategy,
    LinkContentTinyFishStrategy,
} from './strategy/link-content-strategy.type'
import { TinyFishFetchClient } from './tinyfish/tinyfish-fetch.client'
import { TinyFishFetchError } from './tinyfish/tinyfish-fetch.error'
import {
    buildLinkContentRequestHeaders,
    LINK_CONTENT_BROWSER_USER_AGENT,
    LINK_CONTENT_FETCH,
    LINK_CONTENT_IMAGE_URL_MAX_LENGTH,
    LINK_CONTENT_TEXT_LIMIT,
} from './link-content.constants'
import { parseLinkInformation, parseLinkPreview } from './link-content.parser'
import {
    CollectedLinkContent,
    LinkImageSource,
    LinkPreview,
} from './link-content.type'
import {
    cancelLinkContentResponse,
    readLinkContentText,
} from './link-content-response.reader'

type LinkContentPurpose = 'preview' | 'analysis'

type ResolvedLinkContent = {
    title: string | null
    description: string | null
    content: string | null
    image: string | null
    imageSource: LinkImageSource | null
    imageBaseUrl: URL
    source: string
    analysisUnavailableReason?: string
}

@Injectable()
export class LinkContentService {
    private readonly logger = new Logger(LinkContentService.name)

    constructor(
        private readonly urlSecurity: UrlSecurityService,
        private readonly htmlFetcher: LinkContentHtmlFetcher,
        private readonly tinyFishFetchClient: TinyFishFetchClient,
    ) {}

    async preview(url: string): Promise<LinkPreview> {
        const resourceUrl = this.urlSecurity.parseHttpUrl(url)
        const resolved = await this.resolveContent(resourceUrl, 'preview')

        if (!resolved) {
            return {
                title: null,
                thumbnailUrl: null,
                source: this.toSource(resourceUrl),
            }
        }

        return {
            title: resolved.title,
            thumbnailUrl: await this.toSafeAbsoluteImage(
                resolved.image,
                resolved.imageBaseUrl,
            ),
            source: resolved.source,
        }
    }

    // null은 정상적으로 수집할 내용이 없거나 robots.txt가 명시적으로 차단한 경우다.
    // 네트워크·타임아웃·원격 5xx는 호출부가 재시도할 수 있도록 예외를 유지한다.
    async collect(url: string): Promise<CollectedLinkContent | null> {
        const resourceUrl = this.urlSecurity.parseHttpUrl(url)
        const resolved = await this.resolveContent(resourceUrl, 'analysis')

        if (!resolved) return null

        const imageUrl = await this.toSafeAbsoluteImage(
            resolved.image,
            resolved.imageBaseUrl,
        )
        const collected: CollectedLinkContent = {
            title: this.limitText(
                resolved.title,
                LINK_CONTENT_TEXT_LIMIT.title,
            ),
            description: this.limitText(
                resolved.description,
                LINK_CONTENT_TEXT_LIMIT.description,
            ),
            content: this.limitText(
                resolved.content,
                LINK_CONTENT_TEXT_LIMIT.content,
            ),
            image:
                imageUrl && resolved.imageSource
                    ? { url: imageUrl, source: resolved.imageSource }
                    : null,
            ...(resolved.analysisUnavailableReason
                ? {
                      analysisUnavailableReason:
                          resolved.analysisUnavailableReason,
                  }
                : {}),
        }

        return collected.analysisUnavailableReason ||
            this.hasCollectedContent(collected)
            ? collected
            : null
    }

    private async resolveContent(
        resourceUrl: URL,
        purpose: LinkContentPurpose,
    ): Promise<ResolvedLinkContent | null> {
        const strategy = resolveLinkContentStrategy(resourceUrl)

        switch (strategy.kind) {
            case 'html':
                return this.resolveHtmlContent(resourceUrl, purpose)
            case 'oembed': {
                const oEmbed = await this.resolveOEmbedContent(
                    resourceUrl,
                    strategy,
                )

                return oEmbed ?? this.resolveHtmlContent(resourceUrl, purpose)
            }
            case 'tinyfish':
                return this.tinyFishFetchClient.isEnabled()
                    ? this.resolveTinyFishContent(
                          resourceUrl,
                          purpose,
                          strategy,
                      )
                    : this.resolveHtmlContent(resourceUrl, purpose)
        }
    }

    private async resolveHtmlContent(
        resourceUrl: URL,
        purpose: LinkContentPurpose,
    ): Promise<ResolvedLinkContent | null> {
        const fetched = await this.htmlFetcher.fetch(resourceUrl, {
            respectRobots: purpose === 'analysis',
        })

        if (!fetched) return null

        const preview = parseLinkPreview(fetched.html)
        const information =
            purpose === 'analysis'
                ? parseLinkInformation(fetched.html)
                : {
                      title: preview.title,
                      description: null,
                      content: null,
                  }

        return {
            ...information,
            image: preview.image,
            imageSource: preview.imageSource,
            imageBaseUrl: fetched.finalUrl,
            source: this.toSource(fetched.finalUrl),
        }
    }

    private async resolveOEmbedContent(
        resourceUrl: URL,
        strategy: LinkContentOEmbedStrategy,
    ): Promise<ResolvedLinkContent | null> {
        const oEmbed = await this.fetchOEmbed(resourceUrl, strategy)

        if (!oEmbed) return null

        return {
            title: oEmbed.title,
            description: null,
            content: null,
            image: oEmbed.image,
            imageSource: oEmbed.image ? 'oembed' : null,
            imageBaseUrl: resourceUrl,
            source: strategy.source ?? this.toSource(resourceUrl),
        }
    }

    private async resolveTinyFishContent(
        resourceUrl: URL,
        purpose: LinkContentPurpose,
        strategy: LinkContentTinyFishStrategy,
    ): Promise<ResolvedLinkContent> {
        try {
            const outcome = await this.tinyFishFetchClient.fetch(
                strategy.prepareUrl(resourceUrl),
            )

            if (outcome.status === 'UNAVAILABLE') {
                return {
                    title: null,
                    description: null,
                    content: null,
                    image: null,
                    imageSource: null,
                    imageBaseUrl: resourceUrl,
                    source: this.toSource(resourceUrl),
                    analysisUnavailableReason: outcome.reason,
                }
            }

            const content = outcome.content.content
            const image = strategy.selectImage(
                resourceUrl,
                outcome.content.imageLinks,
            )

            return {
                title:
                    purpose === 'preview'
                        ? this.limitText(
                              outcome.content.title,
                              LINK_CONTENT_TEXT_LIMIT.title,
                          )
                        : outcome.content.title,
                description: outcome.content.description,
                content,
                image,
                imageSource: image ? 'tinyfish' : null,
                imageBaseUrl: resourceUrl,
                source: this.toSource(resourceUrl),
                ...(purpose === 'analysis' && !content
                    ? {
                          analysisUnavailableReason:
                              'TinyFish에서 분석할 본문을 수집하지 못했습니다.',
                      }
                    : {}),
            }
        } catch (error) {
            if (purpose === 'analysis') throw error

            this.logger.warn(
                `TinyFish 링크 미리보기 수집에 실패했습니다: ${describeError(error)}`,
            )
            throw new BaseException(
                error instanceof TinyFishFetchError && !error.retryable
                    ? LINK_ERROR.PREVIEW_BAD_STATUS
                    : LINK_ERROR.PREVIEW_FETCH_FAILED,
            )
        }
    }

    // 사이트 전략에 oEmbed가 등록돼 있으면 우선 조회하고, 실패하면 HTML 수집을 계속한다.
    private async fetchOEmbed(
        resourceUrl: URL,
        strategy: LinkContentOEmbedStrategy,
    ): Promise<LinkContentOEmbedPreview | null> {
        const endpoint = strategy.oEmbed.buildEndpoint(resourceUrl)
        const controller = new AbortController()
        const timeout = setTimeout(
            () => controller.abort(),
            LINK_CONTENT_FETCH.timeoutMs,
        )

        try {
            await this.urlSecurity.resolvePublicUrl(endpoint)

            const response = await fetch(endpoint, {
                headers: {
                    ...buildLinkContentRequestHeaders(
                        LINK_CONTENT_BROWSER_USER_AGENT,
                    ),
                    Accept: 'application/json',
                },
                redirect: 'manual',
                signal: controller.signal,
            })

            if (!response.ok) {
                cancelLinkContentResponse(response)
                return null
            }

            return strategy.oEmbed.parse(
                JSON.parse(await readLinkContentText(response)) as unknown,
            )
        } catch (error) {
            this.logger.warn(
                `${strategy.name} oEmbed 수집에 실패해 일반 OG로 폴백합니다: ${describeError(error)}`,
            )
            return null
        } finally {
            clearTimeout(timeout)
        }
    }

    private async toSafeAbsoluteImage(
        image: string | null,
        baseUrl: URL,
    ): Promise<string | null> {
        if (!image) return null
        if (image.length > LINK_CONTENT_IMAGE_URL_MAX_LENGTH) return null

        try {
            const imageUrl = this.urlSecurity.parseHttpUrl(image, baseUrl)
            const normalizedUrl = imageUrl.toString()

            if (normalizedUrl.length > LINK_CONTENT_IMAGE_URL_MAX_LENGTH) {
                return null
            }

            await this.urlSecurity.resolvePublicUrl(imageUrl)

            return normalizedUrl
        } catch {
            return null
        }
    }

    private toSource(finalUrl: URL): string {
        return finalUrl.hostname.replace(/^www\./, '')
    }

    private hasCollectedContent(content: CollectedLinkContent): boolean {
        return Boolean(
            content.title ||
            content.description ||
            content.content ||
            content.image,
        )
    }

    private limitText(value: string | null, maxLength: number): string | null {
        return value?.slice(0, maxLength) || null
    }
}
