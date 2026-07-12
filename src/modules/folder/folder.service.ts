import { Injectable } from '@nestjs/common'
import { and, desc, eq, isNull, ne } from 'drizzle-orm'

import { DatabaseService } from '../../config/database/database.service'
import { links } from '../link/link.schema'
import { LinkService } from '../link/link.service'

import { CreateFolderInput, UpdateFolderInput } from './dto/folder.dto'
import {
    FolderNameDuplicateException,
    FolderNotFoundException,
} from './folder.exception'
import { FolderRow, folders } from './folder.schema'

@Injectable()
export class FolderService {
    constructor(
        private readonly databaseService: DatabaseService,
        private readonly linkService: LinkService,
    ) {}

    private get db() {
        return this.databaseService.db
    }

    async create(userId: number, input: CreateFolderInput) {
        await this.assertActiveNameAvailable(userId, input.folderName)

        const [row] = await this.throwOnDuplicateName(() =>
            this.db
                .insert(folders)
                .values({ userId, name: input.folderName })
                .returning(),
        )

        return {
            folderId: row.id,
            folderName: row.name,
            createdAt: row.createdAt,
        }
    }

    async list(userId: number) {
        const systemFolders =
            await this.linkService.getSystemFolderCounts(userId)
        const linkCounts = await this.linkService.countActiveByFolder(userId)

        const folderRows = await this.db
            .select({ folderId: folders.id, folderName: folders.name })
            .from(folders)
            .where(eq(folders.userId, userId))
            .orderBy(desc(folders.updatedAt))

        const folderList = folderRows.map((folder) => ({
            ...folder,
            linkCount: linkCounts.get(folder.folderId) ?? 0,
        }))

        return { systemFolders, folders: folderList }
    }

    async rename(userId: number, folderId: number, input: UpdateFolderInput) {
        await this.getOwnedFolder(userId, folderId)
        await this.assertActiveNameAvailable(userId, input.folderName, folderId)

        const [row] = await this.throwOnDuplicateName(() =>
            this.db
                .update(folders)
                .set({ name: input.folderName, updatedAt: new Date() })
                .where(
                    and(eq(folders.id, folderId), eq(folders.userId, userId)),
                )
                .returning(),
        )

        return {
            folderId: row.id,
            folderName: row.name,
            updatedAt: row.updatedAt,
        }
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
                throw new FolderNotFoundException()
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

    async getLinks(userId: number, folderId: number) {
        const folder = await this.getOwnedFolder(userId, folderId)
        const folderLinks = await this.linkService.listByFolder(
            userId,
            folderId,
        )

        return {
            folder: { folderId: folder.id, folderName: folder.name },
            links: folderLinks,
            totalCount: folderLinks.length,
        }
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
            throw new FolderNameDuplicateException()
        }
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
            throw new FolderNotFoundException()
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
                throw new FolderNameDuplicateException()
            }
            throw error
        }
    }
}
