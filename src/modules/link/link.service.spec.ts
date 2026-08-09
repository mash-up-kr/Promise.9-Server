import { decodeCursor } from '../../common/pagination/cursor'

import { LinkListRow, LinkRepository } from './link.repository'
import { LinkService } from './link.service'

describe('LinkService', () => {
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
})
