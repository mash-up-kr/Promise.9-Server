import { Injectable } from '@nestjs/common'
import { and, count, desc, eq, isNotNull, isNull, ne, SQL } from 'drizzle-orm'

import { DatabaseService } from '../../config/database/database.service'
import { links } from '../link/link.schema'
import { pickThumbnailUrl } from '../link/link.util'

import { CreateFolderInput, UpdateFolderInput } from './dto/folder.dto'
import {
    FolderNameDuplicateException,
    FolderNotFoundException,
} from './folder.exception'
import { FolderRow, folders } from './folder.schema'

@Injectable()
export class FolderService {
    constructor(private readonly databaseService: DatabaseService) {}

    private get db() {
        return this.databaseService.db
    }

    async create(userId: number, input: CreateFolderInput) {
        await this.assertActiveNameAvailable(userId, input.folderName)

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

    async list(userId: number) {
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
    private async getSystemFolders(userId: number) {
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

    async rename(userId: number, folderId: number, input: UpdateFolderInput) {
        await this.getOwnedFolder(userId, folderId)
        await this.assertActiveNameAvailable(userId, input.folderName, folderId)

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
            .orderBy(desc(links.createdAt))

        return {
            folder: { folderId: folder.id, folderName: folder.name },
            links: rows.map((row) => ({
                linkId: row.id,
                title: row.title,
                thumbnailUrl: pickThumbnailUrl(row.metadata),
                savedAt: row.createdAt,
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

    // 삭제되지 않은(deleted_at IS NULL) 폴더 기준으로 폴더명 유일성을 검증한다.
    // DB 유니크 제약을 두지 않는 대신 애플리케이션에서 막는다. (rename 시 excludeFolderId로 자기 자신 제외)
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
}
