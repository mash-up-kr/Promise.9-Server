#!/usr/bin/env bun
import { mkdir } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { createInterface } from 'node:readline/promises'

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
    verifyBackupArchive,
} from './postgres-cli'
import {
    printError,
    printKeyValue,
    printStep,
    printSuccess,
    printTitle,
} from './script-log'

import 'dotenv/config'

type CliOptions = {
    env?: RuntimeEnvironment
    file?: string
    clean: boolean
    allowProduction: boolean
    confirm?: string
    sslMode?: SslMode
    sslRootCert?: string
    preRestoreBackupDir?: string
    pgDumpPath?: string
    pgRestorePath?: string
    help: boolean
}

const DEFAULT_PRE_RESTORE_BACKUP_DIR = 'backups/database/pre-restore'
const RESTORE_EXECUTION_CONFIRM = 'Y'
const TEAM_NAME_CONFIRM = '프로미스 나인'

async function main() {
    const options = parseCliOptions(process.argv.slice(2))

    if (options.help) {
        printHelp()
        return
    }

    if (!options.file) {
        throw new Error('--file 옵션이 필요합니다.')
    }

    const { appEnv, databaseUrlKey, databaseUrl } = resolveDatabaseConfig(
        options.env,
    )
    const confirmToken = `RESTORE_${appEnv.toUpperCase()}`

    if (appEnv === 'production') {
        if (!options.allowProduction || options.confirm !== confirmToken) {
            throw new Error(
                `운영 DB 복구는 --allow-production --confirm=${confirmToken} 옵션이 필요합니다.`,
            )
        }
    }

    if (options.clean && options.confirm !== confirmToken) {
        throw new Error(
            `--clean 복구는 --confirm=${confirmToken} 옵션이 필요합니다.`,
        )
    }

    const filePath = resolve(process.cwd(), options.file)
    const pgDumpPath =
        options.pgDumpPath ?? process.env.PG_DUMP_PATH ?? 'pg_dump'
    const pgRestorePath =
        options.pgRestorePath ?? process.env.PG_RESTORE_PATH ?? 'pg_restore'

    printTitle('♻️ 데이터베이스 복구')
    printStep('백업 파일을 먼저 검증합니다.')
    const archive = await verifyBackupArchive({
        filePath,
        pgRestorePath,
    })

    printKeyValue('백업 파일', filePath)
    printKeyValue('백업 DB 이름', archive.databaseName)
    printKeyValue('백업 포맷', archive.dumpFormat)
    printKeyValue('목차 엔트리 수', archive.tocEntryCount)
    printSuccess('백업 파일 검증이 완료되었습니다.')

    const { databaseName, pgEnv } = createPgEnvironment(databaseUrl, {
        sslMode: options.sslMode,
        sslRootCert: options.sslRootCert,
    })
    const preRestoreBackupPath = resolvePreRestoreBackupPath({
        appEnv,
        databaseName,
        outputDir: options.preRestoreBackupDir,
    })
    const args = [
        '--dbname',
        databaseName,
        '--no-owner',
        '--no-privileges',
        '--single-transaction',
    ]

    if (options.clean) {
        args.push('--clean', '--if-exists')
    }

    args.push(filePath)

    await confirmRestoreExecution({
        appEnv,
        databaseName,
        databaseUrlKey,
        filePath,
        isCleanRestore: options.clean,
        preRestoreBackupPath,
    })

    await mkdir(dirname(preRestoreBackupPath), { recursive: true })

    printStep('복구 전 현재 DB를 백업합니다.')
    printKeyValue('복구 전 백업 위치', preRestoreBackupPath)

    await runPgCommand({
        command: pgDumpPath,
        args: [
            '--format',
            'custom',
            '--file',
            preRestoreBackupPath,
            '--no-owner',
            '--no-privileges',
        ],
        env: pgEnv,
        errorLabel: 'pg_dump',
    })

    printSuccess('복구 전 현재 DB 백업이 완료되었습니다.')

    printStep('검증된 백업 파일로 복구를 시작합니다.')
    printKeyValue('대상 환경', `${appEnv} (${databaseUrlKey})`)
    printKeyValue('대상 DB', databaseName)
    printKeyValue(
        '복구 방식',
        options.clean ? '기존 객체 정리 후 복구' : '--clean 없이 복구',
    )

    await runPgCommand({
        command: pgRestorePath,
        args,
        env: pgEnv,
        errorLabel: 'pg_restore',
    })

    printSuccess('데이터베이스 복구가 완료되었습니다.')
}

function parseCliOptions(args: string[]): CliOptions {
    const options: CliOptions = {
        clean: false,
        allowProduction: false,
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

        if (arg === '--file' || arg === '-f') {
            const { value, nextIndex } = readOptionValue(args, index, arg)
            options.file = value
            index = nextIndex
            continue
        }

        if (arg.startsWith('--file=')) {
            options.file = arg.slice('--file='.length)
            continue
        }

        if (arg === '--clean') {
            options.clean = true
            continue
        }

        if (arg === '--allow-production') {
            options.allowProduction = true
            continue
        }

        if (arg === '--confirm') {
            const { value, nextIndex } = readOptionValue(args, index, arg)
            options.confirm = value
            index = nextIndex
            continue
        }

        if (arg.startsWith('--confirm=')) {
            options.confirm = arg.slice('--confirm='.length)
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

        if (arg === '--pre-restore-backup-dir') {
            const { value, nextIndex } = readOptionValue(args, index, arg)
            options.preRestoreBackupDir = value
            index = nextIndex
            continue
        }

        if (arg.startsWith('--pre-restore-backup-dir=')) {
            options.preRestoreBackupDir = arg.slice(
                '--pre-restore-backup-dir='.length,
            )
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

        if (arg === '--pg-restore-path') {
            const { value, nextIndex } = readOptionValue(args, index, arg)
            options.pgRestorePath = value
            index = nextIndex
            continue
        }

        if (arg.startsWith('--pg-restore-path=')) {
            options.pgRestorePath = arg.slice('--pg-restore-path='.length)
            continue
        }

        throw new Error(`알 수 없는 옵션입니다: ${arg}`)
    }

    return options
}

async function confirmRestoreExecution({
    appEnv,
    databaseName,
    databaseUrlKey,
    filePath,
    isCleanRestore,
    preRestoreBackupPath,
}: {
    appEnv: RuntimeEnvironment
    databaseName: string
    databaseUrlKey: string
    filePath: string
    isCleanRestore: boolean
    preRestoreBackupPath: string
}) {
    if (!process.stdin.isTTY || !process.stdout.isTTY) {
        throw new Error(
            'DB 복구는 대화형 확인이 필요합니다. 터미널에서 직접 실행해주세요.',
        )
    }

    console.log(`
🚨 복구 실행 전 최종 확인
  - 잘못 실행하면 큰일나요!!
  - 이 작업은 대상 DB 데이터를 변경할 수 있습니다.
  - 복구 전에 현재 DB를 먼저 백업합니다.
  - 잘못 복구해도 이 스크립트가 만든 백업 파일로 다시 복구할 수 있습니다.

📌 실행 정보
  - 대상 환경: ${appEnv} (${databaseUrlKey})
  - 대상 DB: ${databaseName}
  - 복구 파일: ${filePath}
  - 복구 방식: ${isCleanRestore ? '기존 객체 정리 후 복구' : '--clean 없이 복구'}
  - 복구 전 백업 위치: ${preRestoreBackupPath}
`)

    const rl = createInterface({
        input: process.stdin,
        output: process.stdout,
    })

    try {
        const executionConfirm = await rl.question(
            `❓ 진짜 실행할 건가요? 계속하려면 ${RESTORE_EXECUTION_CONFIRM}를 입력하세요: `,
        )

        if (executionConfirm.trim() !== RESTORE_EXECUTION_CONFIRM) {
            throw new Error('복구 실행을 취소했습니다.')
        }

        const teamName = await rl.question(`👥 우리팀 맞죠? 우리팀 이름은?: `)

        if (teamName.trim() !== TEAM_NAME_CONFIRM) {
            throw new Error(
                `팀 이름 확인에 실패했습니다. ${TEAM_NAME_CONFIRM}을 정확히 입력해야 합니다.`,
            )
        }
    } finally {
        rl.close()
    }

    printSuccess('복구 실행 확인이 완료되었습니다.')
}

function resolvePreRestoreBackupPath({
    appEnv,
    databaseName,
    outputDir,
}: {
    appEnv: RuntimeEnvironment
    databaseName: string
    outputDir?: string
}) {
    const fileName = [
        sanitizeFilePart(databaseName),
        appEnv,
        'pre-restore',
        createTimestamp(),
    ].join('-')

    return resolve(
        process.cwd(),
        outputDir ?? DEFAULT_PRE_RESTORE_BACKUP_DIR,
        `${fileName}.dump`,
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

function printHelp() {
    console.log(`📘 사용법
  bun run db:restore -- --env=development --file=backups/database/example.dump
  bun run db:restore -- --env=development --file=backups/database/example.dump --clean --confirm=RESTORE_DEVELOPMENT

⚙️ 옵션
  -e, --env <development|production>  복구할 DB 환경. 기본값은 APP_ENV 또는 development
  -f, --file <path>                   복구할 pg_dump custom archive 파일
      --clean                         기존 객체를 drop 후 복구한다. --confirm 필요
      --allow-production              운영 DB 복구 허용. --confirm=RESTORE_PRODUCTION 필요
      --confirm <token>               위험 작업 확인 토큰
      --sslmode <mode>                pg_restore SSL 모드 override
      --sslrootcert <path>            pg_restore SSL root certificate 경로 override
      --pre-restore-backup-dir <path> 복구 전 현재 DB 백업 저장 디렉터리. 기본값은 ${DEFAULT_PRE_RESTORE_BACKUP_DIR}
      --pg-dump-path <path>           복구 전 백업에 사용할 pg_dump 실행 파일 경로. 기본값은 PG_DUMP_PATH 또는 pg_dump
      --pg-restore-path <path>        사용할 pg_restore 실행 파일 경로. 기본값은 PG_RESTORE_PATH 또는 pg_restore
  -h, --help                          도움말 출력
`)
}

main().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error)

    printError(message)
    process.exitCode = 1
})
