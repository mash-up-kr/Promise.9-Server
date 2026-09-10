import { Logger } from '@nestjs/common'

import { decodeCursor } from '../../common/pagination/cursor'

import { LinkAnalysisDispatcher } from './analysis/link-analysis.dispatcher'
import { RelatedLinkService } from './related/related-link.service'
import { LinkListRow, LinkRepository } from './link.repository'
import { LinkRow } from './link.schema'
import { LinkService } from './link.service'

describe('LinkService', () => {
    it('링크 일괄 폴더 이동을 repository에 위임한다', async () => {
        const result = {
            requestedCount: 2,
            movedCount: 1,
            unchangedCount: 1,
            folderId: 7,
        }
        const linkRepository = {
            moveToFolder: jest.fn().mockResolvedValue(result),
        }
        const service = new LinkService(
            linkRepository as unknown as LinkRepository,
            {} as never,
            {} as never,
            {} as never,
        )

        await expect(
            service.moveToFolder(3, { linkIds: [42, 43], folderId: 7 }),
        ).resolves.toEqual(result)
        expect(linkRepository.moveToFolder).toHaveBeenCalledWith(3, [42, 43], 7)
    })

    it('전체 링크 페이지 cursor에 저장 시각의 DB microsecond 값을 그대로 사용한다', async () => {
        const first = {
            id: 79,
            title: '첫 링크',
            domain: 'example.com',
            metadata: null,
            createdAt: new Date('2026-08-08T08:10:14.443Z'),
            reminderAt: new Date('2026-08-20T12:00:00.000Z'),
            cursorValue: '2026-08-08T08:10:14.443365Z',
        } as LinkListRow
        const second = {
            ...first,
            id: 78,
            title: '둘째 링크',
            cursorValue: '2026-08-08T08:10:14.443300Z',
        }
        const linkRepository = {
            list: jest.fn().mockResolvedValue({
                rows: [first, second],
                totalCount: 2,
            }),
        }
        const service = new LinkService(
            linkRepository as unknown as LinkRepository,
            {} as never,
            {} as never,
            {} as never,
        )

        const result = await service.list(1, {
            unassigned: false,
            favorite: false,
            reminder: false,
            deleted: false,
            sortBy: 'savedAt',
            order: 'desc',
            limit: 1,
        })

        expect(linkRepository.list).toHaveBeenCalledTimes(1)
        expect(result.pagination.hasNext).toBe(true)
        expect(decodeCursor(result.pagination.nextCursor!)).toEqual({
            v: first.cursorValue,
            id: first.id,
        })
        expect(result.links[0].reminderAt).toEqual(first.reminderAt)
    })

    it('최근 삭제 링크 페이지 cursor에 삭제 시각의 DB microsecond 값을 그대로 사용한다', async () => {
        const first = {
            id: 79,
            title: '최근 삭제 링크',
            domain: 'example.com',
            metadata: null,
            createdAt: new Date('2026-07-01T00:00:00.000Z'),
            deletedAt: new Date('2026-08-08T08:10:14.443Z'),
            reminderAt: null,
            cursorValue: '2026-08-08T08:10:14.443365Z',
        } as LinkListRow
        const second = {
            ...first,
            id: 78,
            cursorValue: '2026-08-08T08:10:14.443300Z',
        }
        const linkRepository = {
            list: jest.fn().mockResolvedValue({
                rows: [first, second],
                totalCount: 2,
            }),
        }
        const service = new LinkService(
            linkRepository as unknown as LinkRepository,
            {} as never,
            {} as never,
            {} as never,
        )
        const input = {
            unassigned: false,
            favorite: false,
            reminder: false,
            deleted: true,
            sortBy: 'deletedAt' as const,
            order: 'desc' as const,
            limit: 1,
        }

        const result = await service.list(1, input)

        expect(linkRepository.list).toHaveBeenCalledWith(1, input)
        expect(result).toMatchObject({
            pagination: { hasNext: true, limit: 1 },
            totalCount: 2,
        })
        expect(decodeCursor(result.pagination.nextCursor!)).toEqual({
            v: first.cursorValue,
            id: first.id,
        })
    })

    it('상세 링크의 폴더 색상과 관련 링크를 응답에 포함한다', async () => {
        const link = {
            id: 10,
            userId: 7,
            folderId: 3,
            originalUrl: 'https://example.com/source',
            title: '원본 링크',
            domain: 'example.com',
            metadata: null,
            embedding: [1, 0],
            createdAt: new Date('2026-08-08T00:00:00.000Z'),
            isFavorite: false,
            viewedAt: null,
            aiSummaryStatus: 'SUCCESS',
            aiSummary: '요약',
            memo: null,
        } as LinkRow
        const tagRows = [
            {
                id: 1,
                name: 'AI',
                normalizedName: 'ai',
                sourceType: 'ai',
                sortOrder: 1,
            },
        ]
        const linkRepository = {
            findOwned: jest.fn().mockResolvedValue(link),
            findFolder: jest.fn().mockResolvedValue({
                id: 3,
                name: '디자인',
                color: '#d5d76a',
            }),
            findTags: jest.fn().mockResolvedValue(tagRows),
        }
        const relatedLinkService = {
            relatedLinks: jest.fn().mockResolvedValue([
                {
                    linkId: 11,
                    title: '관련 링크',
                    thumbnailUrl: null,
                },
            ]),
        }
        const service = new LinkService(
            linkRepository as unknown as LinkRepository,
            {} as never,
            {} as never,
            relatedLinkService as unknown as RelatedLinkService,
        )

        const result = await service.detail(7, 10)

        expect(relatedLinkService.relatedLinks).toHaveBeenCalledWith(7, {
            id: 10,
            folderId: 3,
            title: '원본 링크',
            embedding: [1, 0],
            normalizedTags: ['ai'],
        })
        expect(result.folder).toEqual({
            folderId: 3,
            folderName: '디자인',
            color: '#d5d76a',
        })
        expect(result.relatedLinks).toEqual([
            { linkId: 11, title: '관련 링크', thumbnailUrl: null },
        ])
    })

    it('썸네일 TTL이 만료됐으면 CONTENT 갱신을 예약하고 재조회 안내를 응답에 포함한다', async () => {
        const link = {
            id: 10,
            userId: 7,
            folderId: null,
            originalUrl: 'https://instagram.com/p/original',
            finalUrl: 'https://instagram.com/p/final',
            title: '원본 링크',
            domain: 'instagram.com',
            metadata: {
                version: 1,
                images: [
                    {
                        url: 'https://scontent.cdninstagram.com/photo.jpg',
                        expiresAt: '2026-01-01T00:00:00.000Z',
                    },
                ],
            },
            embedding: null,
            createdAt: new Date('2026-08-08T00:00:00.000Z'),
            isFavorite: false,
            viewedAt: null,
            aiSummaryStatus: 'SUCCESS',
            aiSummary: null,
            memo: null,
        } as LinkRow
        const linkRepository = {
            findOwned: jest.fn().mockResolvedValue(link),
            findTags: jest.fn().mockResolvedValue([]),
            postponeContentRefresh: jest.fn().mockResolvedValue(undefined),
        }
        const linkAnalysisDispatcher = {
            dispatch: jest.fn(),
        }
        const relatedLinkService = {
            relatedLinks: jest.fn().mockResolvedValue([]),
        }
        const service = new LinkService(
            linkRepository as unknown as LinkRepository,
            {} as never,
            linkAnalysisDispatcher as unknown as LinkAnalysisDispatcher,
            relatedLinkService as unknown as RelatedLinkService,
        )

        const result = await service.detail(7, 10)

        expect(result.thumbnailRefresh).toEqual({
            required: true,
            afterMs: 10_000,
        })
        expect(linkAnalysisDispatcher.dispatch).toHaveBeenCalledWith(
            {
                linkId: 10,
                userId: 7,
                url: 'https://instagram.com/p/final',
            },
            ['CONTENT'],
        )
        // 예약과 동시에 쿨다운을 걸어 조회할 때마다 재수집이 나가지 않게 한다.
        expect(linkRepository.postponeContentRefresh).toHaveBeenCalledWith(
            [10],
            expect.any(Date),
        )
    })

    it('이미 예약된 갱신 기한이 남아 있으면 상세 조회에서 재수집을 다시 던지지 않는다', async () => {
        const link = {
            id: 10,
            userId: 7,
            folderId: null,
            originalUrl: 'https://instagram.com/p/original',
            finalUrl: 'https://instagram.com/p/final',
            title: '원본 링크',
            domain: 'instagram.com',
            metadata: {
                version: 1,
                images: [
                    {
                        url: 'https://scontent.cdninstagram.com/photo.jpg',
                        expiresAt: '2026-01-01T00:00:00.000Z',
                    },
                ],
            },
            // 스케줄러나 직전 조회가 이미 쿨다운을 걸어둔 상태.
            contentRefreshDueAt: new Date('2099-01-01T00:00:00.000Z'),
            embedding: null,
            createdAt: new Date('2026-08-08T00:00:00.000Z'),
            isFavorite: false,
            viewedAt: null,
            aiSummaryStatus: 'SUCCESS',
            aiSummary: null,
            memo: null,
        } as LinkRow
        const linkRepository = {
            findOwned: jest.fn().mockResolvedValue(link),
            findTags: jest.fn().mockResolvedValue([]),
            postponeContentRefresh: jest.fn().mockResolvedValue(undefined),
        }
        const linkAnalysisDispatcher = {
            dispatch: jest.fn(),
        }
        const relatedLinkService = {
            relatedLinks: jest.fn().mockResolvedValue([]),
        }
        const service = new LinkService(
            linkRepository as unknown as LinkRepository,
            {} as never,
            linkAnalysisDispatcher as unknown as LinkAnalysisDispatcher,
            relatedLinkService as unknown as RelatedLinkService,
        )

        const result = await service.detail(7, 10)

        // 프론트 재조회 안내는 그대로 내려주되, 재수집은 던지지 않는다.
        expect(result.thumbnailRefresh).toEqual({
            required: true,
            afterMs: 10_000,
        })
        expect(linkAnalysisDispatcher.dispatch).not.toHaveBeenCalled()
        expect(linkRepository.postponeContentRefresh).not.toHaveBeenCalled()
    })

    it('개발자 검토 상태는 상세 응답에서 SUCCESS로 감춘다', async () => {
        const link = {
            id: 10,
            userId: 7,
            folderId: null,
            originalUrl: 'https://example.com/source',
            title: '원본 링크',
            domain: 'example.com',
            metadata: null,
            embedding: null,
            createdAt: new Date('2026-08-08T00:00:00.000Z'),
            isFavorite: false,
            viewedAt: null,
            aiSummaryStatus: 'NEEDS_REVIEW',
            aiSummary: '로그인이 필요한 페이지예요.',
            memo: null,
        } as LinkRow
        const linkRepository = {
            findOwned: jest.fn().mockResolvedValue(link),
            findTags: jest.fn().mockResolvedValue([]),
        }
        const relatedLinkService = {
            relatedLinks: jest.fn().mockResolvedValue([]),
        }
        const service = new LinkService(
            linkRepository as unknown as LinkRepository,
            {} as never,
            {} as never,
            relatedLinkService as unknown as RelatedLinkService,
        )

        const result = await service.detail(7, 10)

        expect(result.processingStatus).toBe('SUCCESS')
        expect(result.aiSummary).toBe('로그인이 필요한 페이지예요.')
    })

    it('관련 링크 조회가 실패해도 상세 응답을 빈 관련 링크 목록으로 반환한다', async () => {
        const link = {
            id: 10,
            userId: 7,
            folderId: null,
            originalUrl: 'https://example.com/source',
            title: '원본 링크',
            domain: 'example.com',
            metadata: null,
            embedding: null,
            createdAt: new Date('2026-08-08T00:00:00.000Z'),
            isFavorite: false,
            viewedAt: null,
            aiSummaryStatus: 'SUCCESS',
            aiSummary: null,
            memo: null,
        } as LinkRow
        const linkRepository = {
            findOwned: jest.fn().mockResolvedValue(link),
            findTags: jest.fn().mockResolvedValue([]),
        }
        const relatedLinkService = {
            relatedLinks: jest.fn().mockRejectedValue(new Error('DB error')),
        }
        const loggerWarnSpy = jest
            .spyOn(Logger.prototype, 'warn')
            .mockImplementation()
        const service = new LinkService(
            linkRepository as unknown as LinkRepository,
            {} as never,
            {} as never,
            relatedLinkService as unknown as RelatedLinkService,
        )

        await expect(service.detail(7, 10)).resolves.toMatchObject({
            relatedLinks: [],
        })
        expect(loggerWarnSpy).toHaveBeenCalledWith(
            '관련 링크 조회에 실패해 빈 목록을 반환합니다. linkId=10 error=DB error',
        )

        loggerWarnSpy.mockRestore()
    })

    it('이미 저장한 동일 URL이면 기존 링크 ID와 함께 409로 거부한다', async () => {
        const linkRepository = {
            findActiveByNormalizedUrl: jest.fn().mockResolvedValue({ id: 55 }),
        }
        const service = new LinkService(
            linkRepository as unknown as LinkRepository,
            {} as never,
            {} as never,
            {} as never,
        )

        await expect(
            service.create(1, { url: 'https://example.com' }),
        ).rejects.toMatchObject({
            status: 409,
            response: {
                error: {
                    errorCode: 930003,
                    linkId: 55,
                },
            },
        })
    })
})
