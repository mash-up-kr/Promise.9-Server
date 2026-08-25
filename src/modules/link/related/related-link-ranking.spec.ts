import { describe, expect, it } from 'bun:test'

import { RELATED_LINK_RANKING_WEIGHTS } from './related-link.constant'
import {
    calculateRelatedLinkSignals,
    rankRelatedLinkCandidates,
} from './related-link-ranking'

describe('rankRelatedLinkCandidates', () => {
    it('관련 링크 신호에 독립 기본 가중치를 적용한다', () => {
        const [result] = rankRelatedLinkCandidates([
            {
                id: 1,
                signals: {
                    folder: 1,
                    tag: 0.5,
                    title: 0.25,
                    embedding: 0.75,
                },
            },
        ])

        expect(result.score).toBeCloseTo(
            RELATED_LINK_RANKING_WEIGHTS.folder +
                RELATED_LINK_RANKING_WEIGHTS.tag * 0.5 +
                RELATED_LINK_RANKING_WEIGHTS.title * 0.25 +
                RELATED_LINK_RANKING_WEIGHTS.embedding * 0.75,
        )
    })

    it('undefined로 생략한 신호는 0점으로 계산한다', () => {
        const [result] = rankRelatedLinkCandidates([
            { id: 1, signals: { folder: 1 } },
        ])

        expect(result.score).toBe(RELATED_LINK_RANKING_WEIGHTS.folder)
    })

    it('embedding을 계산할 수 없으면 context 가중치만 재정규화한다', () => {
        const [result] = rankRelatedLinkCandidates([
            {
                id: 1,
                signals: {
                    folder: 1,
                    tag: 0,
                    title: 0,
                    embedding: null,
                },
            },
        ])

        expect(result.score).toBeCloseTo(
            RELATED_LINK_RANKING_WEIGHTS.folder /
                (1 - RELATED_LINK_RANKING_WEIGHTS.embedding),
        )
    })
})

describe('calculateRelatedLinkSignals', () => {
    it('폴더 일치, 태그·제목 Jaccard, 임베딩 유사도를 계산한다', () => {
        expect(
            calculateRelatedLinkSignals(
                {
                    folderId: 7,
                    tags: ['NestJS', '인증'],
                    title: 'NestJS JWT 인증',
                },
                {
                    folderId: 7,
                    tags: ['nestjs', '백엔드'],
                    title: 'NestJS 인증 가이드',
                    embeddingSimilarity: 0.8,
                },
            ),
        ).toEqual({
            folder: 1,
            tag: 1 / 3,
            title: 0.5,
            embedding: 0.8,
        })
    })

    it('두 링크 모두 미분류여도 같은 폴더 점수를 주지 않는다', () => {
        expect(
            calculateRelatedLinkSignals(
                { folderId: null },
                { folderId: null, embeddingSimilarity: null },
            ),
        ).toEqual({
            folder: 0,
            tag: 0,
            title: 0,
            embedding: null,
        })
    })
})
