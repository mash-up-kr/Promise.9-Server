import { Injectable } from '@nestjs/common'
import { and, desc, eq, isNull, ne } from 'drizzle-orm'

import { BaseException } from '../../common/exception/base.exception'
import { DatabaseService } from '../../config/database/database.service'
import { links } from '../link/link.schema'
import { LinkService } from '../link/link.service'

import {
    CreateFolderInput,
    ListFoldersQueryInput,
    UpdateFolderInput,
} from './dto/folder.dto'
import { FOLDER_COLORS } from './folder.constants'
import { FolderRow, folders } from './folder.schema'
import { FOLDER_ERROR } from './folder-error.constant'

@Injectable()
export class FolderService {
    constructor(
        private readonly databaseService: DatabaseService,
        private readonly linkService: LinkService,
    ) {}

    private get db() {
        return this.databaseService.db
    }

    // 프론트가 폴더 색상 선택 UI를 그릴 수 있도록 백엔드 팔레트를 그대로 내려준다.
    listColors() {
        return { colors: [...FOLDER_COLORS] }
    }

    async create(userId: number, input: CreateFolderInput) {
        await this.assertActiveNameAvailable(userId, input.folderName)

        const [row] = await this.throwOnDuplicateName(() =>
            this.db
                .insert(folders)
                .values({
                    userId,
                    name: input.folderName,
                    color: input.color,
                })
                .returning(),
        )

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

        const folderRows = await this.db
            .select({
                id: folders.id,
                name: folders.name,
                color: folders.color,
            })
            .from(folders)
            .where(eq(folders.userId, userId))
            .orderBy(desc(folders.updatedAt))

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

        const [row] = await this.throwOnDuplicateName(() =>
            this.db
                .update(folders)
                .set(changes)
                .where(
                    and(eq(folders.id, folderId), eq(folders.userId, userId)),
                )
                .returning(),
        )

        return { ...this.toFolderSummary(row), updatedAt: row.updatedAt }
    }

    async remove(userId: number, folderId: number) {
        // 링크 이동과 폴더 삭제를 하나의 트랜잭션으로 묶고, 폴더 row를 FOR UPDATE로 잠가
        // 삭제 도중 같은 폴더로 링크가 새로 유입되어 활성 미분류로 남는 경합을 막는다.
        // TODO: DB 관련 로직은 추후 service 계층이 아닌 repository 계층으로 리팩토링
        await this.db.transaction(async (tx) => {
            const [folder] = await tx
                .select({ id: folders.id })
                .from(folders)
                .where(
                    and(eq(folders.id, folderId), eq(folders.userId, userId)),
                )
                .for('update')
                .limit(1)

            if (!folder) {
                throw new BaseException(FOLDER_ERROR.NOT_FOUND)
            }

            // 폴더에 속한 링크는 "최근 삭제된 항목"으로 이동 (soft delete + 미분류 처리)
            await tx
                .update(links)
                .set({
                    deletedAt: new Date(),
                    folderId: null,
                    updatedAt: new Date(),
                })
                .where(
                    and(
                        eq(links.folderId, folderId),
                        eq(links.userId, userId),
                        isNull(links.deletedAt),
                    ),
                )

            await tx
                .delete(folders)
                .where(
                    and(eq(folders.id, folderId), eq(folders.userId, userId)),
                )
        })
    }

    // 활성 폴더(deleted_at IS NULL) 기준 폴더명 중복을 사전 검증한다. (rename 시 자기 자신 제외)
    // 최종 보장은 partial unique index가 하고, 이 조회는 친절한 도메인 에러용 fast-path다.
    private async assertActiveNameAvailable(
        userId: number,
        name: string,
        excludeFolderId?: number,
    ) {
        const conditions = [
            eq(folders.userId, userId),
            eq(folders.name, name),
            isNull(folders.deletedAt),
        ]

        if (excludeFolderId !== undefined) {
            conditions.push(ne(folders.id, excludeFolderId))
        }

        const [row] = await this.db
            .select({ id: folders.id })
            .from(folders)
            .where(and(...conditions))
            .limit(1)

        if (row) {
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
        const [row] = await this.db
            .select()
            .from(folders)
            .where(and(eq(folders.id, folderId), eq(folders.userId, userId)))
            .limit(1)

        if (!row) {
            throw new BaseException(FOLDER_ERROR.NOT_FOUND)
        }

        return row
    }

    // 동시 요청 경합으로 unique index를 위반할 때 나는 23505를 도메인 예외로 변환한다.
    private async throwOnDuplicateName<T>(run: () => Promise<T>): Promise<T> {
        try {
            return await run()
        } catch (error) {
            if (
                error instanceof Error &&
                'code' in error &&
                error.code === '23505'
            ) {
                throw new BaseException(FOLDER_ERROR.NAME_DUPLICATE)
            }
            throw error
        }
    }
}
