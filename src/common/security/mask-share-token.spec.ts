import { maskShareToken } from './mask-share-token'

describe('maskShareToken', () => {
    it('공유 폴더 경로의 토큰을 가린다', () => {
        expect(maskShareToken('/api/v1/shared-folders/abcDEF123_-xyz')).toBe(
            '/api/v1/shared-folders/***',
        )
    })

    it('쿼리 문자열은 그대로 두고 토큰만 가린다', () => {
        expect(
            maskShareToken('/api/v1/shared-folders/abc123?cursor=x&limit=20'),
        ).toBe('/api/v1/shared-folders/***?cursor=x&limit=20')
    })

    it('토큰 뒤에 경로가 더 있어도 토큰 구간만 가린다', () => {
        expect(maskShareToken('/api/v1/shared-folders/abc123/links')).toBe(
            '/api/v1/shared-folders/***/links',
        )
    })

    it('공유 폴더와 관계없는 주소는 바꾸지 않는다', () => {
        expect(maskShareToken('/api/v1/folders/3/share')).toBe(
            '/api/v1/folders/3/share',
        )
    })
})
