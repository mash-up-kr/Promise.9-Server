#!/usr/bin/env bun
import OpenAI from 'openai'
import postgres from 'postgres'

import {
    EMBEDDING_DIMENSIONS,
    EMBEDDING_MODEL,
} from '../src/common/constants/llm'
import { buildEmbeddingText } from '../src/modules/link/link.util'

import { resolveDatabaseConfig } from './database-env'
import {
    printError,
    printKeyValue,
    printStep,
    printSuccess,
    printTitle,
} from './script-log'

import 'dotenv/config'

// 한 번에 임베딩할 링크 수. 요청당 토큰 상한을 넘지 않게 보수적으로 잡는다.
const BATCH_SIZE = 32
// 배치 사이 지연. OpenAI 분당 요청 제한(RPM)을 여유 있게 두기 위한 완충.
const BATCH_DELAY_MS = 1_000

// 임베딩 대상 링크 행(스네이크 케이스 컬럼).
type LinkTextRow = {
    id: number
    user_id: number
    title: string | null
    ai_summary: string | null
    tag_names: string[]
}

type CliOptions = {
    userId?: number
    status: boolean
    dryRun: boolean
    forceRefresh: boolean
    help: boolean
}

type EmbeddingStatus = {
    totalCount: number
    nullCount: number
    nonNullCount: number
}

type BackfillTargetCount = {
    targetCount: number
}

type UpdatedLinkRow = {
    id: number
}

export async function runBackfillCli(args: string[]): Promise<void> {
    const options = parseCliOptions(args)

    if (options.help) {
        printHelp()
        return
    }

    const { appEnv, databaseUrlKey, databaseUrl } = resolveDatabaseConfig()
    const model = EMBEDDING_MODEL.OPENAI_3_LARGE
    const sql = postgres(databaseUrl, { max: 1 })

    try {
        if (options.status) {
            const status = await readEmbeddingStatus(sql, options.userId)

            printTitle('📊 링크 임베딩 상태')
            printKeyValue('대상 환경', `${appEnv} (${databaseUrlKey})`)
            printKeyValue('사용자 범위', userScopeLabel(options.userId))
            printKeyValue('대상 활성 링크', status.totalCount)
            printKeyValue('embedding NULL', status.nullCount)
            printKeyValue('embedding non-null', status.nonNullCount)
            printSuccess('임베딩 상태 확인이 완료되었습니다.')
            return
        }

        if (options.dryRun) {
            const { targetCount } = await readBackfillTargetCount(
                sql,
                options.userId,
                options.forceRefresh,
            )

            printTitle('🧪 링크 임베딩 백필 dry-run')
            printKeyValue('대상 환경', `${appEnv} (${databaseUrlKey})`)
            printKeyValue('사용자 범위', userScopeLabel(options.userId))
            printKeyValue(
                '처리 모드',
                options.forceRefresh
                    ? '전체 활성 링크 강제 갱신'
                    : '미생성 링크 백필',
            )
            printKeyValue('예상 대상 링크', targetCount)
            printKeyValue('예상 최대 API 배치', estimateBatchCount(targetCount))
            printSuccess('dry-run이 완료되었습니다. DB는 변경하지 않았습니다.')
            return
        }

        const apiKey = process.env.OPENAI_API_KEY

        if (!apiKey) {
            throw new Error('OPENAI_API_KEY 환경변수가 필요합니다.')
        }

        const client = new OpenAI({ apiKey })

        printTitle('🧠 링크 임베딩 백필')
        printKeyValue('대상 환경', `${appEnv} (${databaseUrlKey})`)
        printKeyValue('사용자 범위', userScopeLabel(options.userId))
        printKeyValue('임베딩 모델', model)
        printKeyValue(
            '처리 모드',
            options.forceRefresh
                ? '전체 활성 링크 강제 갱신'
                : '미생성 링크 백필',
        )
        printStep(
            options.forceRefresh
                ? '기존 벡터도 새 제목·태그·AI 요약 규칙으로 갱신합니다.'
                : '임베딩이 없는 활성 링크를 순회하며 생성합니다.',
        )

        let afterId = 0
        let total = 0

        for (;;) {
            const rows = await sql<LinkTextRow[]>`
                select
                    l.id,
                    l.user_id,
                    l.title,
                    l.ai_summary,
                    coalesce(
                        array_agg(t.name order by t.sort_order, t.id)
                            filter (where t.id is not null),
                        array[]::varchar[]
                    ) as tag_names
                from links l
                left join tags t
                  on t.link_id = l.id
                 and t.user_id = l.user_id
                where l.deleted_at is null
                  and l.id > ${afterId}
                  and (${options.userId === undefined} or l.user_id = ${options.userId ?? 0})
                  and (${options.forceRefresh} or l.embedding is null)
                group by l.id
                order by l.id
                limit ${BATCH_SIZE}
            `

            if (rows.length === 0) {
                break
            }

            total += await embedAndSave(
                sql,
                client,
                model,
                rows,
                options.forceRefresh,
            )
            afterId = rows[rows.length - 1].id
            printKeyValue('진행', `~id ${afterId}, 누적 ${total}건`)

            await sleep(BATCH_DELAY_MS)
        }

        printSuccess(`임베딩 백필이 완료되었습니다. 총 ${total}건 처리.`)
    } finally {
        await sql.end()
    }
}

async function readEmbeddingStatus(
    sql: postgres.Sql,
    userId: number | undefined,
): Promise<EmbeddingStatus> {
    const [status] = await sql<EmbeddingStatus[]>`
        select
            count(*)::int as "totalCount",
            count(*) filter (where l.embedding is null)::int as "nullCount",
            count(*) filter (where l.embedding is not null)::int as "nonNullCount"
        from links l
        where l.deleted_at is null
          and (${userId === undefined} or l.user_id = ${userId ?? 0})
    `

    return status
}

async function readBackfillTargetCount(
    sql: postgres.Sql,
    userId: number | undefined,
    forceRefresh: boolean,
): Promise<BackfillTargetCount> {
    const [count] = await sql<BackfillTargetCount[]>`
        select count(*)::int as "targetCount"
        from links l
        where l.deleted_at is null
          and (${userId === undefined} or l.user_id = ${userId ?? 0})
          and (${forceRefresh} or l.embedding is null)
    `

    return count
}

export function parseCliOptions(args: string[]): CliOptions {
    const options: CliOptions = {
        status: false,
        dryRun: false,
        forceRefresh: false,
        help: false,
    }

    for (let index = 0; index < args.length; index += 1) {
        const arg = args[index]

        if (arg === '--help' || arg === '-h') {
            options.help = true
            continue
        }

        if (arg === '--status') {
            options.status = true
            continue
        }

        if (arg === '--dry-run') {
            options.dryRun = true
            continue
        }

        if (arg === '--force-refresh') {
            options.forceRefresh = true
            continue
        }

        if (arg === '--user-id') {
            const value = args[index + 1]

            if (value === undefined || value.startsWith('--')) {
                throw new Error('--user-id 옵션의 값이 필요합니다.')
            }

            options.userId = parsePositiveInteger(value, '--user-id')
            index += 1
            continue
        }

        if (arg.startsWith('--user-id=')) {
            options.userId = parsePositiveInteger(
                arg.slice('--user-id='.length),
                '--user-id',
            )
            continue
        }

        throw new Error(`알 수 없는 옵션입니다: ${arg}`)
    }

    if (options.status && options.dryRun) {
        throw new Error('--status와 --dry-run은 함께 사용할 수 없습니다.')
    }

    if (options.status && options.forceRefresh) {
        throw new Error('--status와 --force-refresh는 함께 사용할 수 없습니다.')
    }

    return options
}

function parsePositiveInteger(value: string, optionName: string): number {
    if (!/^\d+$/.test(value)) {
        throw new Error(`${optionName}는 양의 정수여야 합니다: ${value}`)
    }

    const parsed = Number(value)

    if (!Number.isSafeInteger(parsed) || parsed <= 0) {
        throw new Error(`${optionName}는 양의 안전한 정수여야 합니다: ${value}`)
    }

    return parsed
}

export function estimateBatchCount(targetCount: number): number {
    return Math.ceil(targetCount / BATCH_SIZE)
}

function userScopeLabel(userId: number | undefined): string {
    return userId === undefined ? '전체 사용자' : `userId=${userId}`
}

function printHelp() {
    console.log(`📘 사용법
  bun run db:backfill:embeddings -- [옵션]

⚙️ 옵션
      --user-id <id>   특정 사용자의 활성 링크만 대상으로 지정
      --status         대상 활성 링크의 전체·NULL·non-null 개수만 조회
      --dry-run        API 호출·DB 변경 없이 대상 개수와 최대 배치 수를 예상
      --force-refresh  기존 임베딩을 포함한 전체 활성 링크 갱신
  -h, --help           도움말 출력

예시
  bun run db:backfill:embeddings -- --user-id=1 --status
  bun run db:backfill:embeddings -- --user-id=1 --dry-run
  bun run db:backfill:embeddings -- --user-id=1 --force-refresh --dry-run
`)
}

// 배치의 텍스트를 한 번의 요청으로 임베딩해 각 링크에 저장한다. 처리한 링크 수를 반환.
async function embedAndSave(
    sql: postgres.Sql,
    client: OpenAI,
    model: string,
    rows: LinkTextRow[],
    forceRefresh: boolean,
): Promise<number> {
    const resolvedRows = rows.map((row) => ({
        row,
        text: embeddingTextOf(row),
    }))
    const targets = resolvedRows.filter((target) => target.text.length > 0)
    const emptyRows = resolvedRows.filter((target) => target.text.length === 0)

    // 강제 갱신 시 새 규칙에서 원본이 빈 링크의 과거(domain·description 기반) 벡터는 제거한다.
    let clearedCount = 0

    if (forceRefresh && emptyRows.length > 0) {
        const clearedRows = await Promise.all(
            emptyRows.map(
                ({ row }) => sql<UpdatedLinkRow[]>`
                update links
                set embedding = null
                where id = ${row.id}
                  and user_id = ${row.user_id}
                  and deleted_at is null
                  and title is not distinct from ${row.title}
                  and ai_summary is not distinct from ${row.ai_summary}
                  and coalesce((
                      select array_agg(t.name order by t.sort_order, t.id)
                      from tags t
                      where t.user_id = ${row.user_id}
                        and t.link_id = ${row.id}
                  ), array[]::varchar[]) = ${row.tag_names}::varchar[]
                returning id
            `,
            ),
        )
        clearedCount = clearedRows.reduce(
            (count, rows) => count + rows.length,
            0,
        )
    }

    if (targets.length === 0) {
        return clearedCount
    }

    const embeddings = await embedTexts(
        client,
        model,
        targets.map((target) => target.text),
    )

    const updatedRows = await Promise.all(
        targets.map((target, index) => {
            const literal = `[${embeddings[index].join(',')}]`
            const row = target.row
            const embeddingCondition = forceRefresh
                ? sql`true`
                : sql`embedding is null`

            return sql<UpdatedLinkRow[]>`
                update links
                set embedding = ${literal}::vector
                where id = ${row.id}
                  and user_id = ${row.user_id}
                  and deleted_at is null
                  and ${embeddingCondition}
                  and title is not distinct from ${row.title}
                  and ai_summary is not distinct from ${row.ai_summary}
                  and coalesce((
                      select array_agg(t.name order by t.sort_order, t.id)
                      from tags t
                      where t.user_id = ${row.user_id}
                        and t.link_id = ${row.id}
                  ), array[]::varchar[]) = ${row.tag_names}::varchar[]
                returning id
            `
        }),
    )

    return (
        clearedCount +
        updatedRows.reduce((count, rows) => count + rows.length, 0)
    )
}

// 여러 텍스트를 한 번에 임베딩한다. text-embedding-3-large는 축소 차원도 정규화해 반환한다.
async function embedTexts(
    client: OpenAI,
    model: string,
    texts: string[],
): Promise<number[][]> {
    const response = await client.embeddings.create({
        model,
        input: texts,
        dimensions: EMBEDDING_DIMENSIONS,
    })

    // 응답 data 순서가 입력 순서와 어긋날 수 있어 index로 정렬한다.
    return [...response.data]
        .sort((a, b) => a.index - b.index)
        .map((item) => item.embedding)
}

// 런타임 임베딩과 동일한 규칙으로 텍스트를 조립한다(스네이크 → 카멜 어댑터).
function embeddingTextOf(row: LinkTextRow): string {
    return buildEmbeddingText({
        title: row.title,
        tagNames: row.tag_names,
        aiSummary: row.ai_summary,
    })
}

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
}

if (require.main === module) {
    void runBackfillCli(process.argv.slice(2)).catch((error: unknown) => {
        const message = error instanceof Error ? error.message : String(error)

        printError(message)
        process.exitCode = 1
    })
}
