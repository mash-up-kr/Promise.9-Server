export type RuntimeEnvironment = 'development' | 'production'

const databaseUrlByEnvironment: Record<
    RuntimeEnvironment,
    'DATABASE_URL_DEVELOPMENT' | 'DATABASE_URL_PRODUCTION'
> = {
    development: 'DATABASE_URL_DEVELOPMENT',
    production: 'DATABASE_URL_PRODUCTION',
}

export type ValidatedEnvironment = {
    APP_ENV: RuntimeEnvironment
    DATABASE_URL: string
    DB_POOL_SIZE: number
}

export function validateEnvironment(
    config: Record<string, unknown>,
): ValidatedEnvironment {
    const appEnv = parseAppEnv(config.APP_ENV)
    const databaseUrlKey = databaseUrlByEnvironment[appEnv]
    const databaseUrl = parseDatabaseUrl(config[databaseUrlKey], databaseUrlKey)

    return {
        ...config,
        APP_ENV: appEnv,
        DATABASE_URL: databaseUrl,
        DB_POOL_SIZE: parsePositiveInteger(
            config.DB_POOL_SIZE,
            'DB_POOL_SIZE',
            5,
        ),
    }
}

export function resolveDatabaseUrl(config: NodeJS.ProcessEnv) {
    return validateEnvironment(config).DATABASE_URL
}

function parseAppEnv(value: unknown): RuntimeEnvironment {
    if (value === undefined || value === '') {
        return 'development'
    }

    if (value === 'development' || value === 'production') {
        return value
    }

    throw new Error('APP_ENV must be one of: development, production.')
}

function parseDatabaseUrl(value: unknown, key: string) {
    if (typeof value !== 'string' || value.trim() === '') {
        throw new Error(`${key} is required.`)
    }

    const databaseUrl = value.trim()

    try {
        const parsedUrl = new URL(databaseUrl)

        if (
            parsedUrl.protocol !== 'postgres:' &&
            parsedUrl.protocol !== 'postgresql:'
        ) {
            throw new Error()
        }
    } catch {
        throw new Error(`${key} must be a valid PostgreSQL connection URL.`)
    }

    return databaseUrl
}

function parsePositiveInteger(
    value: unknown,
    key: string,
    defaultValue: number,
) {
    if (value === undefined || value === '') {
        return defaultValue
    }

    const parsedValue = Number(value)

    if (!Number.isInteger(parsedValue) || parsedValue < 1) {
        throw new Error(`${key} must be a positive integer.`)
    }

    return parsedValue
}
