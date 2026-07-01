import { Injectable } from '@nestjs/common'
import { and, count, desc, eq, isNotNull, isNull, SQL } from 'drizzle-orm'

import { DatabaseService } from '../../config/database/database.service'
import { links } from '../link/link.schema'

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
        try {
            const [row] = await this.db
                .insert(folders)
                .values({ userId, name: input.folderName })
                .returning()

            return {
                folderId: row.id,
                folderName: row.name,
                createdAt: row.createdAt,
            }
        } catch (error) {
            if (this.isDuplicateNameError(error)) {
                throw new FolderNameDuplicateException()
            }
            throw error
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

        try {
            const [row] = await this.db
                .update(folders)
                .set({ name: input.folderName, updatedAt: new Date() })
                .where(
                    and(eq(folders.id, folderId), eq(folders.userId, userId)),
                )
                .returning()

            return {
                folderId: row.id,
                folderName: row.name,
                updatedAt: row.updatedAt,
            }
        } catch (error) {
            if (this.isDuplicateNameError(error)) {
                throw new FolderNameDuplicateException()
            }
            throw error
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

    // (user_id, name) 유니크 제약 위반(Postgres 23505)인지 판별한다.
    private isDuplicateNameError(error: unknown): boolean {
        return (
            typeof error === 'object' &&
            error !== null &&
            'code' in error &&
            (error as { code?: unknown }).code === '23505'
        )
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
