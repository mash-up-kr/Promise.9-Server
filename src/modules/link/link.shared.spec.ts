import { LinkListRow, LinkRepository } from './link.repository'
import { LinkService } from './link.service'

const row = (id: number): LinkListRow =>
    ({
        id,
        originalUrl: `https://example.com/${id}`,
        title: `글 ${id}`,
        domain: 'example.com',
        metadata: null,
        memo: '비공개 메모',
        reminderAt: new Date('2026-12-01T00:00:00Z'),
        createdAt: new Date('2026-11-01T00:00:00Z'),
        cursorValue: '2026-11-01T00:00:00.000000Z',
    }) as unknown as LinkListRow

describe('LinkService 공유 폴더 링크', () => {
    const build = (list: jest.Mock) =>
        new LinkService(
            { list } as unknown as LinkRepository,
            {} as never,
            {} as never,
            {} as never,
        )

    it('소유자의 해당 폴더 링크만 저장 최신순으로 조회한다', async () => {
        const list = jest
            .fn()
            .mockResolvedValue({ rows: [row(2), row(1)], totalCount: 2 })

        await build(list).listShared(3, 7, { limit: 20 })

        expect(list).toHaveBeenCalledWith(
            3,
            expect.objectContaining({
                folderId: 7,
                sortBy: 'savedAt',
                order: 'desc',
                limit: 20,
                deleted: false,
                unassigned: false,
            }),
        )
    })

    it('메모와 알림 시각 같은 비공개 값은 빼고 보여 줄 값만 내보낸다', async () => {
        const list = jest
            .fn()
            .mockResolvedValue({ rows: [row(1)], totalCount: 1 })

        const result = await build(list).listShared(3, 7, { limit: 20 })

        expect(result.links).toEqual([
            {
                linkId: 1,
                url: 'https://example.com/1',
                title: '글 1',
                source: 'example.com',
                thumbnailUrl: null,
                savedAt: new Date('2026-11-01T00:00:00Z'),
            },
        ])
    })

    it('limit 보다 많이 조회되면 다음 페이지 cursor 를 만든다', async () => {
        const list = jest.fn().mockResolvedValue({
            rows: [row(3), row(2), row(1)],
            totalCount: 3,
        })

        const result = await build(list).listShared(3, 7, { limit: 2 })

        expect(result.links).toHaveLength(2)
        expect(result.pagination.hasNext).toBe(true)
        expect(result.pagination.nextCursor).toEqual(expect.any(String))
    })
})
