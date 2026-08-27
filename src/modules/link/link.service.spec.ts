import { Logger } from '@nestjs/common'

import { decodeCursor } from '../../common/pagination/cursor'

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

    it('목록 커서에 DB microsecond 정밀도 값을 그대로 사용한다', async () => {
        const first = {
            id: 79,
            title: '첫 링크',
            domain: 'example.com',
            metadata: null,
            createdAt: new Date('2026-08-08T08:10:14.443Z'),
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
})
