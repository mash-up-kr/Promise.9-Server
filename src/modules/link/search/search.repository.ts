import { Injectable } from '@nestjs/common'
import {
    and,
    asc,
    cosineDistance,
    desc,
    eq,
    inArray,
    isNotNull,
    isNull,
    or,
    SQL,
    sql,
} from 'drizzle-orm'

import { DatabaseService } from '../../../config/database/database.service'
import { ListLinksQueryInput } from '../dto/link.dto'
import { LinkRow, links, normalizedSearchText } from '../link.schema'
import { tags } from '../tag.schema'

export type SearchLinkCandidate = Pick<
    LinkRow,
    | 'id'
    | 'title'
    | 'domain'
    | 'originalUrl'
    | 'finalUrl'
    | 'aiSummary'
    | 'memo'
    | 'metadata'
    | 'createdAt'
> & {
    description: string | null
    tags: string[]
    embeddingSimilarity: number | null
}

type SearchCandidateOptions = {
    limit: number
    scope: ListLinksQueryInput
}

@Injectable()
export class SearchRepository {
    constructor(private readonly databaseService: DatabaseService) {}

    private get db() {
        return this.databaseService.db
    }

    async findVectorCandidateIds(
        userId: number,
        queryEmbedding: number[],
        options: SearchCandidateOptions,
    ): Promise<number[]> {
        const distance = cosineDistance(links.embedding, queryEmbedding)
        const rows = await this.db
            .select({ id: links.id })
            .from(links)
            .where(
                and(
                    ...this.buildScopeConditions(userId, options.scope),
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
        options: SearchCandidateOptions,
    ): Promise<number[]> {
        const searchText = normalizedSearchText([links.title])
        const keyword = this.buildTokenKeywordCondition(searchText, tokens)

        if (!keyword) return []

        const matchCount = this.buildTokenMatchCount(searchText, tokens)
        const rows = await this.db
            .select({ id: links.id })
            .from(links)
            .where(
                and(
                    ...this.buildScopeConditions(userId, options.scope),
                    keyword,
                ),
            )
            .orderBy(
                ...(matchCount ? [desc(matchCount)] : []),
                desc(links.createdAt),
                desc(links.id),
            )
            .limit(options.limit)

        return rows.map((row) => row.id)
    }

    async findTagKeywordCandidateIds(
        userId: number,
        tokens: readonly string[],
        options: SearchCandidateOptions,
    ): Promise<number[]> {
        const searchText = normalizedSearchText([tags.normalizedName])
        const keyword = this.buildTokenKeywordCondition(searchText, tokens)

        if (!keyword) return []

        const matchCount = this.buildGroupedTokenMatchCount(searchText, tokens)
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
                    ...this.buildScopeConditions(userId, options.scope),
                    keyword,
                ),
            )
            .groupBy(tags.linkId, links.createdAt)
            .orderBy(
                ...(matchCount ? [desc(matchCount)] : []),
                desc(links.createdAt),
                desc(tags.linkId),
            )
            .limit(options.limit)

        return rows.map((row) => row.id)
    }

    async findContentCandidateIds(
        userId: number,
        tokens: readonly string[],
        options: SearchCandidateOptions,
    ): Promise<number[]> {
        const searchText = normalizedSearchText([
            links.aiSummary,
            links.memo,
            links.domain,
            links.originalUrl,
            links.finalUrl,
            sql`${links.metadata}->>'description'`,
        ])
        const keyword = this.buildTokenKeywordCondition(searchText, tokens)

        if (!keyword) return []

        const matchCount = this.buildTokenMatchCount(searchText, tokens)
        const rows = await this.db
            .select({ id: links.id })
            .from(links)
            .where(
                and(
                    ...this.buildScopeConditions(userId, options.scope),
                    keyword,
                ),
            )
            .orderBy(
                ...(matchCount ? [desc(matchCount)] : []),
                desc(links.createdAt),
                desc(links.id),
            )
            .limit(options.limit)

        return rows.map((row) => row.id)
    }

    async findCandidates(
        userId: number,
        ids: readonly number[],
        queryEmbedding: number[] | null,
        scope: ListLinksQueryInput,
    ): Promise<SearchLinkCandidate[]> {
        if (ids.length === 0) return []

        const embeddingSimilarity = queryEmbedding
            ? sql<number | null>`case
                when ${links.embedding} is null then null
                else 1 - (${cosineDistance(links.embedding, queryEmbedding)})
              end`
            : sql<number | null>`null`
        const description = sql<
            string | null
        >`${links.metadata}->>'description'`
        const rows = await this.db
            .select({
                id: links.id,
                title: links.title,
                domain: links.domain,
                originalUrl: links.originalUrl,
                finalUrl: links.finalUrl,
                aiSummary: links.aiSummary,
                memo: links.memo,
                metadata: links.metadata,
                createdAt: links.createdAt,
                description,
                embeddingSimilarity,
            })
            .from(links)
            .where(
                and(
                    ...this.buildScopeConditions(userId, scope),
                    inArray(links.id, [...ids]),
                ),
            )

        if (rows.length === 0) return []

        const activeIds = rows.map((row) => row.id)
        const tagRows = await this.db
            .select({ linkId: tags.linkId, name: tags.name })
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
            tags: tagsByLinkId.get(row.id) ?? [],
        }))
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

    private buildGroupedTokenMatchCount(
        searchText: SQL<string>,
        tokens: readonly string[],
    ): SQL<number> | undefined {
        const uniqueTokens = [...new Set(tokens.filter(Boolean))]
        if (uniqueTokens.length === 0) return undefined

        return sql<number>`(${sql.join(
            uniqueTokens.map(
                (token) =>
                    sql`max(case when ${searchText} like ${`%${token}%`} then 1 else 0 end)`,
            ),
            sql.raw(' + '),
        )})`
    }

    private buildScopeConditions(
        userId: number,
        input: ListLinksQueryInput,
    ): SQL[] {
        const conditions: SQL[] = [
            eq(links.userId, userId),
            input.deleted
                ? isNotNull(links.deletedAt)
                : isNull(links.deletedAt),
        ]

        if (input.folderId) conditions.push(eq(links.folderId, input.folderId))
        if (input.unassigned) conditions.push(isNull(links.folderId))
        if (input.favorite) conditions.push(eq(links.isFavorite, true))

        return conditions
    }
}
