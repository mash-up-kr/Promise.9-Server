import { Injectable } from '@nestjs/common'

import { BaseException } from '../../common/exception/base.exception'
import { LinkService } from '../link/link.service'

import {
    CreateFolderInput,
    ListFoldersQueryInput,
    UpdateFolderInput,
} from './dto/folder.dto'
import { FOLDER_COLORS } from './folder.constants'
import { FolderRepository } from './folder.repository'
import { FolderRow } from './folder.schema'
import { FOLDER_ERROR } from './folder-error.constant'

@Injectable()
export class FolderService {
    constructor(
        private readonly folderRepository: FolderRepository,
        private readonly linkService: LinkService,
    ) {}

    // 프론트가 폴더 색상 선택 UI를 그릴 수 있도록 백엔드 팔레트를 그대로 내려준다.
    listColors() {
        return { colors: [...FOLDER_COLORS] }
    }

    async create(userId: number, input: CreateFolderInput) {
        await this.assertActiveNameAvailable(userId, input.folderName)

        const row = await this.folderRepository.insert({
            userId,
            name: input.folderName,
            color: input.color,
        })

        return { ...this.toFolderSummary(row), createdAt: row.createdAt }
    }

    async list(userId: number, input: ListFoldersQueryInput) {
        // systemFolders(favorite 포함)와 폴더별 집계는 서로 독립적이라 함께 조회한다.
        const [systemFolders, linkCounts, lastSavedAtByFolder, folderRows] =
            await Promise.all([
                this.linkService.getSystemFolderCounts(userId),
                this.linkService.countActiveByFolder(userId),
                this.linkService.lastSavedAtByFolder(userId),
                this.folderRepository.listByUser(userId),
            ])

        const folderList = folderRows.map((folder) => ({
            ...this.toFolderSummary(folder),
            linkCount: linkCounts.get(folder.id) ?? 0,
            lastSavedAt: lastSavedAtByFolder.get(folder.id) ?? null,
            // 정렬 기준용 원본 값. 응답 계약에는 포함하지 않는다.
            createdAt: folder.createdAt,
            updatedAt: folder.updatedAt,
        }))

        // 폴더 수는 사용자당 소수라 정렬은 메모리에서 처리한다. (lastSavedAt은
        // 집계값이라 컬럼 orderBy로는 못 걸어 세 기준을 일관되게 다루려는 목적)
        const sorted = this.sortFolders(folderList, input.sortBy, input.order)

        // limit은 페이지네이션이 아니라 홈 화면 등에서 결과 개수만 제한하는 용도다.
        const limited =
            input.limit === undefined ? sorted : sorted.slice(0, input.limit)

        return {
            systemFolders,
            // 정렬 전용 필드(createdAt·updatedAt)는 응답에서 제외한다.
            folders: limited.map(
                ({ createdAt: _createdAt, updatedAt: _updatedAt, ...rest }) =>
                    rest,
            ),
        }
    }

    // sortBy/order로 폴더 목록을 정렬한다. 저장 이력이 없는 폴더(lastSavedAt=null)는
    // 정렬 방향과 무관하게 항상 뒤로 보내고, 동률은 folderId로 안정 정렬한다.
    private sortFolders<
        T extends {
            folderId: number
            createdAt: Date
            updatedAt: Date
            lastSavedAt: Date | null
        },
    >(
        items: T[],
        sortBy: ListFoldersQueryInput['sortBy'],
        order: 'asc' | 'desc',
    ) {
        const valueOf = (item: T): number | null => {
            const value =
                sortBy === 'createdAt'
                    ? item.createdAt
                    : sortBy === 'updatedAt'
                      ? item.updatedAt
                      : item.lastSavedAt
            return value ? value.getTime() : null
        }
        const direction = order === 'asc' ? 1 : -1

        return [...items].sort((a, b) => {
            const av = valueOf(a)
            const bv = valueOf(b)
            if (av !== bv) {
                if (av === null) return 1
                if (bv === null) return -1
                return (av - bv) * direction
            }
            return a.folderId - b.folderId
        })
    }

    // 폴더 상세 조회 (색상 포함). 소유권 확인은 getOwnedFolder가 담당.
    async get(userId: number, folderId: number) {
        const folder = await this.getOwnedFolder(userId, folderId)

        return this.toFolderSummary(folder)
    }

    // 이름·색상 중 넘어온 값만 부분 수정. (이름을 바꿀 때만 중복 검사)
    async update(userId: number, folderId: number, input: UpdateFolderInput) {
        await this.getOwnedFolder(userId, folderId)

        if (input.folderName !== undefined) {
            await this.assertActiveNameAvailable(
                userId,
                input.folderName,
                folderId,
            )
        }

        // 넘어온 필드만 반영 (undefined는 무시해 기존 값 유지)
        const changes = {
            ...(input.folderName !== undefined && { name: input.folderName }),
            ...(input.color !== undefined && { color: input.color }),
            updatedAt: new Date(),
        }

        const row = await this.folderRepository.update(
            userId,
            folderId,
            changes,
        )

        return { ...this.toFolderSummary(row), updatedAt: row.updatedAt }
    }

    async remove(userId: number, folderId: number) {
        await this.folderRepository.removeWithLinks(userId, folderId)
    }

    // 활성 폴더(deleted_at IS NULL) 기준 폴더명 중복을 사전 검증한다. (rename 시 자기 자신 제외)
    // 최종 보장은 partial unique index가 하고, 이 조회는 친절한 도메인 에러용 fast-path다.
    private async assertActiveNameAvailable(
        userId: number,
        name: string,
        excludeFolderId?: number,
    ) {
        const existing = await this.folderRepository.findActiveByName(
            userId,
            name,
            excludeFolderId,
        )

        if (existing) {
            throw new BaseException(FOLDER_ERROR.NAME_DUPLICATE)
        }
    }

    // folders row를 API 응답용 폴더 요약(색상 포함)으로 변환한다. (응답 필드명 계약의 단일 출처)
    private toFolderSummary(row: Pick<FolderRow, 'id' | 'name' | 'color'>) {
        return { folderId: row.id, folderName: row.name, color: row.color }
    }

    // 폴더 소유권을 확인하고, 없거나 타 사용자 소유면 404로 처리한다.
    private async getOwnedFolder(
        userId: number,
        folderId: number,
    ): Promise<FolderRow> {
        const row = await this.folderRepository.findOwned(userId, folderId)

        if (!row) {
            throw new BaseException(FOLDER_ERROR.NOT_FOUND)
        }

        return row
    }
}
