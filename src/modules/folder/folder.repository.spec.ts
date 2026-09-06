import { BaseException } from '../../common/exception/base.exception'
import { DatabaseService } from '../../config/database/database.service'

import { FolderRepository } from './folder.repository'

describe('FolderRepository', () => {
    const folderSelectQuery = (rows: Array<{ id: number }>) => {
        const query = {
            from: jest.fn(),
            where: jest.fn(),
            for: jest.fn(),
            limit: jest.fn().mockResolvedValue(rows),
        }
        query.from.mockReturnValue(query)
        query.where.mockReturnValue(query)
        query.for.mockReturnValue(query)
        return query
    }

    it('폴더의 활성 링크를 삭제하지 않고 미분류로 이동한 뒤 폴더를 삭제한다', async () => {
        const selectQuery = folderSelectQuery([{ id: 7 }])
        const updateQuery = {
            set: jest.fn<unknown, [{ folderId: null; updatedAt: Date }]>(),
            where: jest.fn().mockResolvedValue(undefined),
        }
        updateQuery.set.mockReturnValue(updateQuery)
        const deleteQuery = {
            where: jest.fn().mockResolvedValue(undefined),
        }
        const tx = {
            select: jest.fn().mockReturnValue(selectQuery),
            update: jest.fn().mockReturnValue(updateQuery),
            delete: jest.fn().mockReturnValue(deleteQuery),
        }
        const db = {
            transaction: jest.fn((run: (executor: typeof tx) => unknown) =>
                run(tx),
            ),
        }
        const repository = new FolderRepository({
            db,
        } as unknown as DatabaseService)

        await repository.removeAndUnassignLinks(3, 7)

        expect(updateQuery.set).toHaveBeenCalledTimes(1)
        const updatePatch = updateQuery.set.mock.calls[0][0]
        expect(updatePatch.folderId).toBeNull()
        expect(updatePatch.updatedAt).toBeInstanceOf(Date)
        expect(Object.keys(updatePatch).sort()).toEqual([
            'folderId',
            'updatedAt',
        ])
        expect(tx.delete).toHaveBeenCalledTimes(1)
        expect(deleteQuery.where).toHaveBeenCalledTimes(1)
    })

    it('소유한 폴더가 없으면 링크를 변경하거나 폴더를 삭제하지 않는다', async () => {
        const selectQuery = folderSelectQuery([])
        const tx = {
            select: jest.fn().mockReturnValue(selectQuery),
            update: jest.fn(),
            delete: jest.fn(),
        }
        const db = {
            transaction: jest.fn((run: (executor: typeof tx) => unknown) =>
                run(tx),
            ),
        }
        const repository = new FolderRepository({
            db,
        } as unknown as DatabaseService)

        await expect(
            repository.removeAndUnassignLinks(3, 7),
        ).rejects.toBeInstanceOf(BaseException)
        expect(tx.update).not.toHaveBeenCalled()
        expect(tx.delete).not.toHaveBeenCalled()
    })
})
