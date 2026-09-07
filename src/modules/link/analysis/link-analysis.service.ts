import { Inject, Injectable } from '@nestjs/common'

import { AiService } from '../../ai/ai.service'
import { ImageColorService } from '../../image-color/image-color.service'
import {
    CollectedLinkContent,
    type ContentCollector,
    LINK_CONTENT_COLLECTOR,
} from '../content/link-content.type'
import { buildEmbeddingText } from '../link.util'

import { classifyFailure } from './link-analysis.failure'
import {
    type AnalysisExecutor,
    AnalysisInput,
    AnalysisResult,
} from './link-analysis.type'

// SQS·Job 상태를 모르며 도메인 결과만 반환한다. 저장은 선점 토큰을 검증하는 repository가 맡는다.
@Injectable()
export class LinkAnalysisService implements AnalysisExecutor {
    constructor(
        @Inject(LINK_CONTENT_COLLECTOR)
        private readonly collector: ContentCollector,
        private readonly ai: AiService,
        private readonly imageColor: ImageColorService,
    ) {}

    async execute(
        input: AnalysisInput,
        signal: AbortSignal,
    ): Promise<AnalysisResult> {
        const result: AnalysisResult = { patch: {} }
        const { link, jobType } = input
        const failure = (stage: string, error: unknown) => {
            const retryable = classifyFailure(error) === 'RETRYABLE'
            // 외부 URL/본문/토큰이 포함될 수 있는 provider 오류 원문은 저장하지 않는다.
            if (!result.failure || !retryable)
                result.failure = {
                    retryable,
                    code: `${stage}_FAILED`,
                    message: `${stage} 작업에 실패했습니다.`,
                }
        }
        let content: CollectedLinkContent | null = null
        if (jobType === 'ANALYZE') {
            try {
                signal.throwIfAborted()
                content = await this.collector.collect(link.originalUrl)
                signal.throwIfAborted()
            } catch (error) {
                result.patch.aiSummaryStatus = 'FAILED'
                result.patch.embedding = null
                failure('CONTENT', error)
                return result
            }
            if (content?.title) result.patch.title = content.title
            if (content?.description || content?.image) {
                const metadata = {
                    ...link.metadata,
                    version: link.metadata?.version ?? 1,
                }
                if (content.description)
                    metadata.description = content.description
                if (content.image) {
                    const image = content.image
                    const previous = metadata.images ?? []
                    const selected = {
                        ...previous.find((item) => item.url === image.url),
                        url: image.url,
                        source: image.source,
                    }
                    try {
                        signal.throwIfAborted()
                        const color = await this.imageColor.extractFromUrl(
                            image.url,
                        )
                        signal.throwIfAborted()
                        Object.assign(selected, { dominantColor: color.hex })
                    } catch {
                        // 대표 색상 실패는 기존처럼 분석의 영구 실패로 처리하지 않는다.
                    }
                    metadata.images = [
                        selected,
                        ...previous.filter((item) => item.url !== image.url),
                    ]
                }
                result.patch.metadata = metadata
            }
            if (content?.analysisUnavailableReason) {
                result.patch.aiSummaryStatus = 'FAILED'
                result.patch.embedding = null
                result.failure = {
                    retryable: false,
                    code: 'CONTENT_UNAVAILABLE',
                    message: '분석할 본문을 수집하지 못했습니다.',
                }
                return result
            }
            const aiInput = {
                userLinkId: link.id,
                url: link.originalUrl,
                title: content?.title ?? null,
                description: content?.description ?? null,
                content: content?.content ?? null,
            }
            signal.throwIfAborted()
            const [summary, generatedTags] = await Promise.allSettled([
                this.ai.generateSummary(aiInput),
                this.ai.generateTags(aiInput),
            ])
            signal.throwIfAborted()
            if (summary.status === 'fulfilled') {
                result.patch.aiSummary = summary.value.summary
                result.patch.aiSummaryStatus = 'SUCCESS'
            } else {
                result.patch.aiSummaryStatus = 'FAILED'
                failure('SUMMARY', summary.reason)
            }
            if (generatedTags.status === 'fulfilled') {
                if (generatedTags.value.tags.length) {
                    const unique = new Map<
                        string,
                        {
                            name: string
                            normalizedName: string
                            sortOrder: number
                        }
                    >()
                    generatedTags.value.tags.forEach((name, index) => {
                        const normalizedName = name
                            .trim()
                            .replace(/\s+/g, ' ')
                            .toLowerCase()
                        if (!unique.has(normalizedName))
                            unique.set(normalizedName, {
                                name,
                                normalizedName,
                                sortOrder: index + 1,
                            })
                    })
                    result.aiTags = [...unique.values()]
                }
            } else failure('TAGS', generatedTags.reason)
        }
        if (result.failure) {
            result.patch.embedding = null
            return result
        }
        const effectiveTags = input.tags.filter(
            (tag) => !result.aiTags || tag.sourceType !== 'ai',
        )
        const existing = new Set(effectiveTags.map((tag) => tag.normalizedName))
        const mergedTags = [
            ...effectiveTags,
            ...(result.aiTags ?? []).filter(
                (tag) => !existing.has(tag.normalizedName),
            ),
        ]
        // DB의 sort_order ASC NULLS LAST 순서를 따르고, 사용자 태그와 충돌한 AI 태그는 제외한다.
        mergedTags.sort(
            (a, b) => (a.sortOrder ?? Infinity) - (b.sortOrder ?? Infinity),
        )
        const text = buildEmbeddingText({
            title: result.patch.title ?? link.title,
            aiSummary: result.patch.aiSummary ?? link.aiSummary,
            tagNames: mergedTags.map((tag) => tag.name),
        })
        try {
            signal.throwIfAborted()
            result.patch.embedding = text ? await this.ai.embedText(text) : null
            signal.throwIfAborted()
        } catch (error) {
            result.patch.embedding = null
            failure('EMBEDDING', error)
        }
        return result
    }
}
