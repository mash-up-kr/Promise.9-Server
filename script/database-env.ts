export type RuntimeEnvironment = 'development' | 'production'

export type DatabaseConfig = {
    appEnv: RuntimeEnvironment
    databaseUrlKey: 'DATABASE_URL_DEVELOPMENT' | 'DATABASE_URL_PRODUCTION'
    databaseUrl: string
}

export function resolveDatabaseConfig(
    appEnv?: RuntimeEnvironment,
): DatabaseConfig {
    const resolvedAppEnv =
        appEnv ?? parseRuntimeEnvironment(process.env.APP_ENV ?? 'development')
    const databaseUrlKey = getDatabaseUrlKey(resolvedAppEnv)
    const databaseUrl = process.env[databaseUrlKey]

    if (!databaseUrl) {
        throw new Error(`${databaseUrlKey} 환경변수가 필요합니다.`)
    }

    return {
        appEnv: resolvedAppEnv,
        databaseUrlKey,
        databaseUrl,
    }
}

export function parseRuntimeEnvironment(value: string): RuntimeEnvironment {
    if (value === 'development' || value === 'production') {
        return value
    }

    throw new Error(
        `APP_ENV는 development 또는 production이어야 합니다. 입력값: ${value}`,
    )
}

export function getDatabaseUrlKey(appEnv: RuntimeEnvironment) {
    return appEnv === 'production'
        ? 'DATABASE_URL_PRODUCTION'
        : 'DATABASE_URL_DEVELOPMENT'
}

export function readOptionValue(
    args: string[],
    index: number,
    optionName: string,
) {
    const value = args[index + 1]

    if (!value || value.startsWith('-')) {
        throw new Error(`${optionName} 옵션의 값이 필요합니다.`)
    }

    return {
        value,
        nextIndex: index + 1,
    }
}
