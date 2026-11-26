import { SQL } from 'drizzle-orm'
import { PgDialect } from 'drizzle-orm/pg-core'

import { BaseException } from '../../common/exception/base.exception'
import { encodeCursor } from '../../common/pagination/cursor'
import { DatabaseService } from '../../config/database/database.service'

import { ListLinksQueryInput } from './dto/link.dto'
import { LinkEmbeddingSource, LinkRepository } from './link.repository'
import { LinkRow } from './link.schema'

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

    describe('insert', () => {
        it('선검사 이후 경합으로 unique 제약을 위반하면 기존 링크 ID와 함께 409로 변환한다', async () => {
            const conflictError = Object.assign(new Error('duplicate key'), {
                code: '23505',
            })
            const insertQuery = {
                values: jest.fn(),
                returning: jest.fn().mockRejectedValue(conflictError),
            }
            insertQuery.values.mockReturnValue(insertQuery)

            const selectQuery = {
                from: jest.fn(),
                where: jest.fn(),
                limit: jest.fn().mockResolvedValue([{ id: 55 }]),
            }
            selectQuery.from.mockReturnValue(selectQuery)
            selectQuery.where.mockReturnValue(selectQuery)

            const db = {
                insert: jest.fn().mockReturnValue(insertQuery),
                select: jest.fn().mockReturnValue(selectQuery),
            }
            const repository = new LinkRepository({
                db,
            } as unknown as DatabaseService)

            const result = repository.insert({
                userId: 1,
                normalizedUrl: 'https://example.com',
            } as unknown as Parameters<LinkRepository['insert']>[0])

            await expect(result).rejects.toMatchObject({
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

describe('LinkRepository 사용자 지정 제목 임베딩', () => {
    const source: LinkEmbeddingSource = {
        id: 42,
        userId: 7,
        title: '내 제목',
        aiSummary: null,
        tagNames: ['태그'],
    }

    const buildUpdate = (rows: { id: number }[]) => {
        const query = {
            set: jest.fn(),
            where: jest.fn<unknown, [SQL]>(),
            returning: jest.fn().mockResolvedValue(rows),
        }
        query.set.mockReturnValue(query)
        query.where.mockReturnValue(query)
        const repository = new LinkRepository({
            db: { update: jest.fn().mockReturnValue(query) },
        } as unknown as DatabaseService)
        return { repository, query }
    }

    it.each([{ tagNames: ['태그'] }, { tagNames: [] }])(
        '제목·요약·태그가 같은 경우에만 벡터 저장과 제거를 허용한다: %j',
        async ({ tagNames }) => {
            const { repository, query } = buildUpdate([{ id: 42 }])
            await expect(
                repository.updateEmbedding(7, 42, null, {
                    ...source,
                    tagNames,
                }),
            ).resolves.toBe(true)
            const condition = new PgDialect({
                casing: 'snake_case',
            }).sqlToQuery(query.where.mock.calls[0][0])
            expect(condition.sql).toContain(
                'coalesce("links"."custom_title", "links"."title") is not distinct from',
            )
            expect(condition.sql).toContain(
                '"links"."ai_summary" is not distinct from',
            )
            expect(condition.sql).toContain(
                'array_agg("tags"."name" order by "tags"."sort_order", "tags"."id")',
            )
            expect(condition.sql).toContain('array[]::varchar[]) = array[')
            expect(condition.params).toEqual([
                42,
                7,
                source.title,
                source.aiSummary,
                7,
                42,
                ...tagNames,
            ])
        },
    )

    it('원본이 변경되어 저장하지 못하면 재시도 가능한 오류를 던진다', async () => {
        const { repository } = buildUpdate([])
        jest.spyOn(repository, 'findOwned').mockResolvedValue({
            id: 42,
        } as LinkRow)
        await expect(
            repository.updateEmbedding(7, 42, [1], source),
        ).rejects.toThrow('임베딩 원본이 변경되었습니다.')
    })

    it('생성 도중 링크가 삭제되면 재시도 없이 건너뛴다', async () => {
        const { repository } = buildUpdate([])
        jest.spyOn(repository, 'findOwned').mockResolvedValue(undefined)
        await expect(
            repository.updateEmbedding(7, 42, [1], source),
        ).resolves.toBe(false)
    })

    it.each(['내 제목', null])(
        '표시 제목으로 임베딩 원본을 만든다',
        async (customTitle) => {
            const repository = new LinkRepository({ db: {} } as DatabaseService)
            jest.spyOn(repository, 'findOwned').mockResolvedValue({
                id: 42,
                userId: 7,
                title: '수집 제목',
                customTitle,
                aiSummary: null,
            } as LinkRow)
            jest.spyOn(repository, 'findTags').mockResolvedValue([])
            expect(await repository.findEmbeddingSource(7, 42)).toMatchObject({
                title: customTitle ?? '수집 제목',
            })
        },
    )
})
