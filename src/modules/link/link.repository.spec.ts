import { BaseException } from '../../common/exception/base.exception'
import { encodeCursor } from '../../common/pagination/cursor'
import { DatabaseService } from '../../config/database/database.service'

import { ListLinksQueryInput } from './dto/link.dto'
import { LinkRepository } from './link.repository'

const listInput = (cursor: string): ListLinksQueryInput => ({
    unassigned: false,
    favorite: false,
    reminder: false,
    deleted: false,
    sortBy: 'savedAt',
    order: 'desc',
    cursor,
    limit: 9,
})

describe('LinkRepository', () => {
    const repository = new LinkRepository({ db: {} } as DatabaseService)

    it('형식만 맞고 실제로 존재하지 않는 날짜 cursor를 거부한다', async () => {
        const cursor = encodeCursor({
            v: '2026-99-99T99:99:99.999Z',
            id: 1,
        })

        const result = repository.list(1, listInput(cursor))

        await expect(result).rejects.toBeInstanceOf(BaseException)
        await expect(result).rejects.toHaveProperty('status', 400)
    })

    describe('moveToFolder', () => {
        const selectQuery = <T>(rows: T[]) => {
            const query = {
                from: jest.fn(),
                where: jest.fn(),
                for: jest.fn(),
                limit: jest.fn(),
            }
            query.from.mockReturnValue(query)
            query.where.mockReturnValue(query)
            query.for.mockImplementation(() => query)
            query.limit.mockResolvedValue(rows)
            return query
        }

        const linkSelectQuery = <T>(rows: T[]) => {
            const query = {
                from: jest.fn(),
                where: jest.fn(),
                orderBy: jest.fn(),
                for: jest.fn(),
            }
            query.from.mockReturnValue(query)
            query.where.mockReturnValue(query)
            query.orderBy.mockReturnValue(query)
            query.for.mockResolvedValue(rows)
            return query
        }

        it('목적지가 다른 활성 링크만 갱신하고 이동 수를 반환한다', async () => {
            const folderQuery = selectQuery([{ id: 7 }])
            const linksQuery = linkSelectQuery([
                { id: 42, folderId: 1 },
                { id: 43, folderId: 7 },
            ])
            const updateQuery = {
                set: jest.fn(),
                where: jest.fn().mockResolvedValue(undefined),
            }
            updateQuery.set.mockReturnValue(updateQuery)
            const tx = {
                select: jest
                    .fn()
                    .mockReturnValueOnce(folderQuery)
                    .mockReturnValueOnce(linksQuery),
                update: jest.fn().mockReturnValue(updateQuery),
            }
            const db = {
                transaction: jest.fn((run: (executor: typeof tx) => unknown) =>
                    run(tx),
                ),
            }
            const moveRepository = new LinkRepository({
                db,
            } as unknown as DatabaseService)

            await expect(
                moveRepository.moveToFolder(3, [42, 43], 7),
            ).resolves.toEqual({
                requestedCount: 2,
                movedCount: 1,
                unchangedCount: 1,
                folderId: 7,
            })
            expect(updateQuery.set).toHaveBeenCalledTimes(1)
            expect(linksQuery.orderBy).toHaveBeenCalledTimes(1)
        })

        it('모든 링크가 이미 목적지에 있으면 갱신하지 않는다', async () => {
            const linksQuery = linkSelectQuery([
                { id: 42, folderId: null },
                { id: 43, folderId: null },
            ])
            const tx = {
                select: jest.fn().mockReturnValue(linksQuery),
                update: jest.fn(),
            }
            const db = {
                transaction: jest.fn((run: (executor: typeof tx) => unknown) =>
                    run(tx),
                ),
            }
            const moveRepository = new LinkRepository({
                db,
            } as unknown as DatabaseService)

            await expect(
                moveRepository.moveToFolder(3, [42, 43], null),
            ).resolves.toEqual({
                requestedCount: 2,
                movedCount: 0,
                unchangedCount: 2,
                folderId: null,
            })
            expect(tx.update).not.toHaveBeenCalled()
        })

        it('활성 소유 링크가 하나라도 없으면 전체 요청을 거부한다', async () => {
            const linksQuery = linkSelectQuery([{ id: 42, folderId: 1 }])
            const tx = {
                select: jest.fn().mockReturnValue(linksQuery),
                update: jest.fn(),
            }
            const db = {
                transaction: jest.fn((run: (executor: typeof tx) => unknown) =>
                    run(tx),
                ),
            }
            const moveRepository = new LinkRepository({
                db,
            } as unknown as DatabaseService)

            const result = moveRepository.moveToFolder(3, [42, 43], null)

            await expect(result).rejects.toBeInstanceOf(BaseException)
            await expect(result).rejects.toHaveProperty('status', 404)
            expect(tx.update).not.toHaveBeenCalled()
        })

        it('소유한 활성 목적지 폴더가 없으면 링크를 조회하지 않고 거부한다', async () => {
            const folderQuery = selectQuery([])
            const tx = {
                select: jest.fn().mockReturnValue(folderQuery),
                update: jest.fn(),
            }
            const db = {
                transaction: jest.fn((run: (executor: typeof tx) => unknown) =>
                    run(tx),
                ),
            }
            const moveRepository = new LinkRepository({
                db,
            } as unknown as DatabaseService)

            const result = moveRepository.moveToFolder(3, [42], 7)

            await expect(result).rejects.toBeInstanceOf(BaseException)
            await expect(result).rejects.toHaveProperty('status', 404)
            expect(tx.select).toHaveBeenCalledTimes(1)
            expect(tx.update).not.toHaveBeenCalled()
        })
    })
})
