import { Injectable, Logger } from '@nestjs/common'

import { AiService } from '../../ai/ai.service'
import { AiLinkAnalysisInput } from '../../ai/ai.type'
import { LinkContentService } from '../content/link-content.service'
import { CollectedLinkContent } from '../content/link-content.type'
import { LinkRepository, LinkUpdatePatch } from '../link.repository'
import { LinkMetadata } from '../link.schema'

import { LinkAnalysisInput } from './link-analysis.type'

@Injectable()
export class LinkAnalysisService {
    private readonly logger = new Logger(LinkAnalysisService.name)

    constructor(
        private readonly linkRepository: LinkRepository,
        private readonly linkContentService: LinkContentService,
        private readonly aiService: AiService,
    ) {}

    // 링크 정보를 먼저 수집한 뒤 요약과 태그 생성 작업을 서로 독립적으로 실행한다.
    async analyze(input: LinkAnalysisInput): Promise<void> {
        const information = await this.linkContentService.collect(input.url)

        try {
            await this.updateCollectedInformation(input, information)
        } catch (error) {
            const errorMessage =
                error instanceof Error ? error.message : String(error)
            const errorStack = error instanceof Error ? error.stack : undefined

            this.logger.error(
                `수집한 링크 정보 저장에 실패했습니다. linkId=${input.linkId}: ${errorMessage}`,
                errorStack,
            )
        }

        const aiInput: AiLinkAnalysisInput = {
            userLinkId: input.linkId,
            url: input.url,
            title: information?.title ?? null,
            description: information?.description ?? null,
            content: information?.content ?? null,
        }

        const results = await Promise.allSettled([
            this.generateAndSaveSummary(input, aiInput),
            this.generateAndSaveTags(input, aiInput),
        ])

        const failures = results
            .filter((result) => result.status === 'rejected')
            .map((result) => result.reason as unknown)

        if (failures.length === 1) {
            throw failures[0]
        }

        if (failures.length > 1) {
            throw new AggregateError(failures, '링크 AI 분석에 실패했습니다.')
        }
    }

    // 화면과 검색에 사용하는 제목·설명만 저장하고, 크롤링 본문은 DB에 보관하지 않는다.
    private async updateCollectedInformation(
        input: LinkAnalysisInput,
        information: CollectedLinkContent | null,
    ): Promise<void> {
        if (!information?.title && !information?.description) return

        const row = await this.linkRepository.findAnalysisMetadata(
            input.userId,
            input.linkId,
        )

        if (!row) return

        const patch: LinkUpdatePatch = {
            updatedAt: new Date(),
        }

        if (information.title) {
            patch.title = information.title
        }

        if (information.description) {
            patch.metadata = this.mergeDescription(
                row.metadata,
                information.description,
            )
        }

        await this.linkRepository.updateActive(
            input.userId,
            input.linkId,
            patch,
        )
    }

    // 실패 상태를 저장한 뒤 예외를 다시 던져 SQS 재시도·DLQ 처리를 받게 한다.
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
            const errorMessage =
                error instanceof Error ? error.message : String(error)
            const errorStack = error instanceof Error ? error.stack : undefined

            this.logger.error(
                `AI 요약 생성에 실패했습니다. linkId=${input.linkId}: ${errorMessage}`,
                errorStack,
            )

            try {
                await this.markSummaryFailed(input)
            } catch (statusUpdateError) {
                const statusUpdateErrorMessage =
                    statusUpdateError instanceof Error
                        ? statusUpdateError.message
                        : String(statusUpdateError)
                const statusUpdateErrorStack =
                    statusUpdateError instanceof Error
                        ? statusUpdateError.stack
                        : undefined

                this.logger.error(
                    `AI 요약 실패 상태 저장에 실패했습니다. linkId=${input.linkId}: ${statusUpdateErrorMessage}`,
                    statusUpdateErrorStack,
                )
            }

            throw error
        }
    }

    // 태그 생성 실패도 예외를 다시 던지며, 성공한 요약 결과에는 영향을 주지 않는다.
    private async generateAndSaveTags(
        input: LinkAnalysisInput,
        aiInput: AiLinkAnalysisInput,
    ): Promise<void> {
        try {
            const result = await this.aiService.generateTags(aiInput)

            if (result.tags.length === 0) return

            await this.replaceAiTags(input, result.tags)
        } catch (error) {
            const errorMessage =
                error instanceof Error ? error.message : String(error)
            const errorStack = error instanceof Error ? error.stack : undefined

            this.logger.error(
                `AI 태그 생성에 실패했습니다. linkId=${input.linkId}: ${errorMessage}`,
                errorStack,
            )

            throw error
        }
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

    // 요약 생성 또는 결과 저장이 실패한 링크의 요약 상태를 FAILED로 변경한다.
    private async markSummaryFailed(input: LinkAnalysisInput): Promise<void> {
        await this.linkRepository.updateActive(input.userId, input.linkId, {
            aiSummaryStatus: 'FAILED',
            updatedAt: new Date(),
        })
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
