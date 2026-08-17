import { Logger, NotFoundException } from '@nestjs/common'

import { AiService } from '../../ai/ai.service'
import { LinkContentService } from '../content/link-content.service'
import { LinkRepository } from '../link.repository'
import { EmbeddingService } from '../search/embedding.service'

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

function findResult(
    results: LinkAnalysisTaskResult[],
    task: LinkAnalysisTask,
): LinkAnalysisTaskResult | undefined {
    return results.find((result) => result.task === task)
}

describe('LinkAnalysisService', () => {
    let service: LinkAnalysisService
    let linkRepository: jest.Mocked<
        Pick<
            LinkRepository,
            | 'findAnalysisMetadata'
            | 'updateActive'
            | 'replaceAiTags'
            | 'findOwned'
        >
    >
    let linkContentService: jest.Mocked<Pick<LinkContentService, 'collect'>>
    let aiService: jest.Mocked<
        Pick<AiService, 'generateSummary' | 'generateTags'>
    >
    let embeddingService: jest.Mocked<Pick<EmbeddingService, 'embedLink'>>
    let updatePatches: Array<Record<string, unknown>>
    let loggerErrorSpy: jest.SpyInstance

    beforeEach(() => {
        updatePatches = []
        linkRepository = {
            findAnalysisMetadata: jest
                .fn()
                .mockResolvedValue({ metadata: null }),
            updateActive: jest.fn(
                (
                    _userId: number,
                    _linkId: number,
                    patch: Record<string, unknown>,
                ) => {
                    updatePatches.push(patch)
                    return Promise.resolve()
                },
            ),
            replaceAiTags: jest.fn().mockResolvedValue(undefined),
            findOwned: jest.fn().mockResolvedValue({ id: 1 }),
        }
        linkContentService = {
            collect: jest.fn().mockResolvedValue(null),
        }
        aiService = {
            generateSummary: jest.fn(),
            generateTags: jest.fn(),
        }
        embeddingService = {
            embedLink: jest.fn().mockResolvedValue(undefined),
        }
        loggerErrorSpy = jest
            .spyOn(Logger.prototype, 'error')
            .mockImplementation()

        service = new LinkAnalysisService(
            linkRepository as unknown as LinkRepository,
            linkContentService as unknown as LinkContentService,
            aiService as unknown as AiService,
            embeddingService as unknown as EmbeddingService,
        )
    })

    afterEach(() => {
        loggerErrorSpy.mockRestore()
    })

    it('전체 작업을 요청하면 수집·요약·태그·임베딩을 실행하고 저장한다', async () => {
        linkContentService.collect.mockResolvedValueOnce({
            title: '링크 제목',
            description: '링크 설명',
            content: '링크 본문',
        })
        aiService.generateSummary.mockResolvedValueOnce({
            summary: '생성된 요약이에요.',
        })
        aiService.generateTags.mockResolvedValueOnce({
            tags: ['AI', '링크 저장'],
        })

        const results = await service.run(INPUT, LINK_ANALYSIS_TASKS)

        expect(aiService.generateSummary).toHaveBeenCalledWith({
            userLinkId: 1,
            url: 'https://example.com/article',
            title: '링크 제목',
            description: '링크 설명',
            content: '링크 본문',
        })
        expect(updatePatches).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    title: '링크 제목',
                    metadata: { version: 1, description: '링크 설명' },
                }),
                expect.objectContaining({
                    aiSummary: '생성된 요약이에요.',
                    aiSummaryStatus: 'SUCCESS',
                }),
            ]),
        )
        expect(linkRepository.replaceAiTags).toHaveBeenCalledWith(2, 1, [
            { name: 'AI', normalizedName: 'ai', sortOrder: 1 },
            { name: '링크 저장', normalizedName: '링크 저장', sortOrder: 2 },
        ])
        expect(embeddingService.embedLink).toHaveBeenCalledTimes(1)
        expect(results.every((result) => result.status === 'SUCCESS')).toBe(
            true,
        )
    })

    it('요청하지 않은 작업은 실행하지 않고 결과에도 넣지 않는다', async () => {
        const results = await service.run(INPUT, ['EMBEDDING'])

        expect(linkContentService.collect).not.toHaveBeenCalled()
        expect(aiService.generateSummary).not.toHaveBeenCalled()
        expect(aiService.generateTags).not.toHaveBeenCalled()
        expect(embeddingService.embedLink).toHaveBeenCalledTimes(1)
        expect(results).toEqual([{ task: 'EMBEDDING', status: 'SUCCESS' }])
    })

    it('요약만 재시도하면 본문을 다시 수집하고 태그는 건드리지 않는다', async () => {
        linkContentService.collect.mockResolvedValueOnce({
            title: '링크 제목',
            description: null,
            content: '링크 본문',
        })
        aiService.generateSummary.mockResolvedValueOnce({
            summary: '생성된 요약이에요.',
        })

        const results = await service.run(INPUT, ['SUMMARY'])

        expect(linkContentService.collect).toHaveBeenCalledWith(INPUT.url)
        expect(aiService.generateTags).not.toHaveBeenCalled()
        expect(linkRepository.replaceAiTags).not.toHaveBeenCalled()
        expect(results).toEqual([{ task: 'SUMMARY', status: 'SUCCESS' }])
    })

    it('작업 실패를 예외로 던지지 않고 RETRYABLE 결과로 반환한다', async () => {
        const summaryError = new Error('summary failed')

        aiService.generateSummary.mockRejectedValueOnce(summaryError)
        aiService.generateTags.mockResolvedValueOnce({ tags: ['AI'] })

        const results = await service.run(INPUT, ['SUMMARY', 'TAGS'])

        expect(findResult(results, 'SUMMARY')).toEqual({
            task: 'SUMMARY',
            status: 'FAILED',
            kind: 'RETRYABLE',
            error: summaryError,
        })
        expect(findResult(results, 'TAGS')).toEqual({
            task: 'TAGS',
            status: 'SUCCESS',
        })
        expect(updatePatches).toEqual(
            expect.arrayContaining([
                expect.objectContaining({ aiSummaryStatus: 'FAILED' }),
            ]),
        )
    })

    it('4xx 실패는 재시도하지 않도록 PERMANENT로 분류한다', async () => {
        aiService.generateTags.mockRejectedValueOnce(new NotFoundException())

        const results = await service.run(INPUT, ['TAGS'])

        expect(findResult(results, 'TAGS')).toEqual(
            expect.objectContaining({ status: 'FAILED', kind: 'PERMANENT' }),
        )
    })

    it('수집 결과와 생성된 태그가 없으면 실패가 아닌 SKIPPED로 남긴다', async () => {
        aiService.generateSummary.mockResolvedValueOnce({ summary: '요약' })
        aiService.generateTags.mockResolvedValueOnce({ tags: [] })

        const results = await service.run(INPUT, ['CONTENT', 'SUMMARY', 'TAGS'])

        expect(findResult(results, 'CONTENT')).toEqual(
            expect.objectContaining({ status: 'SKIPPED' }),
        )
        expect(findResult(results, 'TAGS')).toEqual(
            expect.objectContaining({ status: 'SKIPPED' }),
        )
        expect(linkRepository.replaceAiTags).not.toHaveBeenCalled()
    })

    it('삭제된 링크의 임베딩은 실패가 아닌 SKIPPED로 남긴다', async () => {
        linkRepository.findOwned.mockResolvedValueOnce(undefined)

        const results = await service.run(INPUT, ['EMBEDDING'])

        expect(findResult(results, 'EMBEDDING')).toEqual(
            expect.objectContaining({ status: 'SKIPPED' }),
        )
        expect(embeddingService.embedLink).not.toHaveBeenCalled()
    })
})
