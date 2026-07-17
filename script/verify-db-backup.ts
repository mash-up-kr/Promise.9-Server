#!/usr/bin/env bun

import { resolve } from 'node:path'

import { readOptionValue } from './database-env'
import { verifyBackupArchive } from './postgres-cli'
import {
    printError,
    printKeyValue,
    printSuccess,
    printTitle,
} from './script-log'

type CliOptions = {
    file?: string
    pgRestorePath?: string
    showList: boolean
    help: boolean
}

async function main() {
    const options = parseCliOptions(process.argv.slice(2))

    if (options.help) {
        printHelp()
        return
    }

    if (!options.file) {
        throw new Error('--file 옵션이 필요합니다.')
    }

    const filePath = resolve(process.cwd(), options.file)
    const pgRestorePath =
        options.pgRestorePath ?? process.env.PG_RESTORE_PATH ?? 'pg_restore'
    const archive = await verifyBackupArchive({
        filePath,
        pgRestorePath,
    })

    printTitle('🧪 백업 파일 검증')
    printKeyValue('백업 파일', filePath)
    printKeyValue('DB 이름', archive.databaseName)
    printKeyValue('포맷', archive.dumpFormat)
    printKeyValue('목차 엔트리 수', archive.tocEntryCount)
    printKeyValue('원본 PostgreSQL', archive.sourceDatabaseVersion)
    printKeyValue('pg_dump 버전', archive.pgDumpVersion)

    if (options.showList) {
        printTitle('📋 pg_restore 목록')
        console.log(archive.rawList.trimEnd())
    }

    printSuccess('백업 파일 검증이 완료되었습니다.')
}

function parseCliOptions(args: string[]): CliOptions {
    const options: CliOptions = {
        showList: false,
        help: false,
    }

    for (let index = 0; index < args.length; index += 1) {
        const arg = args[index]

        if (arg === '--help' || arg === '-h') {
            options.help = true
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

        if (arg === '--show-list') {
            options.showList = true
            continue
        }

        throw new Error(`알 수 없는 옵션입니다: ${arg}`)
    }

    return options
}

function printHelp() {
    console.log(`📘 사용법
  bun run db:backup:verify -- --file=backups/database/example.dump

⚙️ 옵션
  -f, --file <path>             검증할 pg_dump custom archive 파일
      --pg-restore-path <path>  사용할 pg_restore 실행 파일 경로. 기본값은 PG_RESTORE_PATH 또는 pg_restore
      --show-list               pg_restore --list 전체 출력 표시
  -h, --help                    도움말 출력
`)
}

main().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error)

    printError(message)
    process.exitCode = 1
})
