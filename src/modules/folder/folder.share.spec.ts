import { BaseException } from '../../common/exception/base.exception'
import { LinkService } from '../link/link.service'

import { SHARE_TOKEN_LENGTH } from './folder.constants'
import { FolderRepository } from './folder.repository'
import { FolderRow } from './folder.schema'
import { FolderService } from './folder.service'
import { FOLDER_ERROR } from './folder-error.constant'

const baseRow = (overrides: Partial<FolderRow> = {}): FolderRow => ({
    id: 7,
    userId: 3,
    name: '읽을 글',
    color: '#000000',
    sortOrder: null,
    shareToken: null,
    sharedAt: null,
    viewCount: 0,
    createdAt: new Date('2026-11-01T00:00:00Z'),
    updatedAt: new Date('2026-11-01T00:00:00Z'),
    deletedAt: null,
    ...overrides,
})

describe('FolderService 공유', () => {
    const build = (repository: Partial<FolderRepository>) =>
        new FolderService(
            repository as FolderRepository,
            {} as unknown as LinkService,
        )

    it('공유를 처음 켜면 추측하기 어려운 토큰을 저장하고 돌려준다', async () => {
        const setShareToken = jest.fn((_u: number, _f: number, token: string) =>
            Promise.resolve(
                baseRow({ shareToken: token, sharedAt: new Date() }),
            ),
        )
        const service = build({
            findOwned: jest.fn().mockResolvedValue(baseRow()),
            setShareToken,
        })

        const result = await service.enableShare(3, 7)

        expect(result.shareToken).toHaveLength(SHARE_TOKEN_LENGTH)
        expect(result.shareToken).toMatch(/^[A-Za-z0-9_-]+$/)
        expect(setShareToken.mock.calls[0][2]).toBe(result.shareToken)
    })

    it('이미 공유 중이면 원래 토큰을 그대로 돌려주고 새로 만들지 않는다', async () => {
        const sharedAt = new Date('2026-11-02T00:00:00Z')
        const setShareToken = jest.fn()
        const service = build({
            findOwned: jest
                .fn()
                .mockResolvedValue(baseRow({ shareToken: 'abc', sharedAt })),
            setShareToken,
        })

        await expect(service.enableShare(3, 7)).resolves.toEqual({
            shareToken: 'abc',
            sharedAt,
        })
        expect(setShareToken).not.toHaveBeenCalled()
    })

    it('남의 폴더나 없는 폴더는 공유를 켤 수 없다', async () => {
        const service = build({
            findOwned: jest.fn().mockResolvedValue(undefined),
        })

        await expect(service.enableShare(3, 99)).rejects.toEqual(
            new BaseException(FOLDER_ERROR.NOT_FOUND),
        )
    })

    it('공유를 끄면 토큰을 지운다', async () => {
        const clearShareToken = jest.fn().mockResolvedValue(undefined)
        const service = build({
            findOwned: jest
                .fn()
                .mockResolvedValue(baseRow({ shareToken: 'abc' })),
            clearShareToken,
        })

        await service.disableShare(3, 7)

        expect(clearShareToken).toHaveBeenCalledWith(3, 7)
    })

    it('남의 폴더는 공유를 끌 수 없다', async () => {
        const clearShareToken = jest.fn()
        const service = build({
            findOwned: jest.fn().mockResolvedValue(undefined),
            clearShareToken,
        })

        await expect(service.disableShare(3, 99)).rejects.toEqual(
            new BaseException(FOLDER_ERROR.NOT_FOUND),
        )
        expect(clearShareToken).not.toHaveBeenCalled()
    })
})

describe('FolderService 공유 폴더 읽기', () => {
    it('토큰으로 공유 폴더와 그 폴더의 링크만 돌려준다', async () => {
        const sharedAt = new Date('2026-11-02T00:00:00Z')
        const listShared = jest.fn().mockResolvedValue({
            links: [{ linkId: 1 }],
            pagination: { nextCursor: null, hasNext: false },
        })
        const service = new FolderService(
            {
                findByShareToken: jest
                    .fn()
                    .mockResolvedValue(
                        baseRow({ shareToken: 'abc', sharedAt }),
                    ),
            } as unknown as FolderRepository,
            { listShared } as unknown as LinkService,
        )

        const result = await service.getShared('abc', { limit: 20 })

        expect(listShared).toHaveBeenCalledWith(3, 7, { limit: 20 })
        expect(result).toEqual({
            folderName: '읽을 글',
            color: '#000000',
            sharedAt,
            links: [{ linkId: 1 }],
            pagination: { nextCursor: null, hasNext: false },
        })
    })

    it('없거나 꺼진 토큰은 404 로 막고 링크를 읽지 않는다', async () => {
        const listShared = jest.fn()
        const service = new FolderService(
            {
                findByShareToken: jest.fn().mockResolvedValue(undefined),
            } as unknown as FolderRepository,
            { listShared } as unknown as LinkService,
        )

        await expect(service.getShared('nope', { limit: 20 })).rejects.toEqual(
            new BaseException(FOLDER_ERROR.SHARE_NOT_FOUND),
        )
        expect(listShared).not.toHaveBeenCalled()
    })
})

describe('FolderService 상세의 공유 정보', () => {
    it('폴더 상세에 공유 토큰과 시작 시각을 넣어 링크를 다시 복사할 수 있게 한다', async () => {
        const sharedAt = new Date('2026-11-02T00:00:00Z')
        const service = new FolderService(
            {
                findOwned: jest
                    .fn()
                    .mockResolvedValue(
                        baseRow({ shareToken: 'abc', sharedAt }),
                    ),
            } as unknown as FolderRepository,
            {} as unknown as LinkService,
        )

        await expect(service.get(3, 7)).resolves.toEqual(
            expect.objectContaining({ shareToken: 'abc', sharedAt }),
        )
    })
})
