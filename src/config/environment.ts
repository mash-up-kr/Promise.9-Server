import { z } from 'zod'

import { LLM_MODEL } from '../common/constants/llm'

export type RuntimeEnvironment = 'development' | 'production'

const DEFAULT_LLM_REQUEST_TIMEOUT_MS = 30_000
const DEFAULT_EMAIL_SES_REGION = 'ap-northeast-2'

// drizzle.config.ts에서 사용 — DB 접속 정보만 검증
const dbEnvSchema = z
    .object({
        APP_ENV: z.enum(['development', 'production']).default('development'),
        DATABASE_URL_DEVELOPMENT: z.url().optional(),
        DATABASE_URL_PRODUCTION: z.url().optional(),
        DB_POOL_SIZE: z.coerce.number().int().positive().default(5),
    })
    .superRefine((env, ctx) => {
        const key = getDatabaseUrlKey(env.APP_ENV)

        if (!env[key]) {
            ctx.addIssue({
                code: 'custom',
                path: [key],
                message: `${key} 환경변수가 필요합니다.`,
            })
        }
    })
    .transform((env) => ({
        ...env,
        DATABASE_URL: env[getDatabaseUrlKey(env.APP_ENV)] as string,
    }))

// NestJS 앱에서 사용 — 전체 환경변수 검증
const appEnvSchema = z
    .object({
        APP_ENV: z.enum(['development', 'production']).default('development'),
        DATABASE_URL_DEVELOPMENT: z.url().optional(),
        DATABASE_URL_PRODUCTION: z.url().optional(),
        DB_POOL_SIZE: z.coerce.number().int().positive().default(5),
        JWT_ACCESS_SECRET: z.string().min(1),
        JWT_REFRESH_SECRET: z.string().min(1),
        JWT_ACCESS_EXPIRES_IN: z.string().default('15m'),
        JWT_REFRESH_EXPIRES_IN: z.string().default('30d'),
        GOOGLE_CLIENT_ID: z.string().min(1),
        KAKAO_CLIENT_ID: z.string().min(1),
        // 카카오 로그인 콘솔에서 Client Secret 사용을 켠 경우에만 필요 (기본값 OFF)
        KAKAO_CLIENT_SECRET: z.string().min(1).optional(),
        // 네이티브(iOS/Android) SDK가 발급하는 id_token의 aud는 REST API 키가 아니라
        // 네이티브 앱 키라, 두 값을 모두 audience로 허용해야 앱 로그인이 검증된다.
        KAKAO_NATIVE_APP_KEY: z.string().min(1),
        APPLE_CLIENT_ID: z.string().min(1),
        MASTER_ACCESS_TOKEN: z.string().optional(),
        MASTER_USER_ID: z.coerce.number().int().positive().optional(),
        LLM_DEFAULT_MODEL: z.enum(LLM_MODEL).default(LLM_MODEL.GPT_5_4_MINI),
        // 임베딩 모델은 EMBEDDING_MODEL 상수로 고정한다(벡터 호환이 없어 env 교체 여지를 두지 않음).
        LLM_REQUEST_TIMEOUT_MS: z.coerce
            .number()
            .int()
            .positive()
            .default(DEFAULT_LLM_REQUEST_TIMEOUT_MS),
        OPENAI_API_KEY: z.string().min(1).optional(),
        GEMINI_API_KEY: z.string().min(1).optional(),
        EMAIL_SES_REGION: z.string().min(1).default(DEFAULT_EMAIL_SES_REGION),
        EMAIL_FROM_ADDRESS: z.email().optional(),
        EMAIL_CONFIGURATION_SET: z.string().min(1).optional(),
        AWS_ACCESS_KEY_ID: z.string().min(1).optional(),
        AWS_SECRET_ACCESS_KEY: z.string().min(1).optional(),
        AWS_SESSION_TOKEN: z.string().min(1).optional(),
    })
    .superRefine((env, ctx) => {
        const key = getDatabaseUrlKey(env.APP_ENV)

        if (!env[key]) {
            ctx.addIssue({
                code: 'custom',
                path: [key],
                message: `${key} 환경변수가 필요합니다.`,
            })
        }

        if (
            Boolean(env.AWS_ACCESS_KEY_ID) !==
            Boolean(env.AWS_SECRET_ACCESS_KEY)
        ) {
            ctx.addIssue({
                code: 'custom',
                path: ['AWS_ACCESS_KEY_ID'],
                message:
                    'AWS_ACCESS_KEY_ID와 AWS_SECRET_ACCESS_KEY는 함께 설정해야 합니다.',
            })
        }

        if (env.AWS_SESSION_TOKEN && !env.AWS_ACCESS_KEY_ID) {
            ctx.addIssue({
                code: 'custom',
                path: ['AWS_SESSION_TOKEN'],
                message:
                    'AWS_SESSION_TOKEN을 사용하려면 AWS access key도 설정해야 합니다.',
            })
        }

        if (env.APP_ENV === 'production' && !env.OPENAI_API_KEY) {
            ctx.addIssue({
                code: 'custom',
                path: ['OPENAI_API_KEY'],
                message: 'production 환경에서는 OPENAI_API_KEY가 필요합니다.',
            })
        }
    })
    .transform((env) => ({
        ...env,
        DATABASE_URL: env[getDatabaseUrlKey(env.APP_ENV)] as string,
    }))

export type ValidatedEnvironment = z.output<typeof appEnvSchema>
export type ValidatedDbEnvironment = z.output<typeof dbEnvSchema>

export function validateEnvironment(
    config: Record<string, unknown>,
): ValidatedEnvironment {
    return parse(appEnvSchema, config)
}

export function validateDbEnvironment(
    config: Record<string, unknown>,
): ValidatedDbEnvironment {
    return parse(dbEnvSchema, config)
}

function parse<T>(schema: z.ZodType<T>, config: Record<string, unknown>): T {
    const result = schema.safeParse(config)

    if (!result.success) {
        const messages = result.error.issues
            .map((issue) => {
                const path = issue.path.join('.') || 'unknown'

                return `${path}: ${issue.message}`
            })
            .join('\n')

        throw new Error(`환경변수 설정이 올바르지 않습니다:\n${messages}`)
    }

    return result.data
}

function getDatabaseUrlKey(appEnv: RuntimeEnvironment) {
    return appEnv === 'production'
        ? 'DATABASE_URL_PRODUCTION'
        : 'DATABASE_URL_DEVELOPMENT'
}
