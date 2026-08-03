import { Logger } from '@nestjs/common'

import { AiService } from '../../ai/ai.service'
import { LinkContentService } from '../content/link-content.service'
import { LinkRepository } from '../link.repository'

import { LinkAnalysisService } from './link-analysis.service'

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
        }
        linkContentService = {
            collect: jest.fn(),
        }
        aiService = {
            generateSummary: jest.fn(),
            generateTags: jest.fn(),
        }
        loggerErrorSpy = jest
            .spyOn(Logger.prototype, 'error')
            .mockImplementation()

        service = new LinkAnalysisService(
            linkRepository as unknown as LinkRepository,
            linkContentService as unknown as LinkContentService,
            aiService as unknown as AiService,
        )
    })

    afterEach(() => {
        loggerErrorSpy.mockRestore()
    })

    it('수집 후 요약과 태그를 생성해 각각 저장한다', async () => {
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

        await service.analyze({
            linkId: 1,
            userId: 2,
            url: 'https://example.com/article',
        })

        expect(aiService.generateSummary).toHaveBeenCalledWith({
            userLinkId: 1,
            url: 'https://example.com/article',
            title: '링크 제목',
            description: '링크 설명',
            content: '링크 본문',
        })
        expect(aiService.generateTags).toHaveBeenCalledWith(
            expect.objectContaining({
                userLinkId: 1,
                content: '링크 본문',
            }),
        )
        expect(updatePatches).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    title: '링크 제목',
                    metadata: {
                        version: 1,
                        description: '링크 설명',
                    },
                }),
                expect.objectContaining({
                    aiSummary: '생성된 요약이에요.',
                    aiSummaryStatus: 'SUCCESS',
                }),
            ]),
        )
        expect(linkRepository.replaceAiTags).toHaveBeenCalledWith(2, 1, [
            {
                name: 'AI',
                normalizedName: 'ai',
                sortOrder: 1,
            },
            {
                name: '링크 저장',
                normalizedName: '링크 저장',
                sortOrder: 2,
            },
        ])
    })

    it('요약 실패만 FAILED로 기록하고 빈 태그에는 별도 처리를 하지 않는다', async () => {
        const summaryError = new Error('summary failed')

        linkContentService.collect.mockResolvedValueOnce(null)
        aiService.generateSummary.mockRejectedValueOnce(summaryError)
        aiService.generateTags.mockResolvedValueOnce({
            tags: [],
        })

        await service.analyze({
            linkId: 1,
            userId: 2,
            url: 'https://example.com/article',
        })

        expect(updatePatches).toEqual([
            expect.objectContaining({
                aiSummaryStatus: 'FAILED',
            }),
        ])
        expect(linkRepository.replaceAiTags).not.toHaveBeenCalled()
        expect(loggerErrorSpy).toHaveBeenCalledWith(
            'AI 요약 생성에 실패했습니다. linkId=1: summary failed',
            summaryError.stack,
        )
    })

    it('태그 생성 실패는 성공한 요약 상태에 영향을 주지 않는다', async () => {
        linkContentService.collect.mockResolvedValueOnce({
            title: '링크 제목',
            description: null,
            content: '링크 본문',
        })
        aiService.generateSummary.mockResolvedValueOnce({
            summary: '생성된 요약이에요.',
        })
        aiService.generateTags.mockRejectedValueOnce(new Error('tag failed'))

        await service.analyze({
            linkId: 1,
            userId: 2,
            url: 'https://example.com/article',
        })

        expect(updatePatches).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    aiSummary: '생성된 요약이에요.',
                    aiSummaryStatus: 'SUCCESS',
                }),
            ]),
        )
        expect(updatePatches).not.toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    aiSummaryStatus: 'FAILED',
                }),
            ]),
        )
        expect(linkRepository.replaceAiTags).not.toHaveBeenCalled()
    })
})
