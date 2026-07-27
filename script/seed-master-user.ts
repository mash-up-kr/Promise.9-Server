#!/usr/bin/env bun
import postgres from 'postgres'

import {
    parseRuntimeEnvironment,
    readOptionValue,
    resolveDatabaseConfig,
    RuntimeEnvironment,
} from './database-env'
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
    email: string
    help: boolean
}

type UserRow = {
    id: number
    email: string
}

const DEFAULT_MASTER_EMAIL = 'master@promise.local'

async function main() {
    const options = parseCliOptions(process.argv.slice(2))

    if (options.help) {
        printHelp()
        return
    }

    const { appEnv, databaseUrlKey, databaseUrl } = resolveDatabaseConfig(
        options.env,
    )
    const masterUserId = parseMasterUserId(process.env.MASTER_USER_ID)
    const sql = postgres(databaseUrl, {
        max: 1,
    })

    try {
        printTitle('🌱 마스터 유저 시드')
        printKeyValue('대상 환경', `${appEnv} (${databaseUrlKey})`)
        printKeyValue('이메일', options.email)
        printKeyValue(
            'MASTER_USER_ID',
            masterUserId ?? '미설정 (부여된 id를 출력합니다)',
        )

        const user =
            masterUserId === undefined
                ? await upsertByEmail(sql, options.email)
                : await upsertWithFixedId(sql, masterUserId, options.email)

        printSuccess('마스터 유저가 준비되었습니다.')
        printKeyValue('유저 id', user.id)
        printKeyValue('유저 email', user.email)

        // 부여된 id가 MASTER_USER_ID와 다르면(또는 미설정이면) 반영해야 인증이 통한다.
        if (masterUserId !== user.id) {
            printStep(
                `.env에 다음 값을 설정하세요:\n  MASTER_USER_ID=${user.id}`,
            )
        }
    } finally {
        await sql.end()
    }
}

// MASTER_USER_ID가 없을 때: 이메일을 기준으로 upsert하고 DB가 부여한 id를 그대로 쓴다.
async function upsertByEmail(
    sql: postgres.Sql,
    email: string,
): Promise<UserRow> {
    const [row] = await sql<UserRow[]>`
        insert into users (email, created_at, updated_at)
        values (${email}, now(), now())
        on conflict (email)
        do update set deleted_at = null, updated_at = now()
        returning id, email
    `

    return row
}

// MASTER_USER_ID가 있을 때: 그 id로 강제 생성한다.
// id는 GENERATED ALWAYS라 OVERRIDING SYSTEM VALUE가 필요하고,
// 이후 일반 insert가 같은 id로 충돌하지 않도록 identity 시퀀스를 보정한다.
async function upsertWithFixedId(
    sql: postgres.Sql,
    id: number,
    email: string,
): Promise<UserRow> {
    const [row] = await sql<UserRow[]>`
        insert into users (id, email, created_at, updated_at)
        overriding system value
        values (${id}, ${email}, now(), now())
        on conflict (id)
        do update set deleted_at = null, updated_at = now()
        returning id, email
    `

    await sql`
        select setval(
            pg_get_serial_sequence('users', 'id'),
            greatest((select max(id) from users), 1)
        )
    `

    return row
}

function parseMasterUserId(raw: string | undefined): number | undefined {
    if (raw === undefined || raw.trim() === '') {
        return undefined
    }

    const parsed = Number(raw)

    if (!Number.isInteger(parsed) || parsed <= 0) {
        throw new Error(`MASTER_USER_ID는 양의 정수여야 합니다. 입력값: ${raw}`)
    }

    return parsed
}

function parseCliOptions(args: string[]): CliOptions {
    const options: CliOptions = {
        email: DEFAULT_MASTER_EMAIL,
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

        if (arg === '--email') {
            const { value, nextIndex } = readOptionValue(args, index, arg)
            options.email = value
            index = nextIndex
            continue
        }

        if (arg.startsWith('--email=')) {
            options.email = arg.slice('--email='.length)
            continue
        }

        throw new Error(`알 수 없는 옵션입니다: ${arg}`)
    }

    return options
}

function printHelp() {
    console.log(`📘 사용법
  bun run db:seed:master
  bun run db:seed:master -- --env=development --email=master@promise.local

⚙️ 옵션
  -e, --env <development|production>  대상 DB 환경. 기본값은 APP_ENV 또는 development
      --email <email>                 마스터 유저 이메일. 기본값은 ${DEFAULT_MASTER_EMAIL}
  -h, --help                          도움말 출력

ℹ️ 동작
  - .env의 MASTER_USER_ID가 있으면 그 id로 유저를 생성/복구합니다.
  - 없으면 이메일 기준으로 생성하고, 부여된 id를 출력하니 .env의 MASTER_USER_ID에 넣으세요.
  - 이미 존재하면 소프트 삭제 상태를 해제(deleted_at=null)만 하고 그대로 둡니다.
`)
}

main().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error)

    printError(message)
    process.exitCode = 1
})
