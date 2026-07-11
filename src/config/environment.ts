import { z } from 'zod'

import { LLM_MODEL } from '../common/constants/llm'

export type RuntimeEnvironment = 'development' | 'production'

const DEFAULT_LLM_REQUEST_TIMEOUT_MS = 30_000

const envSchema = z
    .object({
        APP_ENV: z.enum(['development', 'production']).default('development'),
        DATABASE_URL_DEVELOPMENT: z.url().optional(),
        DATABASE_URL_PRODUCTION: z.url().optional(),
        DB_POOL_SIZE: z.coerce.number().int().positive().default(5),
        LLM_DEFAULT_MODEL: z.enum(LLM_MODEL).default(LLM_MODEL.GPT_5_4_MINI),
        LLM_REQUEST_TIMEOUT_MS: z.coerce
            .number()
            .int()
            .positive()
            .default(DEFAULT_LLM_REQUEST_TIMEOUT_MS),
        OPENAI_API_KEY: z.string().min(1).optional(),
        GEMINI_API_KEY: z.string().min(1).optional(),
    })
    .superRefine((env, ctx) => {
        // APP_ENV에 따라 DATABASE_URL_DEVELOPMENT 또는 DATABASE_URL_PRODUCTION을 요구한다.
        const databaseUrlKey = getDatabaseUrlKey(env.APP_ENV)

        if (!env[databaseUrlKey]) {
            ctx.addIssue({
                code: 'custom',
                path: [databaseUrlKey],
                message: `${databaseUrlKey} 환경변수가 필요합니다.`,
            })
        }
    })
    .transform((env) => {
        const databaseUrlKey = getDatabaseUrlKey(env.APP_ENV)

        return {
            ...env,
            DATABASE_URL: env[databaseUrlKey] as string,
        }
    })

export type ValidatedEnvironment = z.output<typeof envSchema>

export function validateEnvironment(
    config: Record<string, unknown>,
): ValidatedEnvironment {
    const result = envSchema.safeParse(config)

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
