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
        const systemFolderCounts =
            await this.linkService.getSystemFolderCounts(userId)
        // TODO: isFavorite=true인 활성 링크의 실제 카운트를 조회한다.
        const systemFolders = {
            ...systemFolderCounts,
            favorite: { linkCount: 0 },
        }
        const linkCounts = await this.linkService.countActiveByFolder(userId)

        const folderRows = await this.folderRepository.listByUser(userId)

        const folderList = folderRows.map((folder) => ({
            ...this.toFolderSummary(folder),
            linkCount: linkCounts.get(folder.id) ?? 0,
            // TODO: 폴더별 MAX(links.createdAt) 집계 결과를 연결한다.
            lastSavedAt: null,
        }))

        // TODO: sortBy/order 정렬을 실제 조회 쿼리에 적용한다.
        // limit은 페이지네이션이 아니라 홈 화면 등에서 결과 개수만 제한할 때 사용한다.
        void input.sortBy
        void input.order

        return {
            systemFolders,
            folders:
                input.limit === undefined
                    ? folderList
                    : folderList.slice(0, input.limit),
        }
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
