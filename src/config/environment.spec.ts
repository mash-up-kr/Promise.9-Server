import { validateDbEnvironment, validateEnvironment } from './environment'

const productionEnvironment = {
    APP_ENV: 'production',
    DATABASE_URL_PRODUCTION: 'postgres://user:password@db:5432/promise9',
    JWT_ACCESS_SECRET: 'access-secret',
    JWT_REFRESH_SECRET: 'refresh-secret',
    GOOGLE_CLIENT_ID: 'google-client-id',
    KAKAO_CLIENT_ID: 'kakao-client-id',
    APPLE_CLIENT_ID: 'apple-client-id',
    OPENAI_API_KEY: 'openai-api-key',
}

describe('validateEnvironment', () => {
    it('production 환경에서 OPENAI_API_KEY를 필수로 검증한다', () => {
        const { OPENAI_API_KEY: _, ...withoutOpenAiApiKey } =
            productionEnvironment

        expect(() => validateEnvironment(withoutOpenAiApiKey)).toThrow(
            'production 환경에서는 OPENAI_API_KEY가 필요합니다.',
        )
    })

    it('production 필수 환경변수가 모두 있으면 기본값을 적용한다', () => {
        expect(validateEnvironment(productionEnvironment)).toMatchObject({
            APP_ENV: 'production',
            DATABASE_URL: productionEnvironment.DATABASE_URL_PRODUCTION,
            OPENAI_API_KEY: productionEnvironment.OPENAI_API_KEY,
            DB_POOL_SIZE: 5,
            JWT_ACCESS_EXPIRES_IN: '15m',
            JWT_REFRESH_EXPIRES_IN: '30d',
            LLM_REQUEST_TIMEOUT_MS: 30_000,
        })
    })

    it('DB 전용 production 검증은 OPENAI_API_KEY를 요구하지 않는다', () => {
        expect(
            validateDbEnvironment({
                APP_ENV: 'production',
                DATABASE_URL_PRODUCTION:
                    productionEnvironment.DATABASE_URL_PRODUCTION,
            }),
        ).toMatchObject({
            APP_ENV: 'production',
            DATABASE_URL: productionEnvironment.DATABASE_URL_PRODUCTION,
        })
    })
})
