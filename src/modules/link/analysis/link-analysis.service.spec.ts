import { Logger, NotFoundException } from '@nestjs/common'

import { AiService } from '../../ai/ai.service'
import { ImageColorService } from '../../image-color/image-color.service'
import { LinkContentService } from '../content/link-content.service'
import { EmbeddingService } from '../embedding/embedding.service'
import { LinkRepository, LinkUpdatePatch } from '../link.repository'
import { LinkMetadata } from '../link.schema'

import { LinkAnalysisService } from './link-analysis.service'
import {
    LINK_ANALYSIS_TASKS,
    LinkAnalysisTask,
    LinkAnalysisTaskResult,
} from './link-analysis.type'

const INPUT = {
    linkId: 1,
    userId: 2,
    url: 'https://example.com/article',
}

const findResult = (
    results: LinkAnalysisTaskResult[],
    task: LinkAnalysisTask,
) => results.find((result) => result.task === task)

describe('LinkAnalysisService', () => {
    let service: LinkAnalysisService
    let linkRepository: jest.Mocked<
        Pick<
            LinkRepository,
            'findAnalysisMetadata' | 'updateActive' | 'replaceAiTags'
        >
    >
    let linkContentService: jest.Mocked<Pick<LinkContentService, 'collect'>>
    let aiService: jest.Mocked<
        Pick<AiService, 'generateSummary' | 'generateTags'>
    >
    let embeddingService: jest.Mocked<Pick<EmbeddingService, 'embedLink'>>
    let imageColorService: jest.Mocked<
        Pick<ImageColorService, 'extractFromUrl'>
    >
    let analysisMetadata: LinkMetadata | null
    let updatePatches: Array<Record<string, unknown>>
    let loggerErrorSpy: jest.SpyInstance
    let loggerWarnSpy: jest.SpyInstance

    beforeEach(() => {
        analysisMetadata = null
        updatePatches = []
        linkRepository = {
            findAnalysisMetadata: jest.fn().mockImplementation(() =>
                Promise.resolve({
                    id: INPUT.linkId,
                    metadata: analysisMetadata,
                }),
            ),
            updateActive: jest
                .fn()
                .mockImplementation((_userId, _linkId, patch) => {
                    const typedPatch = patch as LinkUpdatePatch

                    updatePatches.push(typedPatch)
                    if (typedPatch.metadata !== undefined) {
                        analysisMetadata = typedPatch.metadata
                    }
                    return Promise.resolve(undefined)
                }),
            replaceAiTags: jest.fn().mockResolvedValue(undefined),
        }
        linkContentService = {
            collect: jest.fn().mockResolvedValue(null),
        }
        aiService = {
            generateSummary: jest.fn().mockResolvedValue({ summary: '요약' }),
            generateTags: jest.fn().mockResolvedValue({ tags: [] }),
        }
        embeddingService = {
            embedLink: jest.fn().mockResolvedValue(true),
        }
        imageColorService = {
            extractFromUrl: jest.fn().mockResolvedValue({
                hex: '#a0d4fc',
                rgb: [160, 212, 252],
                textColor: '#000',
                luminance: 0.62,
                isDark: false,
                source: 'node-vibrant.lightVibrant',
            }),
        }
        loggerErrorSpy = jest
            .spyOn(Logger.prototype, 'error')
            .mockImplementation()
        loggerWarnSpy = jest
            .spyOn(Logger.prototype, 'warn')
            .mockImplementation()

        service = new LinkAnalysisService(
            linkRepository as unknown as LinkRepository,
            linkContentService as unknown as LinkContentService,
            aiService as unknown as AiService,
            embeddingService as unknown as EmbeddingService,
            imageColorService as unknown as ImageColorService,
        )
    })

    afterEach(() => {
        loggerErrorSpy.mockRestore()
        loggerWarnSpy.mockRestore()
    })

    it('전체 작업에서 수집 정보와 이미지 색상을 저장한 뒤 AI와 임베딩을 실행한다', async () => {
        linkContentService.collect.mockResolvedValueOnce({
            title: '링크 제목',
            description: '링크 설명',
            content: '링크 본문',
            image: {
                url: 'https://example.com/thumbnail.png',
                source: 'og:image',
            },
        })
        aiService.generateTags.mockResolvedValueOnce({ tags: ['AI'] })

        const results = await service.run(INPUT, LINK_ANALYSIS_TASKS)

        expect(results.every((result) => result.status === 'SUCCESS')).toBe(
            true,
        )
        expect(linkRepository.replaceAiTags).toHaveBeenCalledWith(2, 1, [
            { name: 'AI', normalizedName: 'ai', sortOrder: 1 },
        ])
        expect(embeddingService.embedLink).toHaveBeenCalledWith(2, 1)
        expect(imageColorService.extractFromUrl).toHaveBeenCalledWith(
            'https://example.com/thumbnail.png',
        )
        expect(analysisMetadata).toEqual({
            version: 1,
            description: '링크 설명',
            images: [
                {
                    url: 'https://example.com/thumbnail.png',
                    source: 'og:image',
                    dominantColor: '#a0d4fc',
                },
            ],
        })
    })

    it('EMBEDDING만 재시도하면 링크 수집과 AI 호출을 건너뛴다', async () => {
        const results = await service.run(INPUT, ['EMBEDDING'])

        expect(linkContentService.collect).not.toHaveBeenCalled()
        expect(aiService.generateSummary).not.toHaveBeenCalled()
        expect(aiService.generateTags).not.toHaveBeenCalled()
        expect(results).toEqual([{ task: 'EMBEDDING', status: 'SUCCESS' }])
    })

    it('요약 실패를 던지지 않고 RETRYABLE 결과와 FAILED 상태로 남긴다', async () => {
        const error = new Error('summary failed')
        aiService.generateSummary.mockRejectedValueOnce(error)

        const results = await service.run(INPUT, ['SUMMARY'])

        expect(findResult(results, 'SUMMARY')).toEqual({
            task: 'SUMMARY',
            status: 'FAILED',
            kind: 'RETRYABLE',
            error,
        })
        expect(updatePatches).toEqual([
            expect.objectContaining({ aiSummaryStatus: 'FAILED' }),
        ])
    })

    it('4xx 태그 실패를 PERMANENT로 분류한다', async () => {
        aiService.generateTags.mockRejectedValueOnce(new NotFoundException())

        const results = await service.run(INPUT, ['TAGS'])

        expect(findResult(results, 'TAGS')).toEqual(
            expect.objectContaining({ status: 'FAILED', kind: 'PERMANENT' }),
        )
    })

    it('수집 결과와 생성된 태그가 없으면 SKIPPED로 남긴다', async () => {
        const results = await service.run(INPUT, ['CONTENT', 'TAGS'])

        expect(findResult(results, 'CONTENT')).toEqual(
            expect.objectContaining({ status: 'SKIPPED' }),
        )
        expect(findResult(results, 'TAGS')).toEqual(
            expect.objectContaining({ status: 'SKIPPED' }),
        )
    })

    it('임베딩할 활성 링크 내용이 없으면 SKIPPED로 남긴다', async () => {
        embeddingService.embedLink.mockResolvedValueOnce(false)

        const results = await service.run(INPUT, ['EMBEDDING'])

        expect(findResult(results, 'EMBEDDING')).toEqual(
            expect.objectContaining({ status: 'SKIPPED' }),
        )
    })

    it('이미지 색상 추출 실패는 CONTENT 작업 실패로 전파하지 않는다', async () => {
        imageColorService.extractFromUrl.mockRejectedValueOnce(
            new Error('color failed'),
        )
        linkContentService.collect.mockResolvedValueOnce({
            title: null,
            description: null,
            content: null,
            image: {
                url: 'https://example.com/thumbnail.png',
                source: 'og:image',
            },
        })

        const results = await service.run(INPUT, ['CONTENT'])

        expect(results).toEqual([{ task: 'CONTENT', status: 'SUCCESS' }])
        expect(loggerWarnSpy).toHaveBeenCalled()
    })
})
