import { spawn } from 'node:child_process'
import { resolve } from 'node:path'

export const SSL_MODE = [
    'disable',
    'allow',
    'prefer',
    'require',
    'verify-ca',
    'verify-full',
] as const

export type SslMode = (typeof SSL_MODE)[number]

export type PgCommandResult = {
    stdout: string
    stderr: string
}

export function parseSslMode(value: string): SslMode {
    if (SSL_MODE.includes(value as SslMode)) {
        return value as SslMode
    }

    throw new Error(
        `sslmode는 ${SSL_MODE.join(', ')} 중 하나여야 합니다. 입력값: ${value}`,
    )
}

export function createPgEnvironment(
    databaseUrl: string,
    options: {
        sslMode?: SslMode
        sslRootCert?: string
    } = {},
) {
    const url = parseDatabaseUrl(databaseUrl)
    const databaseName = decodeUrlValue(url.pathname.replace(/^\//, ''))

    if (!databaseName) {
        throw new Error('DATABASE_URL에 데이터베이스 이름이 포함되어야 합니다.')
    }

    const pgEnv: NodeJS.ProcessEnv = {
        ...process.env,
        PGHOST: url.hostname,
        PGDATABASE: databaseName,
    }

    if (url.port) {
        pgEnv.PGPORT = url.port
    }

    if (url.username) {
        pgEnv.PGUSER = decodeUrlValue(url.username)
    }

    if (url.password) {
        pgEnv.PGPASSWORD = decodeUrlValue(url.password)
    }

    copyPgConnectionParam(url, pgEnv, 'sslmode', 'PGSSLMODE')
    copyPgConnectionParam(url, pgEnv, 'sslcert', 'PGSSLCERT')
    copyPgConnectionParam(url, pgEnv, 'sslkey', 'PGSSLKEY')
    copyPgConnectionParam(url, pgEnv, 'sslrootcert', 'PGSSLROOTCERT')

    if (options.sslMode) {
        pgEnv.PGSSLMODE = options.sslMode
    }

    if (options.sslRootCert) {
        pgEnv.PGSSLROOTCERT = resolve(process.cwd(), options.sslRootCert)
    }

    return {
        databaseName,
        pgEnv,
    }
}

export async function runPgCommand({
    command,
    args,
    env,
    errorLabel,
    captureOutput = false,
}: {
    command: string
    args: string[]
    env?: NodeJS.ProcessEnv
    errorLabel: string
    captureOutput?: boolean
}): Promise<PgCommandResult> {
    const child = spawn(command, args, {
        env,
        stdio: captureOutput
            ? ['ignore', 'pipe', 'pipe']
            : ['ignore', 'inherit', 'inherit'],
    })
    let stdout = ''
    let stderr = ''

    if (captureOutput) {
        child.stdout?.on('data', (chunk: Buffer) => {
            stdout += chunk.toString('utf8')
        })
        child.stderr?.on('data', (chunk: Buffer) => {
            stderr += chunk.toString('utf8')
        })
    }

    await new Promise<void>((resolvePromise, reject) => {
        child.once('error', (error) => {
            reject(
                new Error(
                    `${errorLabel} 실행에 실패했습니다. PostgreSQL client tools 설치 여부를 확인해주세요: ${error.message}`,
                ),
            )
        })

        child.once('close', (code) => {
            if (code === 0) {
                resolvePromise()
                return
            }

            const detail = stderr.trim() ? `\n${stderr.trim()}` : ''

            reject(
                new Error(
                    `${errorLabel}가 실패했습니다. 종료 코드: ${code}${detail}`,
                ),
            )
        })
    })

    return {
        stdout,
        stderr,
    }
}

export async function verifyBackupArchive({
    filePath,
    pgRestorePath,
}: {
    filePath: string
    pgRestorePath: string
}) {
    const result = await runPgCommand({
        command: pgRestorePath,
        args: ['--list', filePath],
        errorLabel: 'pg_restore --list',
        captureOutput: true,
    })

    return parsePgRestoreList(result.stdout)
}

function parseDatabaseUrl(databaseUrl: string) {
    let url: URL

    try {
        url = new URL(databaseUrl)
    } catch {
        throw new Error('DATABASE_URL 형식이 올바르지 않습니다.')
    }

    if (url.protocol !== 'postgres:' && url.protocol !== 'postgresql:') {
        throw new Error(
            'DATABASE_URL은 postgres 또는 postgresql URL이어야 합니다.',
        )
    }

    if (!url.hostname) {
        throw new Error('DATABASE_URL에 호스트가 포함되어야 합니다.')
    }

    return url
}

function copyPgConnectionParam(
    url: URL,
    pgEnv: NodeJS.ProcessEnv,
    searchParam: string,
    envKey: string,
) {
    const value = url.searchParams.get(searchParam)

    if (value) {
        pgEnv[envKey] = value
    }
}

function decodeUrlValue(value: string) {
    try {
        return decodeURIComponent(value)
    } catch {
        return value
    }
}

function parsePgRestoreList(output: string) {
    const lines = output.split(/\r?\n/)
    const getHeaderValue = (label: string) => {
        const prefix = `;     ${label}:`
        const line = lines.find((candidate) => candidate.startsWith(prefix))

        return line?.slice(prefix.length).trim()
    }

    return {
        databaseName: getHeaderValue('dbname'),
        dumpVersion: getHeaderValue('Dump Version'),
        dumpFormat: getHeaderValue('Format'),
        sourceDatabaseVersion: getHeaderValue('Dumped from database version'),
        pgDumpVersion: getHeaderValue('Dumped by pg_dump version'),
        tocEntryCount: lines.filter((line) => /^\d+;/.test(line)).length,
        rawList: output,
    }
}
