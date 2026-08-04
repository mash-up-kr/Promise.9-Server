#!/usr/bin/env bun
import OpenAI from 'openai'
import postgres from 'postgres'

import {
    EMBEDDING_DIMENSIONS,
    EMBEDDING_MODEL,
} from '../src/common/constants/llm'
import type { LinkMetadata } from '../src/modules/link/link.schema'
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
    title: string | null
    ai_summary: string | null
    memo: string | null
    domain: string | null
    metadata: LinkMetadata | null
}

async function main() {
    const apiKey = process.env.OPENAI_API_KEY

    if (!apiKey) {
        throw new Error('OPENAI_API_KEY 환경변수가 필요합니다.')
    }

    const { appEnv, databaseUrlKey, databaseUrl } = resolveDatabaseConfig()
    const model = EMBEDDING_MODEL.OPENAI_3_LARGE
    const sql = postgres(databaseUrl, { max: 1 })
    const client = new OpenAI({ apiKey })

    try {
        printTitle('🧠 링크 임베딩 백필')
        printKeyValue('대상 환경', `${appEnv} (${databaseUrlKey})`)
        printKeyValue('임베딩 모델', model)
        printStep('임베딩이 없는 활성 링크를 순회하며 생성합니다.')

        let afterId = 0
        let total = 0

        for (;;) {
            const rows = await sql<LinkTextRow[]>`
                select id, title, ai_summary, memo, domain, metadata
                from links
                where embedding is null and deleted_at is null and id > ${afterId}
                order by id
                limit ${BATCH_SIZE}
            `

            if (rows.length === 0) {
                break
            }

            total += await embedAndSave(sql, client, model, rows)
            afterId = rows[rows.length - 1].id
            printKeyValue('진행', `~id ${afterId}, 누적 ${total}건`)

            await sleep(BATCH_DELAY_MS)
        }

        printSuccess(`임베딩 백필이 완료되었습니다. 총 ${total}건 처리.`)
    } finally {
        await sql.end()
    }
}

// 배치의 텍스트를 한 번의 요청으로 임베딩해 각 링크에 저장한다. 처리한 링크 수를 반환.
async function embedAndSave(
    sql: postgres.Sql,
    client: OpenAI,
    model: string,
    rows: LinkTextRow[],
): Promise<number> {
    const targets = rows
        .map((row) => ({ row, text: embeddingTextOf(row) }))
        .filter((target) => target.text.length > 0)

    if (targets.length === 0) {
        return 0
    }

    const embeddings = await embedTexts(
        client,
        model,
        targets.map((target) => target.text),
    )

    await Promise.all(
        targets.map((target, index) => {
            const literal = `[${embeddings[index].join(',')}]`
            const row = target.row
            const metadataCondition =
                row.metadata === null
                    ? sql`metadata is null`
                    : sql`metadata = ${sql.json(row.metadata)}`

            return sql`
                update links
                set embedding = ${literal}::vector
                where id = ${row.id}
                  and embedding is null
                  and title is not distinct from ${row.title}
                  and ai_summary is not distinct from ${row.ai_summary}
                  and memo is not distinct from ${row.memo}
                  and domain is not distinct from ${row.domain}
                  and ${metadataCondition}
            `
        }),
    )

    return targets.length
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
        aiSummary: row.ai_summary,
        memo: row.memo,
        domain: row.domain,
        metadata: row.metadata,
    })
}

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
}

main().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error)

    printError(message)
    process.exitCode = 1
})
