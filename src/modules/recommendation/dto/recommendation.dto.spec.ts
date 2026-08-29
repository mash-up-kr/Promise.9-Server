import { recommendationQuerySchema } from './recommendation.dto'

describe('recommendationQuerySchema', () => {
    it('쿼리를 생략하면 기본 limit을 적용한다', () => {
        expect(recommendationQuerySchema.parse({})).toEqual({
            limit: 12,
        })
    })

    it('정의하지 않은 쿼리 파라미터를 허용하지 않는다', () => {
        expect(() =>
            recommendationQuerySchema.parse({ sortBy: 'name' }),
        ).toThrow()
    })
})
