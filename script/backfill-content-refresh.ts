#!/usr/bin/env bun
import postgres from 'postgres'

import { LinkMetadata } from '../src/modules/link/link.schema'
import { pickContentRefreshDueAt } from '../src/modules/link/link.util'

import { resolveDatabaseConfig } from './database-env'
import {
    printError,
    printKeyValue,
    printStep,
    printSuccess,
    printTitle,
} from './script-log'

import 'dotenv/config'

// 한 번에 읽어 처리할 링크 수. 계산은 전부 로컬이라 DB 왕복만 줄이면 된다.
const BATCH_SIZE = 200

// 백필 대상 링크 행(스네이크 케이스 컬럼).
type LinkRefreshRow = {
    id: number
    url: string
    metadata: LinkMetadata | null
    created_at: Date
}

type CliOptions = {
    dryRun: boolean
    help: boolean
}

// 컬럼이 추가되기 전에 저장된 링크는 content_refresh_due_at이 NULL이라 스케줄러가 영영
// 집지 않는다. 기존 링크에도 기한을 채워, 만료된 Instagram 썸네일과 30일이 지난 YouTube
// 메타데이터가 갱신 대상에 들어오게 한다.
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
                ? '🧪 CONTENT 재수집 기한 백필 dry-run'
                : '🗓️ CONTENT 재수집 기한 백필',
        )
        printKeyValue('대상 환경', `${appEnv} (${databaseUrlKey})`)
        printStep(
            '기한이 없는 활성 링크를 순회하며 썸네일 TTL·YouTube 30일 정책 기한을 계산합니다.',
        )

        let afterId = 0
        let scanned = 0
        let updated = 0
        let skipped = 0

        for (;;) {
            const rows = await sql<LinkRefreshRow[]>`
                select
                    l.id,
                    coalesce(l.final_url, l.original_url) as url,
                    l.metadata,
                    l.created_at
                from links l
                where l.deleted_at is null
                  and l.content_refresh_due_at is null
                  and l.id > ${afterId}
                order by l.id
                limit ${BATCH_SIZE}
            `

            if (rows.length === 0) break

            for (const row of rows) {
                scanned += 1

                // 기준 시각은 created_at이다. 대상이 content_refresh_due_at IS NULL인 링크,
                // 즉 새 갱신 로직을 한 번도 거치지 않은 링크뿐이라 콘텐츠 수집 시각은 생성 시각과
                // 같다. updated_at은 메모·즐겨찾기·폴더 이동으로도 갱신되므로, 그걸 쓰면 최근에
                // 메모만 고친 오래된 영상이 "지금부터 30일 뒤"를 받아 30일 정책을 더 어기게 된다.
                const dueAt = pickContentRefreshDueAt(
                    row.url,
                    row.metadata,
                    row.created_at,
                )

                if (!dueAt) {
                    // 갱신 사유가 없는 링크(TTL 없는 썸네일, YouTube 아님)는 NULL로 둔다.
                    skipped += 1
                    continue
                }

                if (!options.dryRun) {
                    await sql`
                        update links
                        set content_refresh_due_at = ${dueAt}
                        where id = ${row.id}
                          and deleted_at is null
                          and content_refresh_due_at is null
                    `
                }

                updated += 1
            }

            afterId = rows[rows.length - 1].id
            printKeyValue('진행', `~id ${afterId}, 스캔 ${scanned}건`)
        }

        printKeyValue('스캔한 링크', scanned)
        printKeyValue('기한을 채운 링크', updated)
        printKeyValue('갱신 사유 없어 건너뛴 링크', skipped)

        printSuccess(
            options.dryRun
                ? 'dry-run이 완료되었습니다. DB는 변경하지 않았습니다.'
                : `백필이 완료되었습니다. 총 ${updated}건 설정.`,
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
  bun run db:backfill:content-refresh -- [옵션]

⚙️ 옵션
      --dry-run  DB 변경 없이 채워질 링크 수만 확인
  -h, --help     도움말 출력

예시
  bun run db:backfill:content-refresh -- --dry-run
  bun run db:backfill:content-refresh
`)
}

if (require.main === module) {
    void runBackfillCli(process.argv.slice(2)).catch((error: unknown) => {
        const message = error instanceof Error ? error.message : String(error)

        printError(message)
        process.exitCode = 1
    })
}
