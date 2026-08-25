import {
    calculateSearchSignals,
    queryTokenCoverage,
    rankSearchCandidates,
    SearchRankingCandidate,
} from './search-ranking'
import { SEARCH_RANKING_WEIGHTS } from './search-ranking.constant'

describe('rankSearchCandidates', () => {
    it('undefined로 생략한 신호는 0으로 두고 가중치를 재분배하지 않는다', () => {
        const [result] = rankSearchCandidates([
            { id: 1, signals: { titleKeyword: 1 } },
        ])

        expect(result).toEqual({
            id: 1,
            score: SEARCH_RANKING_WEIGHTS.titleKeyword,
        })
    })

    it('null인 embedding 가중치는 제외하고 lexical 가중치를 재정규화한다', () => {
        const [result] = rankSearchCandidates([
            {
                id: 1,
                signals: {
                    titleKeyword: 1,
                    tagKeyword: 0,
                    contentKeyword: 0,
                    embedding: null,
                },
            },
        ])

        expect(result.score).toBeCloseTo(
            SEARCH_RANKING_WEIGHTS.titleKeyword /
                (1 - SEARCH_RANKING_WEIGHTS.embedding),
        )
    })

    it('계산된 embedding 0은 결측값이 아니라 비유사 점수로 반영한다', () => {
        const [result] = rankSearchCandidates([
            {
                id: 1,
                signals: {
                    titleKeyword: 1,
                    tagKeyword: 0,
                    contentKeyword: 0,
                    embedding: 0,
                },
            },
        ])

        expect(result.score).toBe(SEARCH_RANKING_WEIGHTS.titleKeyword)
    })

    it('모든 원점수를 0..1로 보정한 뒤 가중합한다', () => {
        const [result] = rankSearchCandidates([
            {
                id: 1,
                signals: {
                    titleKeyword: 1.5,
                    tagKeyword: -1,
                    contentKeyword: Number.NaN,
                    embedding: 0.5,
                },
            },
        ])

        expect(result.score).toBe(
            SEARCH_RANKING_WEIGHTS.titleKeyword +
                SEARCH_RANKING_WEIGHTS.embedding * 0.5,
        )
    })

    it('점수 내림차순, 동점이면 id 내림차순으로 결정적으로 정렬한다', () => {
        const candidates: SearchRankingCandidate[] = [
            { id: 1, signals: { titleKeyword: 0.4 } },
            { id: 3, signals: { titleKeyword: 0.8 } },
            { id: 2, signals: { titleKeyword: 0.8 } },
        ]

        const result = rankSearchCandidates(candidates)

        expect(result.map(({ id }) => id)).toEqual([3, 2, 1])
        expect(candidates.map(({ id }) => id)).toEqual([1, 3, 2])
    })
})
describe('search keyword signals', () => {
    it('검색어 토큰 중 필드가 포함한 비율을 계산한다', () => {
        expect(
            queryTokenCoverage('NestJS 인증', 'NestJS 인증과 인가 실무 가이드'),
        ).toBe(1)
        expect(queryTokenCoverage('NestJS 인증', 'NestJS 백엔드')).toBe(0.5)
    })

    it('공백 차이와 영문 부분일치를 후보 검색과 같이 인정한다', () => {
        expect(queryTokenCoverage('머신러닝', '머신 러닝 입문')).toBe(1)
        expect(queryTokenCoverage('nest', 'NestJS 인증 가이드')).toBe(1)
    })

    it('후보 SQL과 같이 공백만 제거하고 구두점 경계는 유지한다', () => {
        expect(queryTokenCoverage('designsystem', 'design-system')).toBe(0)
        expect(queryTokenCoverage('design system', 'design-system')).toBe(1)
    })

    it('후보 SQL과 같이 호환 문자를 NFKC로 합치지 않는다', () => {
        expect(queryTokenCoverage('ＮｅｓｔＪＳ', 'ＮｅｓｔＪＳ')).toBe(1)
        expect(queryTokenCoverage('NestJS', 'ＮｅｓｔＪＳ')).toBe(0)
    })

    it('서로 다른 태그의 경계를 합쳐 일치시키지 않는다', () => {
        expect(
            calculateSearchSignals('designsystem', {
                tags: ['design', 'system'],
            }).tagKeyword,
        ).toBe(0)
        expect(
            calculateSearchSignals('design system', {
                tags: ['design', 'system'],
            }).tagKeyword,
        ).toBe(1)
    })

    it('제목·태그·본문·임베딩 원점수를 분리한다', () => {
        expect(
            calculateSearchSignals('NestJS 인증', {
                title: 'NestJS 가이드',
                tags: ['인증', '백엔드'],
                content: 'JWT 인증 예제',
                embeddingSimilarity: 0.75,
            }),
        ).toEqual({
            titleKeyword: 0.5,
            tagKeyword: 0.5,
            contentKeyword: 0.5,
            embedding: 0.75,
        })
    })

    it('저장된 embedding이 없으면 계산 불가 신호를 null로 유지한다', () => {
        expect(
            calculateSearchSignals('NestJS', {
                title: 'NestJS 가이드',
                embeddingSimilarity: null,
            }),
        ).toEqual({
            titleKeyword: 1,
            tagKeyword: 0,
            contentKeyword: 0,
            embedding: null,
        })
    })
})
