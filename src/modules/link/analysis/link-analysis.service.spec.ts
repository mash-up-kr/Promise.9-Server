import { Logger } from '@nestjs/common'

import { AiService } from '../../ai/ai.service'
import { ImageColorService } from '../../image-color/image-color.service'
import { LinkContentService } from '../content/link-content.service'
import { EmbeddingService } from '../embedding/embedding.service'
import { LinkRepository } from '../link.repository'
import { LinkMetadata } from '../link.schema'

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
    let embeddingService: jest.Mocked<Pick<EmbeddingService, 'embedLink'>>
    let imageColorService: jest.Mocked<
        Pick<ImageColorService, 'extractFromUrl'>
    >
    let analysisMetadata: LinkMetadata | null
    let updatePatches: Array<Record<string, unknown>>
    let loggerErrorSpy: jest.SpyInstance
    let loggerWarnSpy: jest.SpyInstance

    beforeEach(() => {
        updatePatches = []
        analysisMetadata = null
        linkRepository = {
            findAnalysisMetadata: jest
                .fn()
                .mockImplementation(() =>
                    Promise.resolve({ metadata: analysisMetadata }),
                ),
            updateActive: jest.fn(
                (
                    _userId: number,
                    _linkId: number,
                    patch: Record<string, unknown>,
                ) => {
                    updatePatches.push(patch)

                    if (patch.metadata) {
                        analysisMetadata = patch.metadata as LinkMetadata
                    }

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

    it('수집 후 요약과 태그를 생성해 각각 저장한다', async () => {
        linkContentService.collect.mockResolvedValueOnce({
            title: '링크 제목',
            description: '링크 설명',
            content: '링크 본문',
            image: {
                url: 'https://example.com/thumbnail.png',
                source: 'og:image',
            },
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
                        images: [
                            {
                                url: 'https://example.com/thumbnail.png',
                                source: 'og:image',
                            },
                        ],
                    },
                }),
                expect.objectContaining({
                    metadata: {
                        version: 1,
                        description: '링크 설명',
                        images: [
                            {
                                url: 'https://example.com/thumbnail.png',
                                source: 'og:image',
                                dominantColor: '#a0d4fc',
                            },
                        ],
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
        expect(imageColorService.extractFromUrl).toHaveBeenCalledWith(
            'https://example.com/thumbnail.png',
        )

        const embeddingCallOrder =
            embeddingService.embedLink.mock.invocationCallOrder[0]
        const updateCallOrders =
            linkRepository.updateActive.mock.invocationCallOrder
        const summaryPatchIndex = updatePatches.findIndex(
            (patch) => patch.aiSummary !== undefined,
        )
        expect(embeddingCallOrder).toBeGreaterThan(
            Math.max(
                updateCallOrders[summaryPatchIndex],
                ...linkRepository.replaceAiTags.mock.invocationCallOrder,
            ),
        )
        const colorPatchIndex = updatePatches.findIndex((patch) => {
            const metadata = patch.metadata as LinkMetadata | undefined
            return metadata?.images?.[0]?.dominantColor !== undefined
        })
        const statusPatchIndex = updatePatches.findIndex(
            (patch) => patch.aiSummaryStatus === 'SUCCESS',
        )
        expect(updateCallOrders[statusPatchIndex]).toBeGreaterThan(
            Math.max(embeddingCallOrder, updateCallOrders[colorPatchIndex]),
        )
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

    it('대표 이미지 색상을 갱신할 때 기존 metadata 확장 필드와 이미지 후보를 보존한다', async () => {
        analysisMetadata = {
            version: 1,
            description: '기존 설명',
            faviconUrl: 'https://example.com/favicon.ico',
            images: [
                {
                    url: 'https://example.com/thumbnail.png',
                    source: 'twitter:image',
                    width: 1200,
                    height: 630,
                    dominantColor: '#000000',
                },
                {
                    url: 'https://example.com/secondary.png',
                    source: 'og:image',
                },
            ],
        }
        linkContentService.collect.mockResolvedValueOnce({
            title: '링크 제목',
            description: '새 설명',
            content: '링크 본문',
            image: {
                url: 'https://example.com/thumbnail.png',
                source: 'og:image',
            },
        })
        aiService.generateSummary.mockResolvedValueOnce({ summary: '요약' })
        aiService.generateTags.mockResolvedValueOnce({ tags: [] })

        await service.analyze({
            linkId: 1,
            userId: 2,
            url: 'https://example.com/article',
        })

        expect(analysisMetadata).toEqual({
            version: 1,
            description: '새 설명',
            faviconUrl: 'https://example.com/favicon.ico',
            images: [
                {
                    url: 'https://example.com/thumbnail.png',
                    source: 'og:image',
                    width: 1200,
                    height: 630,
                    dominantColor: '#a0d4fc',
                },
                {
                    url: 'https://example.com/secondary.png',
                    source: 'og:image',
                },
            ],
        })
    })

    it('태그 생성이 실패하면 요약과 embedding을 보존하고 전체 분석을 FAILED로 기록한다', async () => {
        linkContentService.collect.mockResolvedValueOnce({
            title: '링크 제목',
            description: null,
            content: '링크 본문',
            image: null,
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
            image: null,
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

    it('이미지 색상 추출이 실패해도 이미지 URL을 보존하고 전체 분석은 SUCCESS로 기록한다', async () => {
        const colorError = new Error('color failed')

        linkContentService.collect.mockResolvedValueOnce({
            title: '링크 제목',
            description: null,
            content: '링크 본문',
            image: {
                url: 'https://example.com/thumbnail.png',
                source: 'og:image',
            },
        })
        aiService.generateSummary.mockResolvedValueOnce({ summary: '요약' })
        aiService.generateTags.mockResolvedValueOnce({ tags: [] })
        imageColorService.extractFromUrl.mockRejectedValueOnce(colorError)

        await service.analyze({
            linkId: 1,
            userId: 2,
            url: 'https://example.com/article',
        })

        expect(updatePatches).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    metadata: {
                        version: 1,
                        images: [
                            {
                                url: 'https://example.com/thumbnail.png',
                                source: 'og:image',
                            },
                        ],
                    },
                }),
                expect.objectContaining({
                    aiSummaryStatus: 'SUCCESS',
                }),
            ]),
        )
        expect(loggerWarnSpy).toHaveBeenCalledWith(
            '이미지 대표 색상 추출에 실패했습니다. linkId=1: color failed',
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
