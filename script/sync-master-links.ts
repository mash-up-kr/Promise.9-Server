#!/usr/bin/env bun
import postgres from 'postgres'

import { resolveDatabaseConfig } from './database-env'
import {
    copyLinkGroups,
    findActiveUserByEmail,
    findActiveUserById,
    LinkGroupSnapshot,
    listActiveFolders,
    previewCopy,
    readFolderSnapshot,
    readUncategorizedSnapshot,
} from './link-copy'
import {
    printError,
    printKeyValue,
    printStep,
    printSuccess,
    printTitle,
} from './script-log'

import 'dotenv/config'

type CliOptions = {
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
    if (options.apply && !options.forceProduction) {
        throw new Error(
            '운영 DB 반영에는 --apply와 --force-production이 모두 필요합니다.',
        )
    }

    const masterUserId = parseMasterUserId(process.env.MASTER_USER_ID)
    const sourceConfig = resolveDatabaseConfig('development')
    const targetConfig = resolveDatabaseConfig('production')
    const sourceSql = postgres(sourceConfig.databaseUrl, { max: 1 })
    const targetSql = postgres(targetConfig.databaseUrl, { max: 1 })

    try {
        const sourceMaster = await findActiveUserById(sourceSql, masterUserId)
        if (!sourceMaster) {
            throw new Error(
                `개발 DB에서 활성 마스터 유저를 찾지 못했습니다: ${masterUserId}`,
            )
        }
        const targetMaster = await findActiveUserByEmail(
            targetSql,
            sourceMaster.email,
        )
        if (!targetMaster) {
            throw new Error(
                '운영 DB에서 개발 마스터와 같은 이메일의 활성 유저를 찾지 못했습니다.',
            )
        }

        const sourceFolders = await listActiveFolders(
            sourceSql,
            sourceMaster.id,
        )
        const snapshots: LinkGroupSnapshot[] = []
        for (const folder of sourceFolders) {
            snapshots.push(
                await readFolderSnapshot(sourceSql, sourceMaster.id, {
                    id: folder.id,
                }),
            )
        }
        snapshots.push(
            await readUncategorizedSnapshot(sourceSql, sourceMaster.id),
        )

        printTitle(
            options.apply
                ? '🚚 개발→운영 마스터 링크 동기화'
                : '🧪 개발→운영 마스터 링크 동기화 dry-run',
        )
        printKeyValue('개발 마스터 id', sourceMaster.id)
        printKeyValue('운영 마스터 id', targetMaster.id)
        printKeyValue('활성 폴더', sourceFolders.length)

        let totalSourceLinks = 0
        let totalInsertLinks = 0
        let totalInsertTags = 0
        let totalDuplicates = 0
        let totalIncomplete = 0

        const previews: Array<{
            snapshot: LinkGroupSnapshot
            preview: Awaited<ReturnType<typeof previewCopy>>
        }> = []
        for (const snapshot of snapshots) {
            const preview = await previewCopy(
                targetSql,
                targetMaster.id,
                snapshot,
            )
            previews.push({ snapshot, preview })
            totalSourceLinks += preview.sourceLinkCount
            totalInsertLinks += preview.insertLinkCount
            totalInsertTags += preview.insertTagCount
            totalDuplicates += preview.duplicateLinkCount
            totalIncomplete += preview.incompleteLinkCount

            printStep(snapshot.folder?.name ?? '미분류')
            printKeyValue('원본 활성 링크', preview.sourceLinkCount)
            printKeyValue('새로 넣을 링크', preview.insertLinkCount)
            printKeyValue('새로 넣을 태그', preview.insertTagCount)
            printKeyValue('중복으로 건너뛸 링크', preview.duplicateLinkCount)
            if (snapshot.folder) {
                printKeyValue(
                    '운영 폴더',
                    preview.targetFolderExists
                        ? '기존 폴더 재사용'
                        : '새로 생성',
                )
            }
            printKeyValue('분석 미완료 링크', preview.incompleteLinkCount)
        }

        printStep('전체 합계')
        printKeyValue('원본 활성 링크', totalSourceLinks)
        printKeyValue('새로 넣을 링크', totalInsertLinks)
        printKeyValue('새로 넣을 태그', totalInsertTags)
        printKeyValue('중복으로 건너뛸 링크', totalDuplicates)
        printKeyValue('분석 미완료 링크', totalIncomplete)

        if (totalIncomplete > 0) {
            throw new Error(
                '요약·임베딩이 완료되지 않은 링크가 있어 동기화를 중단했습니다.',
            )
        }
        if (!options.apply) {
            printSuccess(
                'dry-run이 완료되었습니다. 실제 반영하려면 --apply --force-production을 추가하세요.',
            )
            return
        }

        let insertedLinks = 0
        let insertedTags = 0
        let skippedDuplicates = 0
        let createdFolders = 0

        const results = await copyLinkGroups(
            targetSql,
            targetMaster.id,
            previews.map(({ snapshot }) => snapshot),
        )

        for (const result of results) {
            insertedLinks += result.insertedLinkCount
            insertedTags += result.insertedTagCount
            skippedDuplicates += result.skippedDuplicateCount
            createdFolders += Number(result.createdFolder)
        }

        printStep('반영 결과')
        printKeyValue('생성한 폴더', createdFolders)
        printKeyValue('삽입한 링크', insertedLinks)
        printKeyValue('삽입한 태그', insertedTags)
        printKeyValue('건너뛴 중복 링크', skippedDuplicates)
        printSuccess('개발→운영 마스터 링크 동기화가 완료되었습니다.')
    } finally {
        await Promise.all([sourceSql.end(), targetSql.end()])
    }
}

function parseCliOptions(args: string[]): CliOptions {
    const options = {
        apply: false,
        forceProduction: false,
        help: false,
    }

    for (const arg of args) {
        if (arg === '--apply') options.apply = true
        else if (arg === '--force-production') options.forceProduction = true
        else if (arg === '--help' || arg === '-h') options.help = true
        else throw new Error(`알 수 없는 옵션: ${arg}`)
    }

    return options
}

function parseMasterUserId(raw: string | undefined) {
    const value = Number(raw)
    if (!Number.isSafeInteger(value) || value <= 0) {
        throw new Error(`MASTER_USER_ID는 양의 정수여야 합니다. 입력값: ${raw}`)
    }
    return value
}

function printHelp() {
    console.log(`📘 사용법
  bun run db:sync:master-links
  bun run db:sync:master-links -- --apply --force-production

⚙️ 동작
  - development 마스터의 활성 폴더와 미분류 링크를 production 마스터로 복제합니다.
  - production 마스터는 development 마스터와 같은 이메일로 찾습니다.
  - 기존 활성 중복 URL은 덮어쓰지 않고 건너뜁니다.
  - 기본은 dry-run이며 실제 반영에는 --apply --force-production이 필요합니다.
`)
}

main().catch((error: unknown) => {
    printError(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
})
