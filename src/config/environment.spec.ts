import { validateEnvironment } from './environment'

const baseEnvironment = {
    APP_ENV: 'development',
    DATABASE_URL_DEVELOPMENT: 'postgres://localhost:5432/promise9',
    JWT_ACCESS_SECRET: 'access-secret',
    JWT_REFRESH_SECRET: 'refresh-secret',
    GOOGLE_CLIENT_ID: 'google-client-id',
    KAKAO_CLIENT_ID: 'kakao-client-id',
    APPLE_CLIENT_ID: 'apple-client-id',
}

describe('validateEnvironment', () => {
    it('SES region 기본값을 적용한다', () => {
        const environment = validateEnvironment(baseEnvironment)

        expect(environment.EMAIL_SES_REGION).toBe('ap-northeast-2')
    })

    it('AWS access key와 secret key 중 하나만 설정하면 실패한다', () => {
        expect(() =>
            validateEnvironment({
                ...baseEnvironment,
                AWS_ACCESS_KEY_ID: 'access-key-id',
            }),
        ).toThrow(
            'AWS_ACCESS_KEY_ID와 AWS_SECRET_ACCESS_KEY는 함께 설정해야 합니다.',
        )
    })

    it('AWS 임시 자격 증명 세트를 허용한다', () => {
        const environment = validateEnvironment({
            ...baseEnvironment,
            AWS_ACCESS_KEY_ID: 'access-key-id',
            AWS_SECRET_ACCESS_KEY: 'secret-access-key',
            AWS_SESSION_TOKEN: 'session-token',
        })

        expect(environment).toMatchObject({
            AWS_ACCESS_KEY_ID: 'access-key-id',
            AWS_SECRET_ACCESS_KEY: 'secret-access-key',
            AWS_SESSION_TOKEN: 'session-token',
        })
    })
})
