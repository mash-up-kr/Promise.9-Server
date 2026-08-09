import { Injectable } from '@nestjs/common'
import { and, count, eq, isNull, max, sql } from 'drizzle-orm'

import { DatabaseService } from '../../config/database/database.service'
import { folders } from '../folder/folder.schema'
import { links } from '../link/link.schema'
import { tags } from '../link/tag.schema'

import { RecommendationAggregate } from './recommendation.type'

@Injectable()
export class RecommendationRepository {
    constructor(private readonly databaseService: DatabaseService) {}

    private get db() {
        return this.databaseService.db
    }

    async findCandidates(userId: number): Promise<RecommendationAggregate[]> {
        const [folderRows, tagRows] = await Promise.all([
            this.findFolderCandidates(userId),
            this.findTagCandidates(userId),
        ])

        return [
            ...folderRows.map((row): RecommendationAggregate => ({
                type: 'folder',
                key: `folder:${row.folderId}`,
                label: row.label,
                linkCount: row.linkCount,
                lastViewedAt: row.lastViewedAt,
                folderId: row.folderId,
                color: row.color,
            })),
            ...tagRows.map((row): RecommendationAggregate => ({
                type: 'tag',
                key: `tag:${row.normalizedTag}`,
                label: row.label,
                linkCount: row.linkCount,
                lastViewedAt: row.lastViewedAt,
                normalizedTag: row.normalizedTag,
            })),
        ]
    }

    private findFolderCandidates(userId: number) {
        return this.db
            .select({
                folderId: folders.id,
                label: folders.name,
                color: folders.color,
                linkCount: count(links.id),
                lastViewedAt: max(links.viewedAt),
            })
            .from(folders)
            .innerJoin(
                links,
                and(
                    eq(links.folderId, folders.id),
                    eq(links.userId, folders.userId),
                    isNull(links.deletedAt),
                ),
            )
            .where(and(eq(folders.userId, userId), isNull(folders.deletedAt)))
            .groupBy(folders.id, folders.name, folders.color)
    }

    private findTagCandidates(userId: number) {
        return this.db
            .select({
                normalizedTag: tags.normalizedName,
                label: sql<string>`min(${tags.name})`,
                linkCount: count(links.id),
                lastViewedAt: max(links.viewedAt),
            })
            .from(tags)
            .innerJoin(
                links,
                and(eq(links.id, tags.linkId), eq(links.userId, tags.userId)),
            )
            .where(
                and(
                    eq(tags.userId, userId),
                    eq(links.userId, userId),
                    isNull(links.deletedAt),
                ),
            )
            .groupBy(tags.normalizedName)
    }
}
