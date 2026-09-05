import { Logger, NotFoundException } from '@nestjs/common'

import { AiService } from '../../ai/ai.service'
import { ImageColorService } from '../../image-color/image-color.service'
import { LinkContentService } from '../content/link-content.service'
import { EmbeddingService } from '../embedding/embedding.service'
import { LinkRepository, LinkUpdatePatch } from '../link.repository'
import { LinkMetadata } from '../link.schema'

import { LINK_ANALYSIS_TASKS } from './link-analysis.constant'
import { LinkAnalysisService } from './link-analysis.service'
import { LinkAnalysisTask, LinkAnalysisTaskResult } from './link-analysis.type'

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

    it('선행 작업이 일시 실패하면 오래된 데이터로 임베딩하지 않고 함께 재시도한다', async () => {
        const error = new Error('summary failed')
        aiService.generateSummary.mockRejectedValueOnce(error)

        const results = await service.run(INPUT, LINK_ANALYSIS_TASKS)

        expect(findResult(results, 'SUMMARY')).toEqual(
            expect.objectContaining({ status: 'FAILED', kind: 'RETRYABLE' }),
        )
        expect(findResult(results, 'EMBEDDING')).toEqual(
            expect.objectContaining({ status: 'FAILED', kind: 'RETRYABLE' }),
        )
        expect(embeddingService.embedLink).not.toHaveBeenCalled()
    })

    it('선행 작업 재시도가 성공하면 저장을 마친 뒤 임베딩한다', async () => {
        embeddingService.embedLink.mockImplementationOnce(() => {
            expect(updatePatches).toContainEqual(
                expect.objectContaining({
                    aiSummary: '요약',
                    aiSummaryStatus: 'SUCCESS',
                }),
            )
            return Promise.resolve(true)
        })

        const results = await service.run(INPUT, ['SUMMARY', 'EMBEDDING'])

        expect(results).toEqual([
            { task: 'SUMMARY', status: 'SUCCESS' },
            { task: 'EMBEDDING', status: 'SUCCESS' },
        ])
        expect(embeddingService.embedLink).toHaveBeenCalledWith(2, 1)
    })

    it('선행 작업이 영구 실패하면 임베딩도 영구 실패로 남긴다', async () => {
        aiService.generateTags.mockRejectedValueOnce(new NotFoundException())

        const results = await service.run(INPUT, ['TAGS', 'EMBEDDING'])

        expect(findResult(results, 'TAGS')).toEqual(
            expect.objectContaining({ status: 'FAILED', kind: 'PERMANENT' }),
        )
        expect(findResult(results, 'EMBEDDING')).toEqual(
            expect.objectContaining({ status: 'FAILED', kind: 'PERMANENT' }),
        )
        expect(embeddingService.embedLink).not.toHaveBeenCalled()
    })

    it('일시적인 수집 실패는 CONTENT·SUMMARY·TAGS를 재시도 대상으로 남긴다', async () => {
        const error = new Error('collection failed')
        linkContentService.collect.mockRejectedValueOnce(error)

        const results = await service.run(INPUT, LINK_ANALYSIS_TASKS)

        expect(results).toEqual([
            { task: 'CONTENT', status: 'FAILED', kind: 'RETRYABLE', error },
            { task: 'SUMMARY', status: 'FAILED', kind: 'RETRYABLE', error },
            { task: 'TAGS', status: 'FAILED', kind: 'RETRYABLE', error },
            expect.objectContaining({
                task: 'EMBEDDING',
                status: 'FAILED',
                kind: 'RETRYABLE',
            }),
        ])
        expect(aiService.generateSummary).not.toHaveBeenCalled()
        expect(aiService.generateTags).not.toHaveBeenCalled()
        expect(linkRepository.updateActive).not.toHaveBeenCalled()
        expect(embeddingService.embedLink).not.toHaveBeenCalled()
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

    it('TinyFish 본문 수집이 불가능하면 URL만으로 AI를 실행하지 않는다', async () => {
        linkContentService.collect.mockResolvedValueOnce({
            title: '제목만 수집됨',
            description: null,
            content: null,
            image: null,
            analysisUnavailableReason: 'TinyFish URL 수집 불가: bot_blocked',
        })

        const results = await service.run(INPUT, ['SUMMARY', 'TAGS'])

        expect(results).toEqual([
            {
                task: 'SUMMARY',
                status: 'SKIPPED',
                reason: 'TinyFish URL 수집 불가: bot_blocked',
            },
            {
                task: 'TAGS',
                status: 'SKIPPED',
                reason: 'TinyFish URL 수집 불가: bot_blocked',
            },
        ])
        expect(linkRepository.updateActive).toHaveBeenCalledWith(
            INPUT.userId,
            INPUT.linkId,
            expect.objectContaining({ aiSummaryStatus: 'FAILED' }),
        )
        expect(aiService.generateSummary).not.toHaveBeenCalled()
        expect(aiService.generateTags).not.toHaveBeenCalled()
    })

    it('수집 불가 요약의 FAILED 상태 저장 실패는 재시도 대상으로 남긴다', async () => {
        const error = new Error('status update failed')
        linkContentService.collect.mockResolvedValueOnce({
            title: null,
            description: null,
            content: null,
            image: null,
            analysisUnavailableReason: 'TinyFish URL 수집 불가: bot_blocked',
        })
        linkRepository.updateActive.mockRejectedValueOnce(error)

        const results = await service.run(INPUT, ['SUMMARY'])

        expect(results).toEqual([
            {
                task: 'SUMMARY',
                status: 'FAILED',
                kind: 'RETRYABLE',
                error,
            },
        ])
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
