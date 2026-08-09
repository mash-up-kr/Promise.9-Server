import { Injectable } from '@nestjs/common'

import { LinkRow } from '../link.schema'
import { pickThumbnailUrl } from '../link.util'
import { tokenizeLinkText } from '../link-similarity.util'

import {
    DEFAULT_RELATED_LINK_LIMIT,
    RELATED_LINK_CONTEXT_CANDIDATE_LIMIT,
    RELATED_LINK_TITLE_TOKEN_LIMIT,
    RELATED_LINK_VECTOR_CANDIDATE_LIMIT,
} from './related-link.constant'
import {
    RelatedLinkCandidate,
    RelatedLinkRepository,
} from './related-link.repository'
import {
    calculateRelatedLinkSignals,
    RankedRelatedLinkCandidate,
    rankRelatedLinkCandidates,
} from './related-link-ranking'

export type RelatedLinkSource = Pick<
    LinkRow,
    'id' | 'folderId' | 'title' | 'embedding'
> & {
    normalizedTags: string[]
}

type RelatedLinkRankingResult = {
    candidates: RelatedLinkCandidate[]
    ranked: RankedRelatedLinkCandidate[]
}

@Injectable()
export class RelatedLinkService {
    constructor(
        private readonly relatedLinkRepository: RelatedLinkRepository,
    ) {}

    async relatedLinks(
        userId: number,
        source: RelatedLinkSource,
        limit = DEFAULT_RELATED_LINK_LIMIT,
    ) {
        const { candidates, ranked } = await this.rankRelated(userId, source)
        const candidateById = new Map(
            candidates.map((candidate) => [candidate.id, candidate]),
        )

        return ranked.slice(0, limit).flatMap((rankedCandidate) => {
            const candidate = candidateById.get(rankedCandidate.id)

            return candidate
                ? [
                      {
                          linkId: candidate.id,
                          title:
                              candidate.title ??
                              candidate.domain ??
                              '제목 없는 링크',
                          thumbnailUrl: pickThumbnailUrl(candidate.metadata),
                      },
                  ]
                : []
        })
    }

    private async rankRelated(
        userId: number,
        source: RelatedLinkSource,
    ): Promise<RelatedLinkRankingResult> {
        const contextCandidateOptions = {
            limit: RELATED_LINK_CONTEXT_CANDIDATE_LIMIT,
            excludeLinkId: source.id,
        }
        const vectorCandidateOptions = {
            limit: RELATED_LINK_VECTOR_CANDIDATE_LIMIT,
            excludeLinkId: source.id,
        }
        const [folderIds, tagIds, titleIds, vectorIds] = await Promise.all([
            this.relatedLinkRepository.findFolderCandidateIds(
                userId,
                source.folderId,
                contextCandidateOptions,
            ),
            this.relatedLinkRepository.findExactTagCandidateIds(
                userId,
                source.normalizedTags,
                contextCandidateOptions,
            ),
            this.relatedLinkRepository.findTitleCandidateIds(
                userId,
                this.candidateTokens(source.title),
                contextCandidateOptions,
            ),
            source.embedding
                ? this.relatedLinkRepository.findVectorCandidateIds(
                      userId,
                      source.embedding,
                      vectorCandidateOptions,
                  )
                : [],
        ])
        const candidates = await this.relatedLinkRepository.findCandidates(
            userId,
            this.unionIds(folderIds, tagIds, titleIds, vectorIds),
            source.embedding,
        )
        const ranked = rankRelatedLinkCandidates(
            candidates.map((candidate) => ({
                id: candidate.id,
                signals: calculateRelatedLinkSignals(
                    {
                        folderId: source.folderId,
                        tags: source.normalizedTags,
                        title: source.title,
                    },
                    {
                        folderId: candidate.folderId,
                        tags: candidate.normalizedTags,
                        title: candidate.title,
                        embeddingSimilarity: candidate.embeddingSimilarity,
                    },
                ),
            })),
        )

        return { candidates, ranked }
    }

    private candidateTokens(text: string | null): string[] {
        return [...new Set(tokenizeLinkText(text))].slice(
            0,
            RELATED_LINK_TITLE_TOKEN_LIMIT,
        )
    }

    private unionIds(...groups: readonly number[][]): number[] {
        return [...new Set(groups.flat())]
    }
}
