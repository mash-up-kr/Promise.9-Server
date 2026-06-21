import { z } from 'zod'

export type RuntimeEnvironment = 'development' | 'production'

const envSchema = z
    .object({
        APP_ENV: z.enum(['development', 'production']).default('development'),
        DATABASE_URL_DEVELOPMENT: z.string().url().optional(),
        DATABASE_URL_PRODUCTION: z.string().url().optional(),
        DB_POOL_SIZE: z.coerce.number().int().positive().default(5),
    })
    .superRefine((env, ctx) => {
        const databaseUrlKey = getDatabaseUrlKey(env.APP_ENV)

        if (!env[databaseUrlKey]) {
            ctx.addIssue({
                code: 'custom',
                path: [databaseUrlKey],
                message: `${databaseUrlKey} is required.`,
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

        throw new Error(`Invalid environment variables:\n${messages}`)
    }

    return result.data
}

export function resolveDatabaseUrl(config: NodeJS.ProcessEnv) {
    return validateEnvironment(config).DATABASE_URL
}

function getDatabaseUrlKey(appEnv: RuntimeEnvironment) {
    return appEnv === 'production'
        ? 'DATABASE_URL_PRODUCTION'
        : 'DATABASE_URL_DEVELOPMENT'
}
