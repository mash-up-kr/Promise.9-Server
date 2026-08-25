import { Logger } from '@nestjs/common'
import { afterEach, beforeEach, describe, expect, it, jest } from 'bun:test'

import type { BunMock, BunMocked } from '../../../../test/bun-test.type'
import { AiService } from '../../ai/ai.service'
import { LinkContentService } from '../content/link-content.service'
import { EmbeddingService } from '../embedding/embedding.service'
import { LinkRepository } from '../link.repository'

import { LinkAnalysisService } from './link-analysis.service'

describe('LinkAnalysisService', () => {
    let service: LinkAnalysisService
    let linkRepository: BunMocked<
        Pick<
            LinkRepository,
            'findAnalysisMetadata' | 'updateActive' | 'replaceAiTags'
        >
    >
    let linkContentService: BunMocked<Pick<LinkContentService, 'collect'>>
    let aiService: BunMocked<
        Pick<AiService, 'generateSummary' | 'generateTags'>
    >
    let embeddingService: BunMocked<Pick<EmbeddingService, 'embedLink'>>
    let updatePatches: Array<Record<string, unknown>>
    let loggerErrorSpy: BunMock

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
        embeddingService = {
            embedLink: jest.fn().mockResolvedValue(true),
        }
        loggerErrorSpy = jest
            .spyOn(Logger.prototype, 'error')
            .mockImplementation(() => undefined)

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
                }),
                expect.objectContaining({
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
        expect(embeddingService.embedLink).toHaveBeenCalledWith(2, 1)

        const embeddingCallOrder =
            embeddingService.embedLink.mock.invocationCallOrder[0]
        const updateCallOrders =
            linkRepository.updateActive.mock.invocationCallOrder
        expect(embeddingCallOrder).toBeGreaterThan(
            Math.max(
                ...updateCallOrders.slice(0, -1),
                ...linkRepository.replaceAiTags.mock.invocationCallOrder,
            ),
        )
        const successStatusCallOrder = updateCallOrders.at(-1)!
        expect(successStatusCallOrder).toBeGreaterThan(embeddingCallOrder)
    })

    it('요약이 실패하면 부분 embedding을 시도한 뒤 전체 분석을 FAILED로 기록한다', async () => {
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
        expect(embeddingService.embedLink).toHaveBeenCalledWith(2, 1)
    })

    it('태그 생성이 실패하면 요약과 embedding을 보존하고 전체 분석을 FAILED로 기록한다', async () => {
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
                }),
                expect.objectContaining({
                    aiSummaryStatus: 'FAILED',
                }),
            ]),
        )
        expect(linkRepository.replaceAiTags).not.toHaveBeenCalled()
        expect(embeddingService.embedLink).toHaveBeenCalledWith(2, 1)
    })

    it('요약과 태그가 성공해도 embedding 저장이 실패하면 전체 분석을 FAILED로 기록한다', async () => {
        linkContentService.collect.mockResolvedValueOnce({
            title: '링크 제목',
            description: null,
            content: '링크 본문',
        })
        aiService.generateSummary.mockResolvedValueOnce({
            summary: '생성된 요약이에요.',
        })
        aiService.generateTags.mockResolvedValueOnce({ tags: ['AI'] })
        embeddingService.embedLink.mockResolvedValueOnce(false)

        await service.analyze({
            linkId: 1,
            userId: 2,
            url: 'https://example.com/article',
        })

        expect(updatePatches).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    aiSummary: '생성된 요약이에요.',
                }),
                expect.objectContaining({
                    aiSummaryStatus: 'FAILED',
                }),
            ]),
        )
    })

    it('embedding 생성 예외를 기록하고 전체 분석을 FAILED로 기록한다', async () => {
        const embeddingError = new Error('embedding failed')

        linkContentService.collect.mockResolvedValueOnce(null)
        aiService.generateSummary.mockResolvedValueOnce({ summary: '요약' })
        aiService.generateTags.mockResolvedValueOnce({ tags: [] })
        embeddingService.embedLink.mockRejectedValueOnce(embeddingError)

        await service.analyze({
            linkId: 1,
            userId: 2,
            url: 'https://example.com/article',
        })

        expect(updatePatches).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    aiSummaryStatus: 'FAILED',
                }),
            ]),
        )
        expect(loggerErrorSpy).toHaveBeenCalledWith(
            '링크 임베딩 생성에 실패했습니다. linkId=1: embedding failed',
            embeddingError.stack,
        )
    })
})
