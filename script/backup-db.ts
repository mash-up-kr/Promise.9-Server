#!/usr/bin/env bun
import { mkdir } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'

import {
    parseRuntimeEnvironment,
    readOptionValue,
    resolveDatabaseConfig,
    RuntimeEnvironment,
} from './database-env'
import {
    createPgEnvironment,
    parseSslMode,
    runPgCommand,
    SslMode,
} from './postgres-cli'
import {
    printError,
    printKeyValue,
    printSuccess,
    printTitle,
} from './script-log'

import 'dotenv/config'

type DumpFormat = 'custom' | 'plain'

type CliOptions = {
    env?: RuntimeEnvironment
    output?: string
    outputDir?: string
    format: DumpFormat
    sslMode?: SslMode
    sslRootCert?: string
    pgDumpPath?: string
    help: boolean
}

const DEFAULT_OUTPUT_DIR = 'backups/database'

async function main() {
    const options = parseCliOptions(process.argv.slice(2))

    if (options.help) {
        printHelp()
        return
    }

    if (options.output && options.outputDir) {
        throw new Error('--output과 --output-dir은 함께 사용할 수 없습니다.')
    }

    const { appEnv, databaseUrlKey, databaseUrl } = resolveDatabaseConfig(
        options.env,
    )

    const { databaseName, pgEnv } = createPgEnvironment(databaseUrl, {
        sslMode: options.sslMode,
        sslRootCert: options.sslRootCert,
    })
    const outputPath = resolveOutputPath({
        appEnv,
        databaseName,
        format: options.format,
        output: options.output,
        outputDir: options.outputDir,
    })

    await mkdir(dirname(outputPath), { recursive: true })

    printTitle('📦 데이터베이스 백업')
    printKeyValue('대상 환경', `${appEnv} (${databaseUrlKey})`)
    printKeyValue('저장 위치', outputPath)

    await runPgDump({
        format: options.format,
        outputPath,
        pgDumpPath: options.pgDumpPath ?? process.env.PG_DUMP_PATH ?? 'pg_dump',
        pgEnv,
    })

    printSuccess('데이터베이스 백업이 완료되었습니다.')
}

function parseCliOptions(args: string[]): CliOptions {
    const options: CliOptions = {
        format: 'custom',
        help: false,
    }

    for (let index = 0; index < args.length; index += 1) {
        const arg = args[index]

        if (arg === '--help' || arg === '-h') {
            options.help = true
            continue
        }

        if (arg === '--env' || arg === '-e') {
            const { value, nextIndex } = readOptionValue(args, index, arg)
            options.env = parseRuntimeEnvironment(value)
            index = nextIndex
            continue
        }

        if (arg.startsWith('--env=')) {
            options.env = parseRuntimeEnvironment(arg.slice('--env='.length))
            continue
        }

        if (arg === '--output' || arg === '-o') {
            const { value, nextIndex } = readOptionValue(args, index, arg)
            options.output = value
            index = nextIndex
            continue
        }

        if (arg.startsWith('--output=')) {
            options.output = arg.slice('--output='.length)
            continue
        }

        if (arg === '--output-dir') {
            const { value, nextIndex } = readOptionValue(args, index, arg)
            options.outputDir = value
            index = nextIndex
            continue
        }

        if (arg.startsWith('--output-dir=')) {
            options.outputDir = arg.slice('--output-dir='.length)
            continue
        }

        if (arg === '--format') {
            const { value, nextIndex } = readOptionValue(args, index, arg)
            options.format = parseDumpFormat(value)
            index = nextIndex
            continue
        }

        if (arg.startsWith('--format=')) {
            options.format = parseDumpFormat(arg.slice('--format='.length))
            continue
        }

        if (arg === '--sslmode') {
            const { value, nextIndex } = readOptionValue(args, index, arg)
            options.sslMode = parseSslMode(value)
            index = nextIndex
            continue
        }

        if (arg.startsWith('--sslmode=')) {
            options.sslMode = parseSslMode(arg.slice('--sslmode='.length))
            continue
        }

        if (arg === '--sslrootcert') {
            const { value, nextIndex } = readOptionValue(args, index, arg)
            options.sslRootCert = value
            index = nextIndex
            continue
        }

        if (arg.startsWith('--sslrootcert=')) {
            options.sslRootCert = arg.slice('--sslrootcert='.length)
            continue
        }

        if (arg === '--pg-dump-path') {
            const { value, nextIndex } = readOptionValue(args, index, arg)
            options.pgDumpPath = value
            index = nextIndex
            continue
        }

        if (arg.startsWith('--pg-dump-path=')) {
            options.pgDumpPath = arg.slice('--pg-dump-path='.length)
            continue
        }

        throw new Error(`알 수 없는 옵션입니다: ${arg}`)
    }

    return options
}

function parseDumpFormat(value: string): DumpFormat {
    if (value === 'custom' || value === 'plain') {
        return value
    }

    throw new Error(
        `백업 포맷은 custom 또는 plain이어야 합니다. 입력값: ${value}`,
    )
}

function resolveOutputPath({
    appEnv,
    databaseName,
    format,
    output,
    outputDir,
}: {
    appEnv: RuntimeEnvironment
    databaseName: string
    format: DumpFormat
    output?: string
    outputDir?: string
}) {
    if (output) {
        return resolve(process.cwd(), output)
    }

    const extension = format === 'custom' ? 'dump' : 'sql'
    const fileName = [
        sanitizeFilePart(databaseName),
        appEnv,
        createTimestamp(),
    ].join('-')

    return resolve(
        process.cwd(),
        outputDir ?? DEFAULT_OUTPUT_DIR,
        `${fileName}.${extension}`,
    )
}

function sanitizeFilePart(value: string) {
    return value.replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/^-+|-+$/g, '')
}

function createTimestamp() {
    return new Date()
        .toISOString()
        .replace(/[-:]/g, '')
        .replace(/\.\d{3}Z$/, 'Z')
}

async function runPgDump({
    format,
    outputPath,
    pgDumpPath,
    pgEnv,
}: {
    format: DumpFormat
    outputPath: string
    pgDumpPath: string
    pgEnv: NodeJS.ProcessEnv
}) {
    const pgDumpFormat = format === 'custom' ? 'custom' : 'plain'
    await runPgCommand({
        command: pgDumpPath,
        args: [
            '--format',
            pgDumpFormat,
            '--file',
            outputPath,
            '--no-owner',
            '--no-privileges',
        ],
        env: pgEnv,
        errorLabel: 'pg_dump',
    })
}

function printHelp() {
    console.log(`📘 사용법
  bun run db:backup -- --env=development
  bun run db:backup -- --env=production

⚙️ 옵션
  -e, --env <development|production>  백업할 DB 환경. 기본값은 APP_ENV 또는 development
  -o, --output <path>                 저장할 백업 파일 경로
      --output-dir <path>             저장할 디렉터리. 기본값은 ${DEFAULT_OUTPUT_DIR}
      --format <custom|plain>         custom(.dump) 또는 plain(.sql). 기본값은 custom
      --sslmode <mode>                pg_dump SSL 모드 override
      --sslrootcert <path>            pg_dump SSL root certificate 경로 override
      --pg-dump-path <path>           사용할 pg_dump 실행 파일 경로. 기본값은 PG_DUMP_PATH 또는 pg_dump
  -h, --help                          도움말 출력
`)
}

main().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error)

    printError(message)
    process.exitCode = 1
})
