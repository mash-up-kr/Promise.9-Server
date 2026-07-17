#!/usr/bin/env bun
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'

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

type OutputFormat = 'markdown' | 'mermaid'

type CliOptions = {
    env?: RuntimeEnvironment
    output: string
    schema: string
    format: OutputFormat
    help: boolean
}

type ColumnRow = {
    tableSchema: string
    tableName: string
    columnName: string
    ordinalPosition: number
    dataType: string
    udtName: string
    isNullable: 'YES' | 'NO'
    columnDefault: string | null
    characterMaximumLength: number | null
    numericPrecision: number | null
    numericScale: number | null
}

type KeyColumnRow = {
    tableName: string
    columnName: string
    constraintType: 'PRIMARY KEY' | 'UNIQUE'
}

type ForeignKeyRow = {
    tableName: string
    columnName: string
    constraintName: string
    foreignTableName: string
    foreignColumnName: string
    ordinalPosition: number
    isNullable: 'YES' | 'NO'
}

type TableMetadata = {
    name: string
    columns: ColumnMetadata[]
}

type ColumnMetadata = {
    name: string
    type: string
    isNullable: boolean
    isPrimaryKey: boolean
    isForeignKey: boolean
    isUnique: boolean
}

const DEFAULT_SCHEMA = 'public'
const DEFAULT_OUTPUT = 'docs/database/erd.md'

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
        const [columns, keyColumns, foreignKeys] = await Promise.all([
            fetchColumns(sql, options.schema),
            fetchKeyColumns(sql, options.schema),
            fetchForeignKeys(sql, options.schema),
        ])
        const tables = buildTableMetadata(columns, keyColumns, foreignKeys)
        const mermaid = renderMermaidErDiagram(tables, foreignKeys)
        const output =
            options.format === 'markdown'
                ? renderMarkdown({
                      appEnv,
                      databaseUrlKey,
                      schema: options.schema,
                      tables,
                      mermaid,
                  })
                : `${mermaid}\n`
        const outputPath = resolve(process.cwd(), options.output)

        await mkdir(dirname(outputPath), { recursive: true })
        await writeFile(outputPath, output)

        printTitle('🗺️ Mermaid ERD 생성')
        printKeyValue('대상 환경', `${appEnv} (${databaseUrlKey})`)
        printKeyValue('대상 스키마', options.schema)
        printKeyValue('테이블 수', tables.length)
        printKeyValue('저장 위치', outputPath)
        printSuccess('데이터베이스 구조 시각화 파일이 생성되었습니다.')
    } finally {
        await sql.end()
    }
}

function parseCliOptions(args: string[]): CliOptions {
    const options: CliOptions = {
        output: DEFAULT_OUTPUT,
        schema: DEFAULT_SCHEMA,
        format: 'markdown',
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

        if (arg === '--output' || arg === '-o') {
            const { value, nextIndex } = readOptionValue(args, index, arg)
            options.output = value
            index = nextIndex
            continue
        }

        if (arg.startsWith('--output=')) {
            options.output = arg.slice('--output='.length)
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

        if (arg === '--format') {
            const { value, nextIndex } = readOptionValue(args, index, arg)
            options.format = parseOutputFormat(value)
            index = nextIndex
            continue
        }

        if (arg.startsWith('--format=')) {
            options.format = parseOutputFormat(arg.slice('--format='.length))
            continue
        }

        throw new Error(`알 수 없는 옵션입니다: ${arg}`)
    }

    return options
}

function parseOutputFormat(value: string): OutputFormat {
    if (value === 'markdown' || value === 'mermaid') {
        return value
    }

    throw new Error(
        `출력 포맷은 markdown 또는 mermaid여야 합니다. 입력값: ${value}`,
    )
}

async function fetchColumns(
    sql: postgres.Sql,
    schema: string,
): Promise<ColumnRow[]> {
    return sql<ColumnRow[]>`
        select
            c.table_schema as "tableSchema",
            c.table_name as "tableName",
            c.column_name as "columnName",
            c.ordinal_position as "ordinalPosition",
            c.data_type as "dataType",
            c.udt_name as "udtName",
            c.is_nullable as "isNullable",
            c.column_default as "columnDefault",
            c.character_maximum_length as "characterMaximumLength",
            c.numeric_precision as "numericPrecision",
            c.numeric_scale as "numericScale"
        from information_schema.columns c
        join information_schema.tables t
            on t.table_schema = c.table_schema
            and t.table_name = c.table_name
        where c.table_schema = ${schema}
            and t.table_type = 'BASE TABLE'
        order by c.table_name, c.ordinal_position
    `
}

async function fetchKeyColumns(
    sql: postgres.Sql,
    schema: string,
): Promise<KeyColumnRow[]> {
    return sql<KeyColumnRow[]>`
        select
            tc.table_name as "tableName",
            kcu.column_name as "columnName",
            tc.constraint_type as "constraintType"
        from information_schema.table_constraints tc
        join information_schema.key_column_usage kcu
            on kcu.constraint_schema = tc.constraint_schema
            and kcu.constraint_name = tc.constraint_name
            and kcu.table_schema = tc.table_schema
            and kcu.table_name = tc.table_name
        where tc.table_schema = ${schema}
            and tc.constraint_type in ('PRIMARY KEY', 'UNIQUE')
    `
}

async function fetchForeignKeys(
    sql: postgres.Sql,
    schema: string,
): Promise<ForeignKeyRow[]> {
    return sql<ForeignKeyRow[]>`
        select
            source_table.relname as "tableName",
            source_column.attname as "columnName",
            constraint_info.conname as "constraintName",
            target_table.relname as "foreignTableName",
            target_column.attname as "foreignColumnName",
            column_pair.ordinality as "ordinalPosition",
            information_schema_column.is_nullable as "isNullable"
        from pg_constraint constraint_info
        join pg_class source_table
            on source_table.oid = constraint_info.conrelid
        join pg_namespace source_schema
            on source_schema.oid = source_table.relnamespace
        join pg_class target_table
            on target_table.oid = constraint_info.confrelid
        join pg_namespace target_schema
            on target_schema.oid = target_table.relnamespace
        join unnest(
            constraint_info.conkey,
            constraint_info.confkey
        ) with ordinality as column_pair(source_attnum, target_attnum, ordinality)
            on true
        join pg_attribute source_column
            on source_column.attrelid = source_table.oid
            and source_column.attnum = column_pair.source_attnum
        join pg_attribute target_column
            on target_column.attrelid = target_table.oid
            and target_column.attnum = column_pair.target_attnum
        join information_schema.columns information_schema_column
            on information_schema_column.table_schema = source_schema.nspname
            and information_schema_column.table_name = source_table.relname
            and information_schema_column.column_name = source_column.attname
        where constraint_info.contype = 'f'
            and source_schema.nspname = ${schema}
            and target_schema.nspname = ${schema}
        order by source_table.relname, constraint_info.conname, column_pair.ordinality
    `
}

function buildTableMetadata(
    columns: ColumnRow[],
    keyColumns: KeyColumnRow[],
    foreignKeys: ForeignKeyRow[],
) {
    const primaryKeys = new Set(
        keyColumns
            .filter((keyColumn) => keyColumn.constraintType === 'PRIMARY KEY')
            .map(createColumnKey),
    )
    const uniqueKeys = new Set(
        keyColumns
            .filter((keyColumn) => keyColumn.constraintType === 'UNIQUE')
            .map(createColumnKey),
    )
    const foreignKeyColumns = new Set(foreignKeys.map(createColumnKey))
    const tables = new Map<string, TableMetadata>()

    for (const column of columns) {
        const table = getOrCreateTable(tables, column.tableName)
        const columnKey = createColumnKey(column)

        table.columns.push({
            name: column.columnName,
            type: formatColumnType(column),
            isNullable: column.isNullable === 'YES',
            isPrimaryKey: primaryKeys.has(columnKey),
            isForeignKey: foreignKeyColumns.has(columnKey),
            isUnique: uniqueKeys.has(columnKey),
        })
    }

    return [...tables.values()].sort((left, right) =>
        left.name.localeCompare(right.name),
    )
}

function getOrCreateTable(
    tables: Map<string, TableMetadata>,
    tableName: string,
) {
    const existing = tables.get(tableName)

    if (existing) {
        return existing
    }

    const created = {
        name: tableName,
        columns: [],
    }

    tables.set(tableName, created)

    return created
}

function createColumnKey(column: { tableName: string; columnName: string }) {
    return `${column.tableName}.${column.columnName}`
}

function formatColumnType(column: ColumnRow) {
    if (column.characterMaximumLength) {
        return `${column.dataType}(${column.characterMaximumLength})`
    }

    if (column.numericPrecision && column.numericScale !== null) {
        return `${column.dataType}(${column.numericPrecision},${column.numericScale})`
    }

    return column.dataType === 'USER-DEFINED' ? column.udtName : column.dataType
}

function renderMarkdown({
    appEnv,
    databaseUrlKey,
    schema,
    tables,
    mermaid,
}: {
    appEnv: RuntimeEnvironment
    databaseUrlKey: string
    schema: string
    tables: TableMetadata[]
    mermaid: string
}) {
    return `# Database ERD

- 환경: ${appEnv} (${databaseUrlKey})
- 스키마: ${schema}
- 테이블 수: ${tables.length}
- 생성 시각: ${new Date().toISOString()}

\`\`\`mermaid
${mermaid}
\`\`\`
`
}

function renderMermaidErDiagram(
    tables: TableMetadata[],
    foreignKeys: ForeignKeyRow[],
) {
    const lines = ['erDiagram']
    const entityNames = createEntityNameMap(tables)

    for (const table of tables) {
        lines.push(`    ${entityNames.get(table.name)} {`)

        for (const column of table.columns) {
            lines.push(`        ${renderColumn(column)}`)
        }

        lines.push('    }')
        lines.push('')
    }

    for (const relation of groupForeignKeys(foreignKeys)) {
        const sourceEntityName = entityNames.get(relation.tableName)
        const targetEntityName = entityNames.get(relation.foreignTableName)

        if (!sourceEntityName || !targetEntityName) {
            continue
        }

        const sourceCardinality = relation.isNullable ? 'o{' : '|{'

        lines.push(
            `    ${targetEntityName} ||--${sourceCardinality} ${sourceEntityName} : "${relation.label}"`,
        )
    }

    return lines.join('\n').trimEnd()
}

function createEntityNameMap(tables: TableMetadata[]) {
    const entityNames = new Map<string, string>()
    const usedEntityNames = new Set<string>()

    for (const table of tables) {
        const baseName = sanitizeMermaidIdentifier(table.name).toUpperCase()
        let entityName = baseName
        let suffix = 2

        while (usedEntityNames.has(entityName)) {
            entityName = `${baseName}_${suffix}`
            suffix += 1
        }

        usedEntityNames.add(entityName)
        entityNames.set(table.name, entityName)
    }

    return entityNames
}

function renderColumn(column: ColumnMetadata) {
    const keys = [
        column.isPrimaryKey ? 'PK' : undefined,
        column.isForeignKey ? 'FK' : undefined,
        column.isUnique ? 'UK' : undefined,
    ].filter(Boolean)
    const suffix = keys.length > 0 ? ` ${keys.join(', ')}` : ''

    return `${sanitizeMermaidIdentifier(column.type)} ${sanitizeMermaidIdentifier(
        column.name,
    )}${suffix}`
}

function groupForeignKeys(foreignKeys: ForeignKeyRow[]) {
    const grouped = new Map<
        string,
        {
            tableName: string
            foreignTableName: string
            isNullable: boolean
            pairs: { source: string; target: string; ordinalPosition: number }[]
        }
    >()

    for (const foreignKey of foreignKeys) {
        const key = `${foreignKey.tableName}.${foreignKey.constraintName}`
        const existing = grouped.get(key)
        const relation = existing ?? {
            tableName: foreignKey.tableName,
            foreignTableName: foreignKey.foreignTableName,
            isNullable: true,
            pairs: [],
        }

        relation.isNullable =
            relation.isNullable && foreignKey.isNullable === 'YES'
        relation.pairs.push({
            source: foreignKey.columnName,
            target: foreignKey.foreignColumnName,
            ordinalPosition: foreignKey.ordinalPosition,
        })

        grouped.set(key, relation)
    }

    return [...grouped.values()].map((relation) => {
        const label = relation.pairs
            .sort((left, right) => left.ordinalPosition - right.ordinalPosition)
            .map((pair) => `${pair.target} to ${pair.source}`)
            .join(', ')

        return {
            tableName: relation.tableName,
            foreignTableName: relation.foreignTableName,
            isNullable: relation.isNullable,
            label,
        }
    })
}

function sanitizeMermaidIdentifier(value: string) {
    const sanitized = value.replace(/[^a-zA-Z0-9_-]+/g, '_')

    if (/^[0-9]/.test(sanitized)) {
        return `_${sanitized}`
    }

    return sanitized || 'unknown'
}

function printHelp() {
    console.log(`📘 사용법
  bun run db:visualize_mermaid -- --env=development
  bun run db:visualize_mermaid -- --env=production

⚙️ 옵션
  -e, --env <development|production>  시각화할 DB 환경. 기본값은 APP_ENV 또는 development
  -o, --output <path>                 저장할 파일 경로. 기본값은 ${DEFAULT_OUTPUT}
      --schema <schema>               조회할 PostgreSQL schema. 기본값은 ${DEFAULT_SCHEMA}
      --format <markdown|mermaid>     Markdown 문서 또는 Mermaid 원문. 기본값은 markdown
  -h, --help                          도움말 출력
`)
}

main().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error)

    printError(message)
    process.exitCode = 1
})
