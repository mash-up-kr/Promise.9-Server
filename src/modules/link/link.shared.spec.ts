import { LinkRepository, SharedLinkRow } from './link.repository'
import { LinkService } from './link.service'

const row = (id: number): SharedLinkRow => ({
    id,
    originalUrl: `https://example.com/${id}`,
    title: `글 ${id}`,
    domain: 'example.com',
    metadata: null,
    createdAt: new Date('2026-11-01T00:00:00Z'),
    cursorValue: '2026-11-01T00:00:00.000000Z',
})

describe('LinkService 공유 폴더 링크', () => {
    const build = (list: jest.Mock) =>
        new LinkService(
            { listSharedLinks: list } as unknown as LinkRepository,
            {} as never,
            {} as never,
            {} as never,
        )

    it('소유자의 해당 폴더 링크만 조회 함수에 넘긴다', async () => {
        const list = jest.fn().mockResolvedValue([row(2), row(1)])

        await build(list).listShared(3, 7, { limit: 20 })

        expect(list).toHaveBeenCalledWith(3, 7, { limit: 20 })
    })

    it('보여 줄 값만 내보낸다', async () => {
        const list = jest.fn().mockResolvedValue([row(1)])

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
        const list = jest.fn().mockResolvedValue([row(3), row(2), row(1)])

        const result = await build(list).listShared(3, 7, { limit: 2 })

        expect(result.links).toHaveLength(2)
        expect(result.pagination.hasNext).toBe(true)
        expect(result.pagination.nextCursor).toEqual(expect.any(String))
    })
})
