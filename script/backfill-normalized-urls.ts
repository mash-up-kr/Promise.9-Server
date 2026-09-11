#!/usr/bin/env bun
import postgres from 'postgres'

import { normalizeUrl } from '../src/modules/link/link.util'

import { resolveDatabaseConfig } from './database-env'
import {
    printError,
    printKeyValue,
    printStep,
    printSuccess,
    printTitle,
} from './script-log'

import 'dotenv/config'

// 한 번에 읽어 처리할 링크 수. 정규화 계산은 전부 로컬이라 DB 왕복만 줄이면 된다.
const BATCH_SIZE = 200

type LinkUrlRow = {
    id: number
    user_id: number
    original_url: string
    normalized_url: string
}

type CliOptions = {
    dryRun: boolean
    help: boolean
}

// 정규화 규칙이 바뀌기 전에 저장된 링크는 옛 키를 그대로 갖고 있어, 같은 게시물을 다른
// 공유 파라미터로 다시 저장하면 중복 검사가 통하지 않는다. 활성 링크의 키를 새 규칙으로
// 다시 계산하되, 같은 사용자 안에서 키가 충돌하는 행은 건드리지 않고 목록만 남긴다.
export async function runBackfillCli(args: string[]): Promise<void> {
    const options = parseCliOptions(args)

    if (options.help) {
        printHelp()
        return
    }

    const { appEnv, databaseUrlKey, databaseUrl } = resolveDatabaseConfig()
    const sql = postgres(databaseUrl, { max: 1 })

    try {
        printTitle(
            options.dryRun
                ? '🧪 링크 정규화 URL 백필 dry-run'
                : '🔗 링크 정규화 URL 백필',
        )
        printKeyValue('대상 환경', `${appEnv} (${databaseUrlKey})`)
        printStep('활성 링크의 normalized_url을 현재 규칙으로 다시 계산합니다.')

        let afterId = 0
        let scanned = 0
        let updated = 0
        const conflicts: Array<{ id: number; conflictId: number }> = []

        for (;;) {
            const rows = await sql<LinkUrlRow[]>`
                select l.id, l.user_id, l.original_url, l.normalized_url
                from links l
                where l.deleted_at is null
                  and l.id > ${afterId}
                order by l.id
                limit ${BATCH_SIZE}
            `

            if (rows.length === 0) break

            for (const row of rows) {
                scanned += 1

                const nextKey = normalizeUrl(row.original_url)
                if (nextKey === row.normalized_url) continue

                // 새 키를 이미 쓰는 다른 활성 링크가 있으면 유니크 인덱스에 걸리므로 건너뛴다.
                const [conflict] = await sql<{ id: number }[]>`
                    select id
                    from links
                    where user_id = ${row.user_id}
                      and normalized_url = ${nextKey}
                      and deleted_at is null
                      and id <> ${row.id}
                    limit 1
                `

                if (conflict) {
                    conflicts.push({ id: row.id, conflictId: conflict.id })
                    continue
                }

                if (!options.dryRun) {
                    await sql`
                        update links
                        set normalized_url = ${nextKey}
                        where id = ${row.id}
                          and deleted_at is null
                          and normalized_url = ${row.normalized_url}
                    `
                }

                updated += 1
            }

            afterId = rows[rows.length - 1].id
            printKeyValue('진행', `~id ${afterId}, 스캔 ${scanned}건`)
        }

        printKeyValue('스캔한 링크', scanned)
        printKeyValue('키를 바꾼 링크', updated)
        printKeyValue('충돌로 건너뛴 링크', conflicts.length)

        for (const { id, conflictId } of conflicts) {
            // 같은 사용자가 이미 같은 게시물을 두 번 저장한 경우다. 병합·삭제는 별도로 판단한다.
            printKeyValue(`  링크 ${id}`, `기존 링크 ${conflictId}와 같은 키`)
        }

        printSuccess(
            options.dryRun
                ? 'dry-run이 완료되었습니다. DB는 변경하지 않았습니다.'
                : `백필이 완료되었습니다. 총 ${updated}건 갱신.`,
        )
    } finally {
        await sql.end()
    }
}

export function parseCliOptions(args: string[]): CliOptions {
    const options: CliOptions = {
        dryRun: false,
        help: false,
    }

    for (const arg of args) {
        if (arg === '--help' || arg === '-h') {
            options.help = true
            continue
        }

        if (arg === '--dry-run') {
            options.dryRun = true
            continue
        }

        throw new Error(`알 수 없는 옵션입니다: ${arg}`)
    }

    return options
}

function printHelp() {
    console.log(`📘 사용법
  bun run db:backfill:normalized-urls -- [옵션]

⚙️ 옵션
      --dry-run  DB 변경 없이 바뀔 링크 수와 충돌 목록만 확인
  -h, --help     도움말 출력

예시
  bun run db:backfill:normalized-urls -- --dry-run
  bun run db:backfill:normalized-urls
`)
}

if (require.main === module) {
    void runBackfillCli(process.argv.slice(2)).catch((error: unknown) => {
        const message = error instanceof Error ? error.message : String(error)

        printError(message)
        process.exitCode = 1
    })
}
