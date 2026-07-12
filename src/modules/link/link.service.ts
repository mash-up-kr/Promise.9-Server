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
import { FolderNotFoundException } from '../folder/folder.exception'
import { folders } from '../folder/folder.schema'

import {
    CreateLinkInput,
    SearchLinkInput,
    UpdateLinkInput,
} from './dto/link.dto'
import {
    LinkAlreadyExistsException,
    LinkNotDeletedException,
    LinkNotFoundException,
} from './link.exception'
import { LinkRow, links } from './link.schema'
import { extractDomain, normalizeUrl, pickThumbnailUrl } from './link.util'

@Injectable()
export class LinkService {
    constructor(private readonly databaseService: DatabaseService) {}

    private get db() {
        return this.databaseService.db
    }

    async create(userId: number, input: CreateLinkInput) {
        if (input.folderId) {
            await this.assertOwnedFolder(userId, input.folderId)
        }

        const normalizedUrl = normalizeUrl(input.url)
        await this.assertNotDuplicated(userId, normalizedUrl)

        const [row] = await this.db
            .insert(links)
            .values({
                userId,
                folderId: input.folderId ?? null,
                originalUrl: input.url,
                normalizedUrl,
                domain: extractDomain(input.url),
                // 메타데이터/요약 수집은 후속 작업 — 저장 시점엔 대기 상태로 둔다.
                aiSummaryStatus: 'PENDING',
                memo: input.memo ?? null,
            })
            .returning()

        return {
            linkId: row.id,
            url: row.originalUrl,
            savedAt: row.createdAt,
        }
    }

    async detail(userId: number, linkId: number) {
        const link = await this.getOwnedLink(userId, linkId)
        const folder = await this.findFolderRef(link.folderId)

        return {
            linkId: link.id,
            url: link.originalUrl,
            folder,
            thumbnailUrl: pickThumbnailUrl(link.metadata),
            title: link.title,
            source: link.domain,
            // 발행 시각은 별도 컬럼 없이 메타데이터에서 다룰 예정 — 현재는 null
            publishedAt: null,
            savedAt: link.createdAt,
            status: link.aiSummaryStatus,
            // 태그·연관 링크는 이번 범위 밖 — 자리만 채워 둔다.
            tags: [],
            aiSummary: link.aiSummary,
            memo: link.memo,
            relatedLinks: [],
        }
    }

    async update(userId: number, linkId: number, input: UpdateLinkInput) {
        await this.getOwnedLink(userId, linkId)

        const patch: Partial<typeof links.$inferInsert> = {
            updatedAt: new Date(),
        }

        if (input.folderId) {
            await this.assertOwnedFolder(userId, input.folderId)
        }

        if (input.folderId !== undefined) {
            patch.folderId = input.folderId
        }

        if (input.memo !== undefined) {
            patch.memo = input.memo
        }

        const [row] = await this.db
            .update(links)
            .set(patch)
            .where(and(eq(links.id, linkId), eq(links.userId, userId)))
            .returning()

        return {
            linkId: row.id,
            folderId: row.folderId,
            memo: row.memo,
            updatedAt: row.updatedAt,
        }
    }

    async remove(userId: number, linkId: number) {
        await this.getOwnedLink(userId, linkId)

        // "최근 삭제된 항목"으로 이동 (30일 유예 후 영구 삭제 — 배치는 추후)
        await this.db
            .update(links)
            .set({ deletedAt: new Date(), updatedAt: new Date() })
            .where(and(eq(links.id, linkId), eq(links.userId, userId)))
    }

    async restore(userId: number, linkId: number) {
        // 삭제된 링크도 대상이므로 includeDeleted로 조회
        const link = await this.getOwnedLink(userId, linkId, {
            includeDeleted: true,
        })

        // 활성 링크에 복구를 호출하면 폴더가 미분류로 날아가므로 거부한다.
        if (!link.deletedAt) {
            throw new LinkNotDeletedException()
        }

        // 복구된 링크는 "미분류"로 복원
        const [row] = await this.db
            .update(links)
            .set({ deletedAt: null, folderId: null, updatedAt: new Date() })
            .where(and(eq(links.id, linkId), eq(links.userId, userId)))
            .returning()

        return {
            linkId: row.id,
            folderId: null,
            restoredAt: row.updatedAt,
        }
    }

    async search(userId: number, input: SearchLinkInput) {
        const keyword = `%${input.q}%`
        // 검색 대상: title, domain, original_url, final_url, ai_summary, memo
        const conditions = [
            eq(links.userId, userId),
            isNull(links.deletedAt),
            or(
                ilike(links.title, keyword),
                ilike(links.domain, keyword),
                ilike(links.originalUrl, keyword),
                ilike(links.finalUrl, keyword),
                ilike(links.aiSummary, keyword),
                ilike(links.memo, keyword),
            ),
        ]

        if (input.folderId) {
            conditions.push(eq(links.folderId, input.folderId))
        }

        const rows = await this.db
            .select()
            .from(links)
            .where(and(...conditions))
            .orderBy(desc(links.createdAt))

        return {
            results: rows.map((row) => ({
                linkId: row.id,
                title: row.title,
                source: row.domain,
                thumbnailUrl: pickThumbnailUrl(row.metadata),
                savedAt: row.createdAt,
            })),
            totalCount: rows.length,
        }
    }

    // 시스템 폴더(전체/미분류/최근삭제)의 링크 수를 한 번에 계산한다.
    async getSystemFolderCounts(userId: number) {
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

    // 사용자의 폴더별 활성 링크 수를 folderId → count 맵으로 반환한다. (미분류는 제외)
    async countActiveByFolder(userId: number): Promise<Map<number, number>> {
        const rows = await this.db
            .select({ folderId: links.folderId, linkCount: count(links.id) })
            .from(links)
            .where(and(eq(links.userId, userId), isNull(links.deletedAt)))
            .groupBy(links.folderId)

        return new Map(
            rows
                .filter((row) => row.folderId !== null)
                .map((row) => [row.folderId as number, row.linkCount]),
        )
    }

    // 특정 폴더에 속한 활성 링크 목록을 최신순으로 조회한다.
    async listByFolder(userId: number, folderId: number) {
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

        return rows.map((row) => ({
            linkId: row.id,
            title: row.title,
            thumbnailUrl: pickThumbnailUrl(row.metadata),
            savedAt: row.createdAt,
        }))
    }

    // 조건에 맞는 링크 수를 센다. (시스템 폴더 카운트용)
    private async countLinks(...conditions: SQL[]): Promise<number> {
        const [row] = await this.db
            .select({ value: count() })
            .from(links)
            .where(and(...conditions))

        return row.value
    }

    // 링크에 연결된 폴더 참조를 조회한다. 폴더가 없으면 null.
    private async findFolderRef(folderId: number | null) {
        if (!folderId) {
            return null
        }

        const [row] = await this.db
            .select()
            .from(folders)
            .where(eq(folders.id, folderId))
            .limit(1)

        return row ? { folderId: row.id, folderName: row.name } : null
    }

    // 링크 소유권을 확인하고, 없거나 타 사용자 소유면 404로 처리한다.
    private async getOwnedLink(
        userId: number,
        linkId: number,
        options: { includeDeleted?: boolean } = {},
    ): Promise<LinkRow> {
        const conditions = [eq(links.id, linkId), eq(links.userId, userId)]

        if (!options.includeDeleted) {
            conditions.push(isNull(links.deletedAt))
        }

        const [row] = await this.db
            .select()
            .from(links)
            .where(and(...conditions))
            .limit(1)

        if (!row) {
            throw new LinkNotFoundException()
        }

        return row
    }

    // 같은 사용자가 이미 저장한(삭제되지 않은) 동일 URL(정규화 기준)이 있으면 중복 저장을 막는다.
    private async assertNotDuplicated(userId: number, normalizedUrl: string) {
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

        if (row) {
            throw new LinkAlreadyExistsException()
        }
    }

    private async assertOwnedFolder(userId: number, folderId: number) {
        const [row] = await this.db
            .select({ id: folders.id })
            .from(folders)
            .where(and(eq(folders.id, folderId), eq(folders.userId, userId)))
            .limit(1)

        if (!row) {
            throw new FolderNotFoundException()
        }
    }
}
