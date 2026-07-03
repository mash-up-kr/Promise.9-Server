import { z } from 'zod'

export type RuntimeEnvironment = 'development' | 'production'

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
