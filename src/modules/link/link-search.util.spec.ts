import { scoreSearchCandidates } from './link-search.util'

describe('scoreSearchCandidates', () => {
    it('벡터 유사도와 키워드 가산점을 합쳐 내림차순으로 정렬한다', () => {
        const result = scoreSearchCandidates(
            [
                { id: 1, score: 0.8 },
                { id: 2, score: 0.6 },
            ],
            [2, 3],
            3,
        )

        expect(result.map(({ id }) => id)).toEqual([2, 1, 3])
        expect(result[0].score).toBeCloseTo(0.9)
        expect(result[1].score).toBeCloseTo(0.8)
        expect(result[2].score).toBeCloseTo(0.3)
    })

    it('점수를 1로 제한하고 요청한 개수만 반환한다', () => {
        expect(scoreSearchCandidates([{ id: 1, score: 0.9 }], [1], 1)).toEqual([
            { id: 1, score: 1 },
        ])
    })
})
