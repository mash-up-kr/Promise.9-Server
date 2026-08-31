import { Injectable, Logger } from '@nestjs/common'

import {
    describeError,
    describeErrorStack,
} from '../../../common/exception/error.util'
import { AiService } from '../../ai/ai.service'
import { AiLinkAnalysisInput } from '../../ai/ai.type'
import { ImageColorService } from '../../image-color/image-color.service'
import { LinkContentService } from '../content/link-content.service'
import {
    CollectedLinkContent,
    CollectedLinkImage,
} from '../content/link-content.type'
import { EmbeddingService } from '../embedding/embedding.service'
import { LinkRepository, LinkUpdatePatch } from '../link.repository'
import { LinkMetadata } from '../link.schema'

import { classifyFailure } from './link-analysis.failure'
import {
    LINK_ANALYSIS_CONTENT_DEPENDENT_TASKS,
    LinkAnalysisFailureKind,
    LinkAnalysisInput,
    LinkAnalysisTask,
    LinkAnalysisTaskResult,
} from './link-analysis.type'

type ContentCollectionResult =
    | { status: 'SUCCESS'; content: CollectedLinkContent | null }
    | { status: 'FAILED'; error: unknown }

const LINK_ANALYSIS_COLLECTION_TASKS = [
    'CONTENT',
    ...LINK_ANALYSIS_CONTENT_DEPENDENT_TASKS,
] as const

const LINK_ANALYSIS_EMBEDDING_DEPENDENCIES = [
    'CONTENT',
    'SUMMARY',
    'TAGS',
] as const

@Injectable()
export class LinkAnalysisService {
    private readonly logger = new Logger(LinkAnalysisService.name)

    constructor(
        private readonly linkRepository: LinkRepository,
        private readonly linkContentService: LinkContentService,
        private readonly aiService: AiService,
        private readonly embeddingService: EmbeddingService,
        private readonly imageColorService: ImageColorService,
    ) {}

    // 요청받은 작업만 실행하고 작업별 결과를 돌려준다. 예외는 호출부로 던지지 않으므로
    // 인라인 실행과 SQS 재시도가 같은 결과 목록을 보고 재발행 여부를 판단할 수 있다.
    // CONTENT -> (SUMMARY, TAGS) -> EMBEDDING 순서로 실행해 뒤 작업이 앞 결과를 반영한다.
    async run(
        input: LinkAnalysisInput,
        tasks: readonly LinkAnalysisTask[],
    ): Promise<LinkAnalysisTaskResult[]> {
        const requested = new Set(tasks)
        const results: LinkAnalysisTaskResult[] = []
        const collection = await this.collectIfNeeded(input, requested)

        if (collection.status === 'FAILED') {
            // 수집 결과가 필요한 작업은 URL만으로 실행하지 않고 같은 수집 오류를 남긴다.
            // dispatcher가 요청된 작업만 재발행하므로 단독 SUMMARY/TAGS 재시도도 보존된다.
            const failedResults = LINK_ANALYSIS_COLLECTION_TASKS.filter(
                (task) => requested.has(task),
            ).map((task) =>
                this.toFailedTaskResult(input, task, collection.error),
            )

            results.push(...failedResults)
        } else {
            const content = collection.content

            if (requested.has('CONTENT')) {
                results.push(
                    await this.runTask(input, 'CONTENT', () =>
                        this.saveCollectedContent(input, content),
                    ),
                )
            }

            const aiInput = this.buildAiInput(input, content)
            const aiResults = await Promise.all([
                requested.has('SUMMARY')
                    ? this.runTask(input, 'SUMMARY', () =>
                          this.generateAndSaveSummary(input, aiInput),
                      )
                    : undefined,
                requested.has('TAGS')
                    ? this.runTask(input, 'TAGS', () =>
                          this.generateAndSaveTags(input, aiInput),
                      )
                    : undefined,
            ])

            results.push(...aiResults.filter((result) => result !== undefined))
        }

        // 임베딩은 제목·요약·태그가 모두 저장된 뒤 최신 행을 다시 조회해 실행한다.
        // 선행 작업이 실패했다면 오래된 값으로 벡터를 만들지 않고 함께 재시도한다.
        if (requested.has('EMBEDDING')) {
            const dependencyFailures = results.filter(
                (
                    result,
                ): result is Extract<
                    LinkAnalysisTaskResult,
                    { status: 'FAILED' }
                > =>
                    result.status === 'FAILED' &&
                    LINK_ANALYSIS_EMBEDDING_DEPENDENCIES.some(
                        (task) => task === result.task,
                    ),
            )

            results.push(
                dependencyFailures.length > 0
                    ? this.toBlockedEmbeddingResult(dependencyFailures)
                    : await this.runTask(input, 'EMBEDDING', () =>
                          this.embedLatestRow(input),
                      ),
            )
        }

        return results
    }

    private async collectIfNeeded(
        input: LinkAnalysisInput,
        requested: Set<LinkAnalysisTask>,
    ): Promise<ContentCollectionResult> {
        const needsContent =
            requested.has('CONTENT') ||
            LINK_ANALYSIS_CONTENT_DEPENDENT_TASKS.some((task) =>
                requested.has(task),
            )

        if (!needsContent) {
            return { status: 'SUCCESS', content: null }
        }

        try {
            return {
                status: 'SUCCESS',
                content: await this.linkContentService.collect(input.url),
            }
        } catch (error) {
            return { status: 'FAILED', error }
        }
    }

    private async runTask(
        input: LinkAnalysisInput,
        task: LinkAnalysisTask,
        execute: () => Promise<LinkAnalysisTaskResult | void>,
    ): Promise<LinkAnalysisTaskResult> {
        try {
            return (await execute()) ?? { task, status: 'SUCCESS' }
        } catch (error) {
            return this.toFailedTaskResult(input, task, error)
        }
    }

    private toFailedTaskResult(
        input: LinkAnalysisInput,
        task: LinkAnalysisTask,
        error: unknown,
    ): LinkAnalysisTaskResult {
        this.logger.error(
            `링크 분석 작업이 실패했습니다. task=${task}, linkId=${input.linkId}: ${describeError(error)}`,
            describeErrorStack(error),
        )

        return {
            task,
            status: 'FAILED',
            kind: classifyFailure(error),
            error,
        }
    }

    private toBlockedEmbeddingResult(
        dependencyFailures: Array<
            Extract<LinkAnalysisTaskResult, { status: 'FAILED' }>
        >,
    ): LinkAnalysisTaskResult {
        const failedTasks = dependencyFailures.map((result) => result.task)
        const kind: LinkAnalysisFailureKind = dependencyFailures.some(
            (result) => result.kind === 'RETRYABLE',
        )
            ? 'RETRYABLE'
            : 'PERMANENT'

        return {
            task: 'EMBEDDING',
            status: 'FAILED',
            kind,
            error: new Error(
                `선행 링크 분석 작업이 실패했습니다. tasks=${failedTasks.join(',')}`,
            ),
        }
    }

    private buildAiInput(
        input: LinkAnalysisInput,
        content: CollectedLinkContent | null,
    ): AiLinkAnalysisInput {
        return {
            userLinkId: input.linkId,
            url: input.url,
            title: content?.title ?? null,
            description: content?.description ?? null,
            content: content?.content ?? null,
        }
    }

    // 화면과 검색에 사용하는 제목·설명·대표 이미지만 저장하고 본문은 보관하지 않는다.
    private async saveCollectedContent(
        input: LinkAnalysisInput,
        content: CollectedLinkContent | null,
    ): Promise<LinkAnalysisTaskResult | void> {
        if (!content?.title && !content?.description && !content?.image) {
            return {
                task: 'CONTENT',
                status: 'SKIPPED',
                reason: '수집한 링크 정보가 없습니다.',
            }
        }

        const row = await this.linkRepository.findAnalysisMetadata(
            input.userId,
            input.linkId,
        )

        if (!row) {
            return {
                task: 'CONTENT',
                status: 'SKIPPED',
                reason: '링크를 찾을 수 없습니다.',
            }
        }

        const patch: LinkUpdatePatch = { updatedAt: new Date() }

        if (content.title) {
            patch.title = content.title
        }

        if (content.description || content.image) {
            patch.metadata = this.mergeCollectedMetadata(row.metadata, content)
        }

        await this.linkRepository.updateActive(
            input.userId,
            input.linkId,
            patch,
        )
        await this.extractAndSaveImageColor(input, content.image ?? null)
    }

    // 요약 실패는 상태를 FAILED로 남긴 뒤 예외를 다시 던져 재시도 판단을 runTask에 맡긴다.
    private async generateAndSaveSummary(
        input: LinkAnalysisInput,
        aiInput: AiLinkAnalysisInput,
    ): Promise<void> {
        try {
            const result = await this.aiService.generateSummary(aiInput)

            await this.linkRepository.updateActive(input.userId, input.linkId, {
                aiSummary: result.summary,
                aiSummaryStatus: 'SUCCESS',
                updatedAt: new Date(),
            })
        } catch (error) {
            await this.markSummaryFailedSafe(input)
            throw error
        }
    }

    private async generateAndSaveTags(
        input: LinkAnalysisInput,
        aiInput: AiLinkAnalysisInput,
    ): Promise<LinkAnalysisTaskResult | void> {
        const result = await this.aiService.generateTags(aiInput)

        if (result.tags.length === 0) {
            return {
                task: 'TAGS',
                status: 'SKIPPED',
                reason: '생성된 태그가 없습니다.',
            }
        }

        await this.replaceAiTags(input, result.tags)
    }

    private async embedLatestRow(
        input: LinkAnalysisInput,
    ): Promise<LinkAnalysisTaskResult | void> {
        const updated = await this.embeddingService.embedLink(
            input.userId,
            input.linkId,
        )

        if (!updated) {
            return {
                task: 'EMBEDDING',
                status: 'SKIPPED',
                reason: '임베딩할 활성 링크 내용이 없습니다.',
            }
        }
    }

    private async extractAndSaveImageColor(
        input: LinkAnalysisInput,
        image: CollectedLinkImage | null,
    ): Promise<void> {
        if (!image) return

        try {
            const color = await this.imageColorService.extractFromUrl(image.url)
            const row = await this.linkRepository.findAnalysisMetadata(
                input.userId,
                input.linkId,
            )

            if (!row) return

            await this.linkRepository.updateActive(input.userId, input.linkId, {
                metadata: this.mergeImageMetadata(
                    row.metadata,
                    image,
                    color.hex,
                ),
                updatedAt: new Date(),
            })
        } catch (error) {
            this.logger.warn(
                `이미지 대표 색상 추출에 실패했습니다. linkId=${input.linkId}: ${describeError(error)}`,
            )
        }
    }

    private async replaceAiTags(
        input: LinkAnalysisInput,
        generatedTags: string[],
    ): Promise<void> {
        await this.linkRepository.replaceAiTags(
            input.userId,
            input.linkId,
            generatedTags.map((name, index) => ({
                name,
                normalizedName: this.normalizeTagName(name),
                sortOrder: index + 1,
            })),
        )
    }

    private async markSummaryFailedSafe(
        input: LinkAnalysisInput,
    ): Promise<void> {
        try {
            await this.linkRepository.updateActive(input.userId, input.linkId, {
                aiSummaryStatus: 'FAILED',
                updatedAt: new Date(),
            })
        } catch (error) {
            this.logger.error(
                `AI 요약 실패 상태 저장에 실패했습니다. linkId=${input.linkId}: ${describeError(error)}`,
                describeErrorStack(error),
            )
        }
    }

    private mergeCollectedMetadata(
        metadata: LinkMetadata | null,
        information: CollectedLinkContent,
    ): LinkMetadata {
        const merged: LinkMetadata = {
            ...metadata,
            version: metadata?.version ?? 1,
        }

        if (information.description) {
            merged.description = information.description
        }

        if (information.image) {
            merged.images = this.mergeImageMetadata(
                metadata,
                information.image,
            ).images
        }

        return merged
    }

    private mergeImageMetadata(
        metadata: LinkMetadata | null,
        image: CollectedLinkImage,
        dominantColor?: string,
    ): LinkMetadata {
        const existingImages = metadata?.images ?? []
        const existingImage = existingImages.find(
            (candidate) => candidate.url === image.url,
        )
        const mergedImage = {
            ...existingImage,
            url: image.url,
            source: image.source,
            ...(dominantColor ? { dominantColor } : {}),
        }

        return {
            ...metadata,
            version: metadata?.version ?? 1,
            images: [
                mergedImage,
                ...existingImages.filter(
                    (candidate) => candidate.url !== image.url,
                ),
            ],
        }
    }

    private normalizeTagName(name: string): string {
        return name.trim().replace(/\s+/g, ' ').toLowerCase()
    }
}
