import { Injectable } from '@nestjs/common'
import { and, count, desc, eq, isNotNull, isNull, SQL } from 'drizzle-orm'

import { DatabaseService } from '../../config/database/database.service'
import { links } from '../link/link.schema'

import { CreateFolderInput, UpdateFolderInput } from './dto/folder.dto'
import { FolderNotFoundException } from './folder.exception'
import { FolderRow, folders } from './folder.schema'

@Injectable()
export class FolderService {
    constructor(private readonly databaseService: DatabaseService) {}

    private get db() {
        return this.databaseService.db
    }

    async create(userId: string, input: CreateFolderInput) {
        const [row] = await this.db
            .insert(folders)
            .values({ userId, name: input.folderName })
            .returning()

        return {
            folderId: row.id,
            folderName: row.name,
            createdAt: row.createdAt,
        }
    }

    async list(userId: string) {
        const systemFolders = await this.getSystemFolders(userId)

        const folderList = await this.db
            .select({
                folderId: folders.id,
                folderName: folders.name,
                linkCount: count(links.id),
            })
            .from(folders)
            .leftJoin(
                links,
                and(eq(links.folderId, folders.id), isNull(links.deletedAt)),
            )
            .where(eq(folders.userId, userId))
            .groupBy(folders.id)
            .orderBy(desc(folders.updatedAt))

        return { systemFolders, folders: folderList }
    }

    // 시스템 폴더(전체/미분류/최근삭제)의 링크 수를 한 번에 계산한다.
    private async getSystemFolders(userId: string) {
        const owned = eq(links.userId, userId)

        const [all, uncategorized, recentlyDeleted] = await Promise.all([
            this.countLinks(owned, isNull(links.deletedAt)),
            this.countLinks(
                owned,
                isNull(links.folderId),
                isNull(links.deletedAt),
            ),
            this.countLinks(owned, isNotNull(links.deletedAt)),
        ])

        return {
            all: { linkCount: all },
            uncategorized: { linkCount: uncategorized },
            recentlyDeleted: { linkCount: recentlyDeleted },
        }
    }

    async rename(userId: string, folderId: string, input: UpdateFolderInput) {
        await this.getOwnedFolder(userId, folderId)

        const [row] = await this.db
            .update(folders)
            .set({ name: input.folderName, updatedAt: new Date() })
            .where(and(eq(folders.id, folderId), eq(folders.userId, userId)))
            .returning()

        return {
            folderId: row.id,
            folderName: row.name,
            updatedAt: row.updatedAt,
        }
    }

    async remove(userId: string, folderId: string) {
        await this.getOwnedFolder(userId, folderId)

        // 폴더에 속한 링크는 "최근 삭제된 항목"으로 이동 (soft delete + 미분류 처리)
        await this.db
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

        await this.db
            .delete(folders)
            .where(and(eq(folders.id, folderId), eq(folders.userId, userId)))
    }

    async getLinks(userId: string, folderId: string) {
        const folder = await this.getOwnedFolder(userId, folderId)

        const rows = await this.db
            .select()
            .from(links)
            .where(
                and(
                    eq(links.folderId, folderId),
                    eq(links.userId, userId),
                    isNull(links.deletedAt),
                ),
            )
            .orderBy(desc(links.savedAt))

        return {
            folder: { folderId: folder.id, folderName: folder.name },
            links: rows.map((row) => ({
                linkId: row.id,
                title: row.title,
                thumbnailUrl: row.thumbnailUrl,
                savedAt: row.savedAt,
            })),
            totalCount: rows.length,
        }
    }

    // 조건에 맞는 링크 수를 센다. (시스템 폴더 카운트용)
    private async countLinks(...conditions: SQL[]): Promise<number> {
        const [row] = await this.db
            .select({ value: count() })
            .from(links)
            .where(and(...conditions))

        return row.value
    }

    // 폴더 소유권을 확인하고, 없거나 타 사용자 소유면 404로 처리한다.
    private async getOwnedFolder(
        userId: string,
        folderId: string,
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
}
