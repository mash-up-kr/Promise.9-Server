import { socialLoginSchema } from './auth.dto'

describe('socialLoginSchema', () => {
    it('Apple 로그인에는 authorizationCode를 요구한다', () => {
        const result = socialLoginSchema.safeParse({
            provider: 'apple',
            idToken: 'apple-id-token',
        })

        expect(result.success).toBe(false)
        if (!result.success) {
            expect(result.error.issues).toEqual(
                expect.arrayContaining([
                    expect.objectContaining({ path: ['authorizationCode'] }),
                ]),
            )
        }
    })

    it('Apple authorizationCode와 선택 redirectUri를 허용한다', () => {
        expect(
            socialLoginSchema.safeParse({
                provider: 'apple',
                idToken: 'apple-id-token',
                authorizationCode: 'apple-authorization-code',
                redirectUri: 'https://example.com/oauth/apple/callback',
            }).success,
        ).toBe(true)
    })

    it('다른 provider에는 authorizationCode를 요구하지 않는다', () => {
        expect(
            socialLoginSchema.safeParse({
                provider: 'google',
                idToken: 'google-id-token',
            }).success,
        ).toBe(true)
    })
})
