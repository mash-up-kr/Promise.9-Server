import { Injectable } from '@nestjs/common'
import { and, desc, eq, isNull, ne } from 'drizzle-orm'

import { BaseException } from '../../common/exception/base.exception'
import { DatabaseService } from '../../config/database/database.service'
import { links } from '../link/link.schema'

import { FolderRow, folders } from './folder.schema'
import { FOLDER_ERROR } from './folder-error.constant'

// 폴더 부분 수정 시 반영할 컬럼 (undefined 필드는 호출부에서 제외한 뒤 넘긴다)
interface FolderChanges {
    name?: string
    color?: string
    updatedAt: Date
}

@Injectable()
export class FolderRepository {
    constructor(private readonly databaseService: DatabaseService) {}

    private get db() {
        return this.databaseService.db
    }

    async insert(values: { userId: number; name: string; color: string }) {
        const [row] = await this.throwOnDuplicateName(() =>
            this.db.insert(folders).values(values).returning(),
        )

        return row
    }

    // 유저 폴더 목록을 최근 수정순으로 조회한다 (요약 필드만).
    listByUser(userId: number) {
        return this.db
            .select({
                id: folders.id,
                name: folders.name,
                color: folders.color,
            })
            .from(folders)
            .where(eq(folders.userId, userId))
            .orderBy(desc(folders.updatedAt))
    }

    // 소유권 확인용 단건 조회 (없으면 undefined, 도메인 예외는 서비스가 담당).
    async findOwned(
        userId: number,
        folderId: number,
    ): Promise<FolderRow | undefined> {
        const [row] = await this.db
            .select()
            .from(folders)
            .where(and(eq(folders.id, folderId), eq(folders.userId, userId)))
            .limit(1)

        return row
    }

    // 활성 폴더(deleted_at IS NULL) 중 동일 이름이 있는지 조회한다 (rename 시 자기 자신 제외).
    async findActiveByName(
        userId: number,
        name: string,
        excludeFolderId?: number,
    ): Promise<Pick<FolderRow, 'id'> | undefined> {
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

        return row
    }

    async update(userId: number, folderId: number, changes: FolderChanges) {
        const [row] = await this.throwOnDuplicateName(() =>
            this.db
                .update(folders)
                .set(changes)
                .where(
                    and(eq(folders.id, folderId), eq(folders.userId, userId)),
                )
                .returning(),
        )

        return row
    }

    // 링크 이동과 폴더 삭제를 하나의 트랜잭션으로 묶고, 폴더 row를 FOR UPDATE로 잠가
    // 삭제 도중 같은 폴더로 링크가 새로 유입되어 활성 미분류로 남는 경합을 막는다.
    async removeWithLinks(userId: number, folderId: number) {
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
