import { Injectable } from '@nestjs/common'
import {
    and,
    count,
    desc,
    eq,
    ilike,
    isNotNull,
    isNull,
    or,
    SQL,
} from 'drizzle-orm'

import { DatabaseService } from '../../config/database/database.service'
import { FolderRow, folders } from '../folder/folder.schema'

import { ListLinksQueryInput } from './dto/link.dto'
import { LinkRow, links } from './link.schema'

// 링크 부분 수정 시 반영할 컬럼 집합 (undefined 필드는 호출부에서 제외한다)
export type LinkUpdatePatch = Partial<typeof links.$inferInsert>

@Injectable()
export class LinkRepository {
    constructor(private readonly databaseService: DatabaseService) {}

    private get db() {
        return this.databaseService.db
    }

    async insert(values: typeof links.$inferInsert): Promise<LinkRow> {
        const [row] = await this.db.insert(links).values(values).returning()

        return row
    }

    // 소유권 확인용 단건 조회 (없으면 undefined, 도메인 예외는 서비스가 담당).
    async findOwned(
        userId: number,
        linkId: number,
        options: { includeDeleted?: boolean } = {},
    ): Promise<LinkRow | undefined> {
        const conditions = [eq(links.id, linkId), eq(links.userId, userId)]

        if (!options.includeDeleted) {
            conditions.push(isNull(links.deletedAt))
        }

        const [row] = await this.db
            .select()
            .from(links)
            .where(and(...conditions))
            .limit(1)

        return row
    }

    async update(
        userId: number,
        linkId: number,
        patch: LinkUpdatePatch,
    ): Promise<LinkRow> {
        const [row] = await this.db
            .update(links)
            .set(patch)
            .where(and(eq(links.id, linkId), eq(links.userId, userId)))
            .returning()

        return row
    }

    // 같은 사용자가 저장한(삭제되지 않은) 동일 정규화 URL이 있는지 조회한다.
    async findActiveByNormalizedUrl(
        userId: number,
        normalizedUrl: string,
    ): Promise<Pick<LinkRow, 'id'> | undefined> {
        const [row] = await this.db
            .select({ id: links.id })
            .from(links)
            .where(
                and(
                    eq(links.userId, userId),
                    eq(links.normalizedUrl, normalizedUrl),
                    isNull(links.deletedAt),
                ),
            )
            .limit(1)

        return row
    }

    // 목록 조회. 검색어·폴더·미분류·삭제 여부 조건을 적용해 저장 최신순으로 반환한다.
    async list(userId: number, input: ListLinksQueryInput): Promise<LinkRow[]> {
        const conditions = [
            eq(links.userId, userId),
            input.deleted
                ? isNotNull(links.deletedAt)
                : isNull(links.deletedAt),
        ]

        if (input.q) {
            const keyword = `%${input.q}%`
            // 검색 대상: title, domain, original_url, final_url, ai_summary, memo
            const searchCondition = or(
                ilike(links.title, keyword),
                ilike(links.domain, keyword),
                ilike(links.originalUrl, keyword),
                ilike(links.finalUrl, keyword),
                ilike(links.aiSummary, keyword),
                ilike(links.memo, keyword),
            )

            if (searchCondition) {
                conditions.push(searchCondition)
            }
        }

        if (input.folderId) {
            conditions.push(eq(links.folderId, input.folderId))
        }

        if (input.unassigned) {
            conditions.push(isNull(links.folderId))
        }

        return this.db
            .select()
            .from(links)
            .where(and(...conditions))
            .orderBy(desc(links.createdAt))
    }

    // 전체/미분류/최근삭제 링크 수를 한 번에 계산한다.
    async countSystemFolders(userId: number) {
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

        return { all, uncategorized, recentlyDeleted }
    }

    // 폴더별 활성 링크 수를 그룹 조회한다. (미분류 folderId=null 포함, 맵 변환은 서비스가 담당)
    async countActiveGroupedByFolder(
        userId: number,
    ): Promise<{ folderId: number | null; linkCount: number }[]> {
        return this.db
            .select({ folderId: links.folderId, linkCount: count(links.id) })
            .from(links)
            .where(and(eq(links.userId, userId), isNull(links.deletedAt)))
            .groupBy(links.folderId)
    }

    // 링크에 연결된 폴더 참조를 조회한다 (소유권 확인 없이 id·name만).
    async findFolder(
        folderId: number,
    ): Promise<Pick<FolderRow, 'id' | 'name'> | undefined> {
        const [row] = await this.db
            .select({ id: folders.id, name: folders.name })
            .from(folders)
            .where(eq(folders.id, folderId))
            .limit(1)

        return row
    }

    // 해당 사용자가 소유한 폴더인지 확인용 조회 (없으면 undefined).
    async findFolderOwnedBy(
        userId: number,
        folderId: number,
    ): Promise<Pick<FolderRow, 'id'> | undefined> {
        const [row] = await this.db
            .select({ id: folders.id })
            .from(folders)
            .where(and(eq(folders.id, folderId), eq(folders.userId, userId)))
            .limit(1)

        return row
    }

    // 조건에 맞는 링크 수를 센다.
    private async countLinks(...conditions: SQL[]): Promise<number> {
        const [row] = await this.db
            .select({ value: count() })
            .from(links)
            .where(and(...conditions))

        return row.value
    }
}
