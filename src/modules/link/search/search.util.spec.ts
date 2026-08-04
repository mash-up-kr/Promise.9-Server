import { encodeCursor } from '../../../common/pagination/cursor'

import {
    parseSearchCursor,
    scoreSearchCandidates,
    takeSearchPage,
    toSearchCursorPayload,
} from './search.util'

describe('scoreSearchCandidates', () => {
    it('벡터 유사도와 키워드 가산점을 합쳐 내림차순으로 정렬한다', () => {
        const result = scoreSearchCandidates(
            [
                { id: 1, score: 0.8 },
                { id: 2, score: 0.6 },
            ],
            [2, 3],
        )

        expect(result.map(({ id }) => id)).toEqual([2, 1, 3])
        expect(result[0].score).toBeCloseTo(0.9)
        expect(result[1].score).toBeCloseTo(0.8)
        expect(result[2].score).toBeCloseTo(0.3)
    })

    it('점수를 1로 제한한다', () => {
        expect(scoreSearchCandidates([{ id: 1, score: 0.9 }], [1])).toEqual([
            { id: 1, score: 1 },
        ])
    })

    it('후보를 자르지 않고 전체를 반환한다', () => {
        const result = scoreSearchCandidates(
            [
                { id: 1, score: 0.8 },
                { id: 2, score: 0.6 },
            ],
            [3],
        )

        expect(result).toHaveLength(3)
    })

    it('점수가 같으면 id 내림차순으로 정렬한다', () => {
        const result = scoreSearchCandidates(
            [
                { id: 1, score: 0.5 },
                { id: 3, score: 0.5 },
                { id: 2, score: 0.5 },
            ],
            [],
        )

        expect(result.map(({ id }) => id)).toEqual([3, 2, 1])
    })

    it('점수를 소수점 5자리로 반올림한다', () => {
        const [candidate] = scoreSearchCandidates(
            [{ id: 1, score: 0.123456789 }],
            [],
        )

        expect(candidate.score).toBe(0.12346)
    })
})

describe('takeSearchPage', () => {
    const candidates = [
        { id: 5, score: 0.9 },
        { id: 4, score: 0.7 },
        { id: 3, score: 0.7 },
        { id: 2, score: 0.5 },
    ]

    it('커서가 없으면 앞에서 limit + 1개를 반환한다', () => {
        expect(takeSearchPage(candidates, undefined, 2)).toEqual([
            { id: 5, score: 0.9 },
            { id: 4, score: 0.7 },
            { id: 3, score: 0.7 },
        ])
    })

    it('커서 이후 후보만 반환한다', () => {
        expect(takeSearchPage(candidates, { score: 0.9, id: 5 }, 2)).toEqual([
            { id: 4, score: 0.7 },
            { id: 3, score: 0.7 },
            { id: 2, score: 0.5 },
        ])
    })

    it('점수가 같은 구간에서도 id로 이어받아 중복·누락이 없다', () => {
        expect(takeSearchPage(candidates, { score: 0.7, id: 4 }, 2)).toEqual([
            { id: 3, score: 0.7 },
            { id: 2, score: 0.5 },
        ])
    })

    it('마지막 후보 이후면 빈 배열을 반환한다', () => {
        expect(takeSearchPage(candidates, { score: 0.5, id: 2 }, 2)).toEqual([])
    })
})

describe('parseSearchCursor', () => {
    it('인코딩한 검색 커서를 정렬 키로 되돌린다', () => {
        const cursor = encodeCursor(
            toSearchCursorPayload({ id: 7, score: 0.8 }),
        )

        expect(parseSearchCursor(cursor)).toEqual({ score: 0.8, id: 7 })
    })

    it('점수가 아닌 커서 값은 null을 반환한다', () => {
        const listCursor = encodeCursor({
            v: '2026-07-12T03:20:00.000Z',
            id: 41,
        })

        expect(parseSearchCursor(listCursor)).toBeNull()
    })

    it('정렬 값이 null인 커서는 null을 반환한다', () => {
        expect(parseSearchCursor(encodeCursor({ v: null, id: 41 }))).toBeNull()
    })

    it('형식이 어긋난 커서는 null을 반환한다', () => {
        expect(parseSearchCursor('not-a-cursor')).toBeNull()
    })
})
