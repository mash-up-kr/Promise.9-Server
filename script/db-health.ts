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
    printSuccess,
    printTitle,
} from './script-log'

import 'dotenv/config'

type CliOptions = {
    env?: RuntimeEnvironment
    schema: string
    help: boolean
}

type HealthRow = {
    databaseName: string
    databaseUser: string
    serverVersion: string
    currentSchema: string
    connectedAt: string
}

type SchemaRow = {
    schemaName: string
}

type TableRow = {
    tableName: string
}

type MigrationRow = {
    exists: boolean
    migrationCount: number
    latestCreatedAt: string | null
}

const DEFAULT_SCHEMA = 'public'

async function main() {
    const options = parseCliOptions(process.argv.slice(2))

    if (options.help) {
        printHelp()
        return
    }

    const { appEnv, databaseUrlKey, databaseUrl } = resolveDatabaseConfig(
        options.env,
    )
    const sql = postgres(databaseUrl, {
        max: 1,
    })

    try {
        const [health] = await sql<HealthRow[]>`
            select
                current_database() as "databaseName",
                current_user as "databaseUser",
                version() as "serverVersion",
                current_schema() as "currentSchema",
                now()::text as "connectedAt"
        `
        const schemas = await sql<SchemaRow[]>`
            select schema_name as "schemaName"
            from information_schema.schemata
            where schema_name not like 'pg_%'
                and schema_name <> 'information_schema'
            order by schema_name
        `
        const tables = await sql<TableRow[]>`
            select table_name as "tableName"
            from information_schema.tables
            where table_schema = ${options.schema}
                and table_type = 'BASE TABLE'
            order by table_name
        `
        const migration = await fetchMigrationStatus(sql)

        printTitle('🩺 DB 상태 확인')
        printKeyValue('대상 환경', `${appEnv} (${databaseUrlKey})`)
        printKeyValue('DB 이름', health.databaseName)
        printKeyValue('DB 사용자', health.databaseUser)
        printKeyValue('현재 스키마', health.currentSchema)
        printKeyValue('연결 시각', health.connectedAt)
        printKeyValue('PostgreSQL', health.serverVersion)
        printKeyValue(
            '스키마 목록',
            schemas.map((row) => row.schemaName).join(', '),
        )
        printKeyValue('테이블 스키마', options.schema)
        printKeyValue(
            `테이블 목록 (${tables.length})`,
            tables.map((row) => row.tableName).join(', ') || '-',
        )

        if (migration.exists) {
            printKeyValue('Drizzle 마이그레이션 수', migration.migrationCount)
            printKeyValue(
                '마지막 마이그레이션 created_at',
                migration.latestCreatedAt ?? '-',
            )
        } else {
            printKeyValue('Drizzle 마이그레이션 테이블', '없음')
        }

        printSuccess('DB 상태 확인이 완료되었습니다.')
    } finally {
        await sql.end()
    }
}

function parseCliOptions(args: string[]): CliOptions {
    const options: CliOptions = {
        schema: DEFAULT_SCHEMA,
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

        if (arg === '--schema') {
            const { value, nextIndex } = readOptionValue(args, index, arg)
            options.schema = value
            index = nextIndex
            continue
        }

        if (arg.startsWith('--schema=')) {
            options.schema = arg.slice('--schema='.length)
            continue
        }

        throw new Error(`알 수 없는 옵션입니다: ${arg}`)
    }

    return options
}

async function fetchMigrationStatus(sql: postgres.Sql) {
    const [tableStatus] = await sql<{ exists: boolean }[]>`
        select
            to_regclass('drizzle.__drizzle_migrations') is not null as "exists"
    `

    if (!tableStatus.exists) {
        return {
            exists: false,
            migrationCount: 0,
            latestCreatedAt: null,
        }
    }

    const [status] = await sql<MigrationRow[]>`
        select
            true as "exists",
            count(*)::int as "migrationCount",
            max(created_at)::text as "latestCreatedAt"
        from drizzle.__drizzle_migrations
    `

    return status
}

function printHelp() {
    console.log(`📘 사용법
  bun run db:health -- --env=development
  bun run db:health -- --env=production

⚙️ 옵션
  -e, --env <development|production>  확인할 DB 환경. 기본값은 APP_ENV 또는 development
      --schema <schema>               테이블 목록을 확인할 PostgreSQL schema. 기본값은 ${DEFAULT_SCHEMA}
  -h, --help                          도움말 출력
`)
}

main().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error)

    printError(message)
    process.exitCode = 1
})
