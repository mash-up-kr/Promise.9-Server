import {
    normalizeCosineSimilarity,
    tokenizeLinkText,
} from './link-similarity.util'

describe('tokenizeLinkText', () => {
    it('소문자 변환과 Unicode 문자·숫자 토큰화를 적용한다', () => {
        expect(tokenizeLinkText('ＮｅｓｔＪＳ와 한글 API-v2, AUTH!')).toEqual([
            'ｎｅｓｔｊｓ와',
            '한글',
            'api',
            'v2',
            'auth',
        ])
    })

    it('호환 문자를 NFKC로 합치지 않고 원래 문자 체계를 유지한다', () => {
        expect(tokenizeLinkText('ＮｅｓｔＪＳ')).toEqual(['ｎｅｓｔｊｓ'])
        expect(tokenizeLinkText('NestJS')).toEqual(['nestjs'])
    })

    it('빈 값은 빈 토큰 목록으로 처리한다', () => {
        expect(tokenizeLinkText(undefined)).toEqual([])
        expect(tokenizeLinkText('')).toEqual([])
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
