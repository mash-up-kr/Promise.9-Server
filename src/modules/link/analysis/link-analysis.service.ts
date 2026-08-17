import { Injectable, Logger } from '@nestjs/common'

import {
    describeError,
    describeErrorStack,
} from '../../../common/exception/error.util'
import { AiService } from '../../ai/ai.service'
import { AiLinkAnalysisInput } from '../../ai/ai.type'
import { LinkContentService } from '../content/link-content.service'
import { CollectedLinkContent } from '../content/link-content.type'
import { LinkRepository, LinkUpdatePatch } from '../link.repository'
import { LinkMetadata } from '../link.schema'
import { EmbeddingService } from '../search/embedding.service'

import { classifyFailure } from './link-analysis.failure'
import {
    LINK_ANALYSIS_CONTENT_DEPENDENT_TASKS,
    LinkAnalysisInput,
    LinkAnalysisTask,
    LinkAnalysisTaskResult,
} from './link-analysis.type'

@Injectable()
export class LinkAnalysisService {
    private readonly logger = new Logger(LinkAnalysisService.name)

    constructor(
        private readonly linkRepository: LinkRepository,
        private readonly linkContentService: LinkContentService,
        private readonly aiService: AiService,
        private readonly embeddingService: EmbeddingService,
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

        const content = await this.collectIfNeeded(input, requested)

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
                      this.generateAndSaveTags(aiInput, input),
                  )
                : undefined,
        ])

        results.push(...aiResults.filter((result) => result !== undefined))

        // 임베딩은 제목·요약이 저장된 뒤 최신 행으로 실행해야 검색 품질이 올라간다.
        if (requested.has('EMBEDDING')) {
            results.push(
                await this.runTask(input, 'EMBEDDING', () =>
                    this.embedLatestRow(input),
                ),
            )
        }

        return results
    }

    // 수집 결과는 CONTENT 저장과 AI 입력이 함께 쓰므로 한 실행에서 한 번만 크롤링한다.
    // EMBEDDING만 재시도할 때처럼 아무도 본문을 쓰지 않으면 크롤링을 건너뛴다.
    private async collectIfNeeded(
        input: LinkAnalysisInput,
        requested: Set<LinkAnalysisTask>,
    ): Promise<CollectedLinkContent | null> {
        const needsContent =
            requested.has('CONTENT') ||
            LINK_ANALYSIS_CONTENT_DEPENDENT_TASKS.some((task) =>
                requested.has(task),
            )

        if (!needsContent) return null

        return this.linkContentService.collect(input.url)
    }

    // 작업 하나를 실행하고 예외를 결과 객체로 변환한다.
    private async runTask(
        input: LinkAnalysisInput,
        task: LinkAnalysisTask,
        execute: () => Promise<LinkAnalysisTaskResult | void>,
    ): Promise<LinkAnalysisTaskResult> {
        try {
            return (await execute()) ?? { task, status: 'SUCCESS' }
        } catch (error) {
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

    // 화면과 검색에 사용하는 제목·설명만 저장하고, 크롤링 본문은 DB에 보관하지 않는다.
    // collect가 실패를 null로 감추므로 수집 결과가 없으면 실패가 아닌 SKIPPED로 본다.
    private async saveCollectedContent(
        input: LinkAnalysisInput,
        content: CollectedLinkContent | null,
    ): Promise<LinkAnalysisTaskResult | void> {
        if (!content?.title && !content?.description) {
            return {
                task: 'CONTENT',
                status: 'SKIPPED',
                reason: '수집한 제목·설명이 없습니다.',
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

        const patch: LinkUpdatePatch = {
            updatedAt: new Date(),
        }

        if (content.title) {
            patch.title = content.title
        }

        if (content.description) {
            patch.metadata = this.mergeDescription(
                row.metadata,
                content.description,
            )
        }

        await this.linkRepository.updateActive(
            input.userId,
            input.linkId,
            patch,
        )
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
        aiInput: AiLinkAnalysisInput,
        input: LinkAnalysisInput,
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

    // 제목·요약이 반영된 최신 행을 다시 읽어 임베딩한다. 삭제된 링크는 건너뛴다.
    private async embedLatestRow(
        input: LinkAnalysisInput,
    ): Promise<LinkAnalysisTaskResult | void> {
        const row = await this.linkRepository.findOwned(
            input.userId,
            input.linkId,
        )

        if (!row) {
            return {
                task: 'EMBEDDING',
                status: 'SKIPPED',
                reason: '링크를 찾을 수 없습니다.',
            }
        }

        await this.embeddingService.embedLink(row)
    }

    // 사용자·규칙 태그는 보존하고 AI 태그만 transaction 안에서 멱등하게 교체한다.
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

    // 상태 저장 실패가 원래 실패를 덮지 않도록 로그만 남긴다.
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

    // 기존 metadata 확장 필드를 보존하면서 수집한 description만 갱신한다.
    private mergeDescription(
        metadata: LinkMetadata | null,
        description: string,
    ): LinkMetadata {
        return {
            ...metadata,
            version: metadata?.version ?? 1,
            description,
        }
    }

    // 태그 중복 판단용으로 양끝·연속 공백과 영문 대소문자를 정규화한다.
    private normalizeTagName(name: string): string {
        return name.trim().replace(/\s+/g, ' ').toLowerCase()
    }
}
