#!/usr/bin/env bun
import postgres from 'postgres'

import {
    parseRuntimeEnvironment,
    readOptionValue,
    resolveDatabaseConfig,
    RuntimeEnvironment,
} from './database-env'
import {
    copyLinkGroup,
    findActiveUserByEmail,
    findActiveUserById,
    FolderSelector,
    previewCopy,
    readFolderSnapshot,
} from './link-copy'
import {
    printError,
    printKeyValue,
    printSuccess,
    printTitle,
} from './script-log'

import 'dotenv/config'

type CliOptions = {
    env?: RuntimeEnvironment
    folder?: FolderSelector
    targetUserId?: number
    targetUserEmail?: string
    apply: boolean
    forceProduction: boolean
    help: boolean
}

async function main() {
    const options = parseCliOptions(process.argv.slice(2))
    if (options.help) {
        printHelp()
        return
    }

    validateRequiredOptions(options)

    const config = resolveDatabaseConfig(options.env)
    if (
        options.apply &&
        config.appEnv === 'production' &&
        !options.forceProduction
    ) {
        throw new Error(
            '운영 DB 반영에는 --apply와 --force-production이 모두 필요합니다.',
        )
    }

    const masterUserId = parsePositiveInteger(
        process.env.MASTER_USER_ID,
        'MASTER_USER_ID',
    )
    const sql = postgres(config.databaseUrl, { max: 1 })

    try {
        const master = await findActiveUserById(sql, masterUserId)
        if (!master) {
            throw new Error(
                `활성 마스터 유저를 찾지 못했습니다: ${masterUserId}`,
            )
        }

        const target =
            options.targetUserId !== undefined
                ? await findActiveUserById(sql, options.targetUserId)
                : await findActiveUserByEmail(
                      sql,
                      options.targetUserEmail as string,
                  )
        if (!target) {
            throw new Error('조건에 맞는 활성 대상 유저를 찾지 못했습니다.')
        }
        if (target.id === master.id) {
            throw new Error('마스터 유저 자신에게는 폴더를 배포할 수 없습니다.')
        }

        const snapshot = await readFolderSnapshot(
            sql,
            master.id,
            options.folder as FolderSelector,
        )
        const preview = await previewCopy(sql, target.id, snapshot)

        printTitle(
            options.apply
                ? '📦 마스터 폴더 배포'
                : '🧪 마스터 폴더 배포 dry-run',
        )
        printKeyValue(
            '대상 환경',
            `${config.appEnv} (${config.databaseUrlKey})`,
        )
        printKeyValue('마스터 유저 id', master.id)
        printKeyValue('대상 유저 id', target.id)
        printKeyValue('폴더', snapshot.folder?.name)
        printKeyValue(
            '대상 폴더',
            preview.targetFolderExists ? '기존 동명 폴더 재사용' : '새로 생성',
        )
        printKeyValue('원본 활성 링크', preview.sourceLinkCount)
        printKeyValue('원본 태그', preview.sourceTagCount)
        printKeyValue('중복으로 건너뛸 링크', preview.duplicateLinkCount)
        printKeyValue('새로 넣을 링크', preview.insertLinkCount)
        printKeyValue('새로 넣을 태그', preview.insertTagCount)
        printKeyValue('분석 미완료 링크', preview.incompleteLinkCount)

        if (preview.sourceLinkCount === 0) {
            throw new Error('선택한 폴더에 배포할 활성 링크가 없습니다.')
        }
        if (preview.incompleteLinkCount > 0) {
            throw new Error(
                '요약·임베딩이 완료되지 않은 링크가 있어 배포를 중단했습니다.',
            )
        }

        if (!options.apply) {
            printSuccess(
                'dry-run이 완료되었습니다. 실제 반영하려면 --apply를 추가하세요.',
            )
            return
        }

        const result = await copyLinkGroup(sql, target.id, snapshot)
        printKeyValue(
            '폴더 처리',
            result.createdFolder ? '새 폴더 생성' : '기존 폴더 재사용',
        )
        printKeyValue('삽입한 링크', result.insertedLinkCount)
        printKeyValue('삽입한 태그', result.insertedTagCount)
        printKeyValue('건너뛴 중복 링크', result.skippedDuplicateCount)
        printSuccess('마스터 폴더 배포가 완료되었습니다.')
    } finally {
        await sql.end()
    }
}

function parseCliOptions(args: string[]): CliOptions {
    const options: CliOptions = {
        apply: false,
        forceProduction: false,
        help: false,
    }

    for (let index = 0; index < args.length; index += 1) {
        const arg = args[index]

        if (arg === '--help' || arg === '-h') options.help = true
        else if (arg === '--apply') options.apply = true
        else if (arg === '--force-production') options.forceProduction = true
        else if (arg === '--env') {
            const result = readOptionValue(args, index, arg)
            options.env = parseRuntimeEnvironment(result.value)
            index = result.nextIndex
        } else if (arg.startsWith('--env=')) {
            options.env = parseRuntimeEnvironment(arg.slice('--env='.length))
        } else if (arg === '--folder-id') {
            const result = readOptionValue(args, index, arg)
            setFolderSelector(options, {
                id: parsePositiveInteger(result.value, arg),
            })
            index = result.nextIndex
        } else if (arg.startsWith('--folder-id=')) {
            setFolderSelector(options, {
                id: parsePositiveInteger(
                    arg.slice('--folder-id='.length),
                    '--folder-id',
                ),
            })
        } else if (arg === '--folder-name') {
            const result = readOptionValue(args, index, arg)
            setFolderSelector(options, { name: result.value })
            index = result.nextIndex
        } else if (arg.startsWith('--folder-name=')) {
            setFolderSelector(options, {
                name: arg.slice('--folder-name='.length),
            })
        } else if (arg === '--target-user-id') {
            const result = readOptionValue(args, index, arg)
            options.targetUserId = parsePositiveInteger(result.value, arg)
            index = result.nextIndex
        } else if (arg.startsWith('--target-user-id=')) {
            options.targetUserId = parsePositiveInteger(
                arg.slice('--target-user-id='.length),
                '--target-user-id',
            )
        } else if (arg === '--target-user-email') {
            const result = readOptionValue(args, index, arg)
            options.targetUserEmail = result.value
            index = result.nextIndex
        } else if (arg.startsWith('--target-user-email=')) {
            options.targetUserEmail = arg.slice('--target-user-email='.length)
        } else {
            throw new Error(`알 수 없는 옵션: ${arg}`)
        }
    }

    return options
}

function setFolderSelector(options: CliOptions, folder: FolderSelector) {
    if (options.folder) {
        throw new Error(
            '--folder-id와 --folder-name은 하나만 한 번 지정해야 합니다.',
        )
    }
    options.folder = folder
}

function validateRequiredOptions(options: CliOptions) {
    if (!options.folder) {
        throw new Error('--folder-id 또는 --folder-name이 필요합니다.')
    }
    const targetCount =
        Number(options.targetUserId !== undefined) +
        Number(options.targetUserEmail !== undefined)
    if (targetCount !== 1) {
        throw new Error(
            '--target-user-id 또는 --target-user-email 중 하나만 지정해야 합니다.',
        )
    }
}

function parsePositiveInteger(raw: string | undefined, label: string): number {
    const value = Number(raw)
    if (!Number.isSafeInteger(value) || value <= 0) {
        throw new Error(`${label}는 양의 정수여야 합니다. 입력값: ${raw}`)
    }
    return value
}

function printHelp() {
    console.log(`📘 사용법
  bun run db:distribute:master-folder -- --folder-id=17 --target-user-id=42
  bun run db:distribute:master-folder -- --env=production --folder-name="2차 UT" --target-user-email=user@example.com --apply --force-production

⚙️ 동작
  - MASTER_USER_ID가 소유한 활성 폴더의 링크와 태그를 대상 유저에게 복제합니다.
  - 제목·메타데이터·AI 요약·임베딩은 복사하고 유저 상태값은 초기화합니다.
  - 대상의 동명 폴더는 재사용하고, 활성 중복 URL은 건너뜁니다.
  - 기본은 dry-run이며 실제 반영에는 --apply가 필요합니다.
  - production 반영에는 --force-production도 함께 필요합니다.
`)
}

main().catch((error: unknown) => {
    printError(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
})
