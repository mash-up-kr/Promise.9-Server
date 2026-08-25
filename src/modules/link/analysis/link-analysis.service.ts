import { Injectable, Logger } from '@nestjs/common'

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

import { LinkAnalysisInput } from './link-analysis.type'

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

        // 이미지 색상은 AI 작업과 독립적이므로 동시에 시작하되, 전체 분석 종료 전에는 마친다.
        const imageColorTask = this.extractAndSaveImageColor(
            input,
            information?.image ?? null,
        )

        const aiInput: AiLinkAnalysisInput = {
            userLinkId: input.linkId,
            url: input.url,
            title: information?.title ?? null,
            description: information?.description ?? null,
            content: information?.content ?? null,
        }

        const [summarySucceeded, tagsSucceeded] = await Promise.all([
            this.generateAndSaveSummary(input, aiInput),
            this.generateAndSaveTags(input, aiInput),
        ])

        // 요약·AI 태그 작업이 모두 끝난 뒤, 최신 제목·태그·요약으로 검색 임베딩을 생성한다.
        const embeddingSucceeded = await this.generateAndSaveEmbedding(input)

        // 이미지가 없거나 색상 추출이 실패해도 링크의 AI 분석 성공 여부에는 영향을 주지 않는다.
        await imageColorTask

        // 부분 결과는 보존하되, 세 단계가 모두 끝나야 전체 분석을 성공 처리한다.
        await this.updateProcessingStatus(
            input,
            summarySucceeded && tagsSucceeded && embeddingSucceeded
                ? 'SUCCESS'
                : 'FAILED',
        )
    }

    // 화면과 검색에 사용하는 제목·설명·대표 이미지만 저장하고, 크롤링 본문은 보관하지 않는다.
    private async updateCollectedInformation(
        input: LinkAnalysisInput,
        information: CollectedLinkContent | null,
    ): Promise<void> {
        if (
            !information?.title &&
            !information?.description &&
            !information?.image
        ) {
            return
        }

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

        if (information.description || information.image) {
            patch.metadata = this.mergeCollectedMetadata(
                row.metadata,
                information,
            )
        }

        await this.linkRepository.updateActive(
            input.userId,
            input.linkId,
            patch,
        )
    }

    // 요약 결과를 저장하고 성공 여부를 반환한다. 전체 상태는 embedding 이후 확정한다.
    private async generateAndSaveSummary(
        input: LinkAnalysisInput,
        aiInput: AiLinkAnalysisInput,
    ): Promise<boolean> {
        try {
            const result = await this.aiService.generateSummary(aiInput)

            await this.linkRepository.updateActive(input.userId, input.linkId, {
                aiSummary: result.summary,
                updatedAt: new Date(),
            })

            return true
        } catch (error) {
            const errorMessage =
                error instanceof Error ? error.message : String(error)
            const errorStack = error instanceof Error ? error.stack : undefined

            this.logger.error(
                `AI 요약 생성에 실패했습니다. linkId=${input.linkId}: ${errorMessage}`,
                errorStack,
            )

            return false
        }
    }

    // 태그 생성이 성공하고 결과가 있을 때만 기존 AI 태그를 새 결과로 교체한다.
    private async generateAndSaveTags(
        input: LinkAnalysisInput,
        aiInput: AiLinkAnalysisInput,
    ): Promise<boolean> {
        try {
            const result = await this.aiService.generateTags(aiInput)

            if (result.tags.length === 0) return true

            await this.replaceAiTags(input, result.tags)

            return true
        } catch (error) {
            const errorMessage =
                error instanceof Error ? error.message : String(error)
            const errorStack = error instanceof Error ? error.stack : undefined

            this.logger.error(
                `AI 태그 생성에 실패했습니다. linkId=${input.linkId}: ${errorMessage}`,
                errorStack,
            )

            return false
        }
    }

    // 임베딩 실패도 요약·태그와 동일하게 전체 분석 상태에 반영한다.
    private async generateAndSaveEmbedding(
        input: LinkAnalysisInput,
    ): Promise<boolean> {
        try {
            return await this.embeddingService.embedLink(
                input.userId,
                input.linkId,
            )
        } catch (error) {
            const errorMessage =
                error instanceof Error ? error.message : String(error)
            const errorStack = error instanceof Error ? error.stack : undefined

            this.logger.error(
                `링크 임베딩 생성에 실패했습니다. linkId=${input.linkId}: ${errorMessage}`,
                errorStack,
            )

            return false
        }
    }

    // 대표 이미지 색상은 선택적 보강 정보다. 실패는 기록하되 전체 분석 상태와 분리한다.
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
            const errorMessage =
                error instanceof Error ? error.message : String(error)

            this.logger.warn(
                `이미지 대표 색상 추출에 실패했습니다. linkId=${input.linkId}: ${errorMessage}`,
            )
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

    // API가 노출하는 processingStatus는 전체 비동기 분석 결과를 나타낸다.
    private async updateProcessingStatus(
        input: LinkAnalysisInput,
        status: 'SUCCESS' | 'FAILED',
    ): Promise<void> {
        await this.linkRepository.updateActive(input.userId, input.linkId, {
            aiSummaryStatus: status,
            updatedAt: new Date(),
        })
    }

    // 기존 확장 필드를 보존하면서 수집한 설명·대표 이미지를 병합한다.
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

    // 동일 URL의 기존 정보는 보존하고, 새 대표 이미지를 목록 앞에 둔다.
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

    // 태그 중복 판단용으로 양끝·연속 공백과 영문 대소문자를 정규화한다.
    private normalizeTagName(name: string): string {
        return name.trim().replace(/\s+/g, ' ').toLowerCase()
    }
}
