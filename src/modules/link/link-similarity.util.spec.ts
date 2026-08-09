import {
    jaccardSimilarity,
    normalizeCosineSimilarity,
    tagJaccardSimilarity,
    tokenizeLinkText,
    tokenJaccardSimilarity,
} from './link-similarity.util'

describe('tokenizeLinkText', () => {
    it('NFKC 정규화, 소문자 변환, 한글·영문·숫자 토큰화를 적용한다', () => {
        expect(tokenizeLinkText('ＮｅｓｔＪＳ와 한글 API-v2, AUTH!')).toEqual([
            'nestjs와',
            '한글',
            'api',
            'v2',
            'auth',
        ])
    })

    it('빈 값은 빈 토큰 목록으로 처리한다', () => {
        expect(tokenizeLinkText(undefined)).toEqual([])
        expect(tokenizeLinkText('')).toEqual([])
    })
})

describe('link similarity', () => {
    it('중복을 제거한 교집합/합집합 비율을 계산한다', () => {
        expect(jaccardSimilarity(['a', 'a', 'b'], ['b', 'c'])).toBeCloseTo(
            1 / 3,
        )
    })

    it('한쪽이라도 비어 있으면 Jaccard 유사도 0을 반환한다', () => {
        expect(jaccardSimilarity([], [])).toBe(0)
        expect(jaccardSimilarity(['a'], undefined)).toBe(0)
    })

    it('제목 토큰에 정규화된 Jaccard를 적용한다', () => {
        expect(
            tokenJaccardSimilarity('NESTJS 인증 가이드', 'nestjs 인증 실전'),
        ).toBeCloseTo(0.5)
    })

    it('태그의 대소문자와 호환 문자를 정규화한다', () => {
        expect(
            tagJaccardSimilarity(
                ['ＮｅｓｔＪＳ', 'Backend'],
                ['nestjs', 'backend'],
            ),
        ).toBe(1)
    })

    it('다단어 태그를 단어로 쪼개지 않고 태그명 단위로 비교한다', () => {
        expect(
            tagJaccardSimilarity(
                ['access control', 'NestJS'],
                ['access', 'nestjs'],
            ),
        ).toBeCloseTo(1 / 3)
    })
})

describe('cosine similarity normalization', () => {
    it('DB 코사인 유사도의 누락·NaN을 0으로 처리한다', () => {
        expect(normalizeCosineSimilarity(undefined)).toBe(0)
        expect(normalizeCosineSimilarity(Number.NaN)).toBe(0)
    })

    it('DB 코사인 유사도의 범위 밖 값을 0..1로 제한한다', () => {
        expect(normalizeCosineSimilarity(-1)).toBe(0)
        expect(normalizeCosineSimilarity(0.75)).toBe(0.75)
        expect(normalizeCosineSimilarity(2)).toBe(1)
        expect(normalizeCosineSimilarity(Number.POSITIVE_INFINITY)).toBe(1)
    })
})
