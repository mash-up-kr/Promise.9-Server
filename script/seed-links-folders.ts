#!/usr/bin/env bun
import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'

import * as schema from '../src/config/database/schema'
import { folders } from '../src/modules/folder/folder.schema'
import { links } from '../src/modules/link/link.schema'
import { users } from '../src/modules/user/user.schema'

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

// 링크/폴더 목록의 페이지네이션·정렬·집계를 눈으로 확인하기 위한 시드 데이터.
// 고정 이메일의 시드 전용 사용자를 재사용하고, 매 실행마다 그 사용자의 링크·폴더를
// 지우고 다시 넣어 idempotent하게 동작한다. (운영 데이터는 건드리지 않는다)
const SEED_USER_EMAIL = 'dev-seed@promise.local'

type CliOptions = {
    env?: RuntimeEnvironment
    help: boolean
}

// 타임스탬프를 결정적으로 만들기 위한 기준 시각. 여기서 분 단위로 빼며 배치한다.
const BASE = new Date('2026-07-01T00:00:00.000Z')
const minutesAgo = (minutes: number) =>
    new Date(BASE.getTime() - minutes * 60_000)

function parseArgs(argv: string[]): CliOptions {
    const options: CliOptions = { help: false }

    for (let index = 0; index < argv.length; index += 1) {
        const arg = argv[index]
        if (arg === '--help' || arg === '-h') {
            options.help = true
        } else if (arg === '--env') {
            const { value, nextIndex } = readOptionValue(argv, index, '--env')
            options.env = parseRuntimeEnvironment(value)
            index = nextIndex
        } else {
            throw new Error(`알 수 없는 옵션: ${arg}`)
        }
    }

    return options
}

function printHelp() {
    printTitle('링크/폴더 시드 스크립트')
    console.log(
        [
            '',
            '사용법: bun run script/seed-links-folders.ts [--env development|production]',
            '',
            `  고정 사용자(${SEED_USER_EMAIL})의 링크·폴더를 초기화하고 시드 데이터를 넣습니다.`,
            '  기본 env는 development이며, production은 명시적으로 지정해야 합니다.',
        ].join('\n'),
    )
}

// 시드 전용 사용자 id를 확보한다. (없으면 생성)
async function ensureSeedUser(db: ReturnType<typeof drizzle<typeof schema>>) {
    await db
        .insert(users)
        .values({ email: SEED_USER_EMAIL })
        .onConflictDoNothing({ target: users.email })

    const [user] = await db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.email, SEED_USER_EMAIL))
        .limit(1)

    if (!user) {
        throw new Error('시드 사용자 생성/조회에 실패했습니다.')
    }

    return user.id
}

type FolderSeed = {
    key: string
    name: string
    color: string
    createdAt: Date
    updatedAt: Date
}

// 폴더 정렬(createdAt/updatedAt/lastSavedAt)을 구분해서 볼 수 있도록
// 생성·수정 시각을 서로 엇갈리게 배치한다. "빈 폴더"는 lastSavedAt=null 확인용.
const FOLDER_SEEDS: FolderSeed[] = [
    {
        key: 'dev',
        name: '개발 블로그',
        color: '#61a8ef',
        createdAt: minutesAgo(5000),
        updatedAt: minutesAgo(100),
    },
    {
        key: 'design',
        name: '디자인 레퍼런스',
        color: '#b282cc',
        createdAt: minutesAgo(4000),
        updatedAt: minutesAgo(300),
    },
    {
        key: 'news',
        name: '읽을거리',
        color: '#ec5a29',
        createdAt: minutesAgo(3000),
        updatedAt: minutesAgo(2000),
    },
    {
        key: 'empty',
        name: '빈 폴더',
        color: '#50b094',
        createdAt: minutesAgo(1000),
        updatedAt: minutesAgo(50),
    },
]

type LinkSeed = {
    folderKey: string | null
    title: string
    domain: string
    savedAt: Date
    viewedAt: Date | null
    isFavorite: boolean
    deletedAt: Date | null
}

// 링크는 folder별/미분류로 분산하고, savedAt·viewedAt·즐겨찾기·삭제를 다양하게 섞는다.
// 활성 링크가 넉넉히 > limit(기본 9)이라 커서 페이지네이션을 실제로 넘겨볼 수 있다.
function buildLinkSeeds(): LinkSeed[] {
    const seeds: LinkSeed[] = []
    const folderKeys = ['dev', 'design', 'news', null, null] as const

    for (let i = 0; i < 24; i += 1) {
        const folderKey = folderKeys[i % folderKeys.length]
        seeds.push({
            folderKey,
            title: `시드 링크 ${String(i + 1).padStart(2, '0')} — ${folderKey ?? '미분류'}`,
            domain: `${folderKey ?? 'inbox'}.example.com`,
            // savedAt은 i가 커질수록 과거 → 최신순(desc) 정렬 시 i=0이 맨 앞
            savedAt: minutesAgo(i * 60),
            // 3개 중 1개는 미조회(null) → viewedAt 정렬의 null 처리 확인
            viewedAt: i % 3 === 0 ? null : minutesAgo(i * 17 + 5),
            // 4개 중 1개는 즐겨찾기 → favorite 필터·카운트 확인
            isFavorite: i % 4 === 0,
            deletedAt: null,
        })
    }

    // 최근 삭제함(deleted=true)·deletedAt 정렬 확인용 소프트 삭제 링크 몇 개
    for (let i = 0; i < 4; i += 1) {
        seeds.push({
            folderKey: null,
            title: `삭제된 시드 링크 ${i + 1}`,
            domain: 'trash.example.com',
            savedAt: minutesAgo(2000 + i * 30),
            viewedAt: null,
            isFavorite: false,
            deletedAt: minutesAgo(i * 45),
        })
    }

    return seeds
}

async function main() {
    const options = parseArgs(process.argv.slice(2))
    if (options.help) {
        printHelp()
        return
    }

    const config = resolveDatabaseConfig(options.env)
    const client = postgres(config.databaseUrl, { max: 1 })
    const db = drizzle(client, { schema, casing: 'snake_case' })

    try {
        printTitle('링크/폴더 시드')
        printKeyValue('환경', config.appEnv)

        const userId = await ensureSeedUser(db)
        printKeyValue('시드 사용자 id', userId)

        // 재실행 idempotency: 이 사용자의 기존 링크·폴더를 먼저 제거한다.
        // (링크가 folder를 참조하므로 링크 → 폴더 순서로 삭제)
        printStep('기존 시드 데이터 정리')
        await db.delete(links).where(eq(links.userId, userId))
        await db.delete(folders).where(eq(folders.userId, userId))

        printStep('폴더 삽입')
        const folderIdByKey = new Map<string, number>()
        for (const seed of FOLDER_SEEDS) {
            const [row] = await db
                .insert(folders)
                .values({
                    userId,
                    name: seed.name,
                    color: seed.color,
                    createdAt: seed.createdAt,
                    updatedAt: seed.updatedAt,
                })
                .returning({ id: folders.id })
            folderIdByKey.set(seed.key, row.id)
        }
        printKeyValue('폴더 수', FOLDER_SEEDS.length)

        printStep('링크 삽입')
        const linkSeeds = buildLinkSeeds()
        let favoriteCount = 0
        let deletedCount = 0
        for (const [index, seed] of linkSeeds.entries()) {
            const url = `https://${seed.domain}/article/${index + 1}`
            await db.insert(links).values({
                userId,
                folderId:
                    seed.folderKey === null
                        ? null
                        : (folderIdByKey.get(seed.folderKey) ?? null),
                originalUrl: url,
                normalizedUrl: url,
                domain: seed.domain,
                title: seed.title,
                isFavorite: seed.isFavorite,
                viewedAt: seed.viewedAt,
                deletedAt: seed.deletedAt,
                createdAt: seed.savedAt,
                updatedAt: seed.savedAt,
            })
            if (seed.isFavorite) favoriteCount += 1
            if (seed.deletedAt) deletedCount += 1
        }

        const activeCount = linkSeeds.length - deletedCount
        printKeyValue('전체 링크 수', linkSeeds.length)
        printKeyValue('활성 링크 수', activeCount)
        printKeyValue('즐겨찾기 링크 수', favoriteCount)
        printKeyValue('삭제된 링크 수', deletedCount)

        printSuccess('시드 데이터 삽입이 완료되었습니다.')
    } finally {
        await client.end()
    }
}

main().catch((error) => {
    printError(error instanceof Error ? error.message : String(error))
    // drizzle는 원본 DB 오류를 cause에 담으므로 디버깅을 위해 함께 출력한다.
    if (error instanceof Error && error.cause) {
        console.error('  - cause:', error.cause)
    }
    process.exit(1)
})
