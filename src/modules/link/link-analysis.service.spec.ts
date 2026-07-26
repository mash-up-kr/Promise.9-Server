import { Logger } from '@nestjs/common'

import { DatabaseService } from '../../config/database/database.service'
import { AiService } from '../ai/ai.service'

import { LinkContentService } from './content/link-content.service'
import {
    LinkAnalysisService,
    StartLinkAnalysisInput,
} from './link-analysis.service'

type InternalLinkAnalysisService = {
    analyze(input: StartLinkAnalysisInput): Promise<void>
}

describe('LinkAnalysisService', () => {
    let service: LinkAnalysisService
    let internalService: InternalLinkAnalysisService
    let linkContentService: jest.Mocked<Pick<LinkContentService, 'collect'>>
    let aiService: jest.Mocked<
        Pick<AiService, 'generateSummary' | 'generateTags'>
    >
    let updatePatches: Array<Record<string, unknown>>
    let insertedTags: Array<Record<string, unknown>>
    let transactionMock: jest.Mock
    let loggerErrorSpy: jest.SpyInstance

    beforeEach(() => {
        updatePatches = []
        insertedTags = []
        linkContentService = {
            collect: jest.fn(),
        }
        aiService = {
            generateSummary: jest.fn(),
            generateTags: jest.fn(),
        }
        transactionMock = jest.fn((callback: (tx: unknown) => unknown) =>
            Promise.resolve(callback(createTransactionMock(insertedTags))),
        )
        loggerErrorSpy = jest
            .spyOn(Logger.prototype, 'error')
            .mockImplementation()

        const databaseService = {
            db: {
                select: jest.fn(() => createSelectMock([{ metadata: null }])),
                update: jest.fn(() => createUpdateMock(updatePatches)),
                transaction: transactionMock,
            },
        }

        service = new LinkAnalysisService(
            databaseService as unknown as DatabaseService,
            linkContentService as unknown as LinkContentService,
            aiService as unknown as AiService,
        )
        internalService = service as unknown as InternalLinkAnalysisService
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

        await internalService.analyze({
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
        expect(insertedTags).toEqual([
            {
                userId: 2,
                linkId: 1,
                name: 'AI',
                normalizedName: 'ai',
                sourceType: 'ai',
                sortOrder: 1,
            },
            {
                userId: 2,
                linkId: 1,
                name: '링크 저장',
                normalizedName: '링크 저장',
                sourceType: 'ai',
                sortOrder: 2,
            },
        ])
    })

    it('요약 실패만 FAILED로 기록하고 빈 태그에는 별도 처리를 하지 않는다', async () => {
        linkContentService.collect.mockResolvedValueOnce(null)
        aiService.generateSummary.mockRejectedValueOnce(
            new Error('summary failed'),
        )
        aiService.generateTags.mockResolvedValueOnce({
            tags: [],
        })

        await internalService.analyze({
            linkId: 1,
            userId: 2,
            url: 'https://example.com/article',
        })

        expect(updatePatches).toEqual([
            expect.objectContaining({
                aiSummaryStatus: 'FAILED',
            }),
        ])
        expect(transactionMock).not.toHaveBeenCalled()
        expect(insertedTags).toEqual([])
    })
})

function createSelectMock(rows: unknown[]) {
    return {
        from: jest.fn(() => ({
            where: jest.fn(() => ({
                limit: jest.fn().mockResolvedValue(rows),
            })),
        })),
    }
}

function createUpdateMock(updatePatches: Array<Record<string, unknown>>) {
    return {
        set: jest.fn((patch: Record<string, unknown>) => {
            updatePatches.push(patch)

            return {
                where: jest.fn().mockResolvedValue(undefined),
            }
        }),
    }
}

function createTransactionMock(insertedTags: Array<Record<string, unknown>>) {
    return {
        select: jest.fn(() => createSelectMock([{ id: 1 }])),
        delete: jest.fn(() => ({
            where: jest.fn().mockResolvedValue(undefined),
        })),
        insert: jest.fn(() => ({
            values: jest.fn((values: Array<Record<string, unknown>>) => {
                insertedTags.push(...values)

                return {
                    onConflictDoNothing: jest.fn().mockResolvedValue(undefined),
                }
            }),
        })),
    }
}
