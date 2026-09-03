import { validateDbEnvironment, validateEnvironment } from './environment'

const developmentEnvironment = {
    APP_ENV: 'development',
    DATABASE_URL_DEVELOPMENT: 'postgres://localhost:5432/promise9',
    JWT_ACCESS_SECRET: 'access-secret',
    JWT_REFRESH_SECRET: 'refresh-secret',
    GOOGLE_CLIENT_ID: 'google-client-id',
    KAKAO_CLIENT_ID: 'kakao-client-id',
    KAKAO_NATIVE_APP_KEY: 'kakao-native-app-key',
    APPLE_CLIENT_ID: 'apple-client-id',
}

const productionEnvironment = {
    APP_ENV: 'production',
    DATABASE_URL_PRODUCTION: 'postgres://user:password@db:5432/promise9',
    JWT_ACCESS_SECRET: 'access-secret',
    JWT_REFRESH_SECRET: 'refresh-secret',
    GOOGLE_CLIENT_ID: 'google-client-id',
    KAKAO_CLIENT_ID: 'kakao-client-id',
    KAKAO_NATIVE_APP_KEY: 'kakao-native-app-key',
    APPLE_CLIENT_ID: 'apple-client-id',
    OPENAI_API_KEY: 'openai-api-key',
}

describe('validateEnvironment', () => {
    it('SQS consumer를 기본으로 비활성화한다', () => {
        expect(
            validateEnvironment(developmentEnvironment).SQS_CONSUMER_ENABLED,
        ).toBe(false)
    })

    it('development에서 production 링크 분석 큐 consumer 활성화를 거부한다', () => {
        expect(() =>
            validateEnvironment({
                ...developmentEnvironment,
                SQS_LINK_ANALYSIS_QUEUE_URL:
                    'https://sqs.ap-northeast-2.amazonaws.com/123456789012/promise9-link-analysis',
                SQS_CONSUMER_ENABLED: 'true',
            }),
        ).toThrow(
            'development 환경에서 production 링크 분석 큐를 소비할 수 없습니다.',
        )
    })

    it('development에서 LocalStack 링크 분석 consumer를 활성화할 수 있다', () => {
        expect(
            validateEnvironment({
                ...developmentEnvironment,
                SQS_LINK_ANALYSIS_QUEUE_URL:
                    'http://localhost:4566/000000000000/promise9-link-analysis',
                SQS_ENDPOINT: 'http://localhost:4566',
                SQS_CONSUMER_ENABLED: 'true',
            }),
        ).toMatchObject({
            SQS_ENDPOINT: 'http://localhost:4566',
            SQS_CONSUMER_ENABLED: true,
        })
    })

    it('production에서 명시적으로 링크 분석 consumer를 활성화할 수 있다', () => {
        expect(
            validateEnvironment({
                ...productionEnvironment,
                SQS_LINK_ANALYSIS_QUEUE_URL:
                    'https://sqs.ap-northeast-2.amazonaws.com/123456789012/promise9-link-analysis',
                SQS_CONSUMER_ENABLED: 'true',
            }),
        ).toMatchObject({
            APP_ENV: 'production',
            SQS_CONSUMER_ENABLED: true,
        })
    })

    it('SES region 기본값을 적용한다', () => {
        const environment = validateEnvironment(developmentEnvironment)

        expect(environment.EMAIL_SES_REGION).toBe('ap-northeast-2')
    })

    it('AWS access key와 secret key 중 하나만 설정하면 실패한다', () => {
        expect(() =>
            validateEnvironment({
                ...developmentEnvironment,
                AWS_ACCESS_KEY_ID: 'access-key-id',
            }),
        ).toThrow(
            'AWS_ACCESS_KEY_ID와 AWS_SECRET_ACCESS_KEY는 함께 설정해야 합니다.',
        )
    })

    it('AWS 임시 자격 증명 세트를 허용한다', () => {
        const environment = validateEnvironment({
            ...developmentEnvironment,
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
