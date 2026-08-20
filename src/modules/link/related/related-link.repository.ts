import { Injectable } from '@nestjs/common'
import {
    and,
    asc,
    cosineDistance,
    count,
    desc,
    eq,
    inArray,
    isNotNull,
    isNull,
    ne,
    or,
    SQL,
    sql,
} from 'drizzle-orm'

import { DatabaseService } from '../../../config/database/database.service'
import { LinkRow, links, normalizedSearchText } from '../link.schema'
import { tags } from '../tag.schema'

export type RelatedLinkCandidate = Pick<
    LinkRow,
    'id' | 'folderId' | 'title' | 'domain' | 'metadata'
> & {
    normalizedTags: string[]
    embeddingSimilarity: number | null
}

type RelatedLinkCandidateOptions = {
    limit: number
    excludeLinkId: number
}

@Injectable()
export class RelatedLinkRepository {
    constructor(private readonly databaseService: DatabaseService) {}

    private get db() {
        return this.databaseService.db
    }

    async findVectorCandidateIds(
        userId: number,
        comparisonEmbedding: number[],
        options: RelatedLinkCandidateOptions,
    ): Promise<number[]> {
        const distance = cosineDistance(links.embedding, comparisonEmbedding)
        const rows = await this.db
            .select({ id: links.id })
            .from(links)
            .where(
                and(
                    ...this.buildCandidateConditions(userId, options),
                    isNotNull(links.embedding),
                ),
            )
            .orderBy(distance, desc(links.id))
            .limit(options.limit)

        return rows.map((row) => row.id)
    }

    async findTitleCandidateIds(
        userId: number,
        tokens: readonly string[],
        options: RelatedLinkCandidateOptions,
    ): Promise<number[]> {
        const searchText = normalizedSearchText([links.title])
        const keyword = this.buildTokenKeywordCondition(searchText, tokens)

        if (!keyword) return []

        const matchCount = this.buildTokenMatchCount(searchText, tokens)
        const rows = await this.db
            .select({ id: links.id })
            .from(links)
            .where(
                and(...this.buildCandidateConditions(userId, options), keyword),
            )
            .orderBy(
                ...(matchCount ? [desc(matchCount)] : []),
                desc(links.createdAt),
                desc(links.id),
            )
            .limit(options.limit)

        return rows.map((row) => row.id)
    }

    async findFolderCandidateIds(
        userId: number,
        folderId: number | null,
        options: RelatedLinkCandidateOptions,
    ): Promise<number[]> {
        if (folderId === null) return []

        const rows = await this.db
            .select({ id: links.id })
            .from(links)
            .where(
                and(
                    ...this.buildCandidateConditions(userId, options),
                    eq(links.folderId, folderId),
                ),
            )
            .orderBy(desc(links.createdAt), desc(links.id))
            .limit(options.limit)

        return rows.map((row) => row.id)
    }

    async findExactTagCandidateIds(
        userId: number,
        normalizedTags: readonly string[],
        options: RelatedLinkCandidateOptions,
    ): Promise<number[]> {
        if (normalizedTags.length === 0) return []

        const rows = await this.db
            .select({ id: tags.linkId })
            .from(tags)
            .innerJoin(
                links,
                and(eq(links.id, tags.linkId), eq(links.userId, tags.userId)),
            )
            .where(
                and(
                    eq(tags.userId, userId),
                    ...this.buildCandidateConditions(userId, options),
                    inArray(tags.normalizedName, [...normalizedTags]),
                ),
            )
            .groupBy(tags.linkId)
            .orderBy(desc(count(tags.id)), desc(tags.linkId))
            .limit(options.limit)

        return rows.map((row) => row.id)
    }

    async findCandidates(
        userId: number,
        ids: readonly number[],
        comparisonEmbedding: number[] | null,
    ): Promise<RelatedLinkCandidate[]> {
        if (ids.length === 0) return []

        const embeddingSimilarity = comparisonEmbedding
            ? sql<number | null>`case
                when ${links.embedding} is null then null
                else 1 - (${cosineDistance(links.embedding, comparisonEmbedding)})
              end`
            : sql<number | null>`null`
        const rows = await this.db
            .select({
                id: links.id,
                folderId: links.folderId,
                title: links.title,
                domain: links.domain,
                metadata: links.metadata,
                embeddingSimilarity,
            })
            .from(links)
            .where(
                and(
                    eq(links.userId, userId),
                    isNull(links.deletedAt),
                    inArray(links.id, [...ids]),
                ),
            )

        if (rows.length === 0) return []

        const activeIds = rows.map((row) => row.id)
        const tagRows = await this.db
            .select({ linkId: tags.linkId, name: tags.normalizedName })
            .from(tags)
            .where(
                and(eq(tags.userId, userId), inArray(tags.linkId, activeIds)),
            )
            .orderBy(asc(tags.sortOrder), asc(tags.id))
        const tagsByLinkId = new Map<number, string[]>()

        for (const tag of tagRows) {
            const linkTags = tagsByLinkId.get(tag.linkId) ?? []
            linkTags.push(tag.name)
            tagsByLinkId.set(tag.linkId, linkTags)
        }

        return rows.map((row) => ({
            ...row,
            normalizedTags: tagsByLinkId.get(row.id) ?? [],
        }))
    }

    private buildCandidateConditions(
        userId: number,
        options: RelatedLinkCandidateOptions,
    ): SQL[] {
        return [
            eq(links.userId, userId),
            isNull(links.deletedAt),
            ne(links.id, options.excludeLinkId),
        ]
    }

    private buildTokenKeywordCondition(
        searchText: SQL<string>,
        tokens: readonly string[],
    ): SQL | undefined {
        const uniqueTokens = [...new Set(tokens.filter(Boolean))]
        if (uniqueTokens.length === 0) return undefined

        return or(
            ...uniqueTokens.map(
                (token) => sql`${searchText} like ${`%${token}%`}`,
            ),
        )
    }

    private buildTokenMatchCount(
        searchText: SQL<string>,
        tokens: readonly string[],
    ): SQL<number> | undefined {
        const uniqueTokens = [...new Set(tokens.filter(Boolean))]
        if (uniqueTokens.length === 0) return undefined

        return sql<number>`(${sql.join(
            uniqueTokens.map(
                (token) =>
                    sql`case when ${searchText} like ${`%${token}%`} then 1 else 0 end`,
            ),
            sql.raw(' + '),
        )})`
    }
}
