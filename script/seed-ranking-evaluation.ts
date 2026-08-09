#!/usr/bin/env bun
import postgres from 'postgres'

import { resolveDatabaseConfig } from './database-env'
import {
    printError,
    printKeyValue,
    printStep,
    printSuccess,
    printTitle,
} from './script-log'

import 'dotenv/config'

type FolderKey = 'mashup' | 'jeju' | 'shopping'

type FolderSeed = {
    key: FolderKey
    name: string
    color: string
}

type LinkSeed = {
    url: string
    folderKey?: FolderKey
    expectedCategory?: string
    fallbackUrls?: readonly string[]
}

const FOLDER_SEEDS: readonly FolderSeed[] = [
    { key: 'mashup', name: '매쉬업 활동', color: '#61a8ef' },
    { key: 'jeju', name: '제주도 여행', color: '#50b094' },
    { key: 'shopping', name: '쇼핑', color: '#ee97a4' },
]

function makeLinkSeeds(
    urls: readonly string[],
    metadata: Omit<LinkSeed, 'url'> = {},
): LinkSeed[] {
    return urls.map((url) => ({ url, ...metadata }))
}

// 실제 사용자가 공유한 URL을 그대로 평가 대상으로 사용한다.
// 작성자 표기와 대화성 코멘트는 저장하지 않고, 메모는 모두 비운다.
// 취소선 URL 2개와 localhost URL 1개는 사용자 확인에 따라 제외했다.
const LINK_SEEDS: readonly LinkSeed[] = [
    // 상단 제목 없는 묶음: 미분류
    ...makeLinkSeeds([
        'https://youtu.be/4P-fUsQ3T-c?si=CZF7LhTyLy_hDiwx',
        'https://www.instagram.com/p/DW0dK9nkkn8/',
        'https://www.instagram.com/reels/C7d0QHpuNnh/',
        'https://www.instagram.com/p/DYw8JXZD5_t/?img_index=3',
        'https://www.instagram.com/reels/DZOSXtIzFoo/',
        'https://www.instagram.com/p/DaesvezCSh2/?igsh=MTZrYnN3ZWNiZW1xdQ==',
        'https://x.com/argent_wave/status/2076955530850091196?s=12&t=tz85btyXo6RglnyBjv7tBg',
        'https://www.instagram.com/p/DZZzFZ7DwOT/',
        'https://www.youtube.com/watch?v=j2CMM1dVKyc',
    ]),

    ...makeLinkSeeds(
        [
            'https://www.instagram.com/p/DVIuqCgEhpB/',
            'https://www.instagram.com/reels/DYRxsE2zHw3/',
            'https://sparkle3.tistory.com/m/25',
            'https://itchipmunk.tistory.com/488',
            'https://mash-up.kr/',
            'https://www.instagram.com/p/C46ixPMy7eQ/',
            'https://x.com/jameslabiq/status/2076724085162426486?s=12&t=tz85btyXo6RglnyBjv7tBg',
        ],
        { folderKey: 'mashup' },
    ),

    ...makeLinkSeeds(
        [
            'https://youtu.be/eM8cQG7_PVI?si=2ilM1dgSsIZjOL6c',
            'https://www.instagram.com/p/C2uKiIERA1c/',
            'https://www.instagram.com/p/Da25ITiiXxD/?img_index=2&igsh=MjJhNHltZmt5dTF0',
            'https://www.instagram.com/reels/DTFQS8pE4kG/',
            'https://www.instagram.com/p/DS9kqCfkToC/',
        ],
        { folderKey: 'jeju' },
    ),

    ...makeLinkSeeds(
        [
            'https://youtu.be/9zcFhEP0cnw?si=_BodFvEHn4Sxyx9_',
            'https://musinsa.onelink.me/PvkC/msdf59b8',
            'https://kko.to/lXYBMqYBcY',
            'https://gift.kakao.com/product/12054525',
            'https://s.zigzag.kr/abr/7mHZNyAw3o',
            'https://youtu.be/Xr4VJdOzFys?si=oA_4-M6YQaNvj3DV',
            'https://youtu.be/mknZol-MuX4?si=IBjXEr9hLkPX-YV7',
        ],
        { folderKey: 'shopping' },
    ),

    ...makeLinkSeeds(
        [
            'https://www.youtube.com/watch?v=71jaji06blg',
            'https://www.youtube.com/shorts/WqBK5W9xHic',
            'https://project-nupchi.vercel.app/',
            'https://youtu.be/OcaOZ6tskhI?si=HwQ47LkKg-uklSv2',
            'https://www.joongang.co.kr/article/25441099',
            'https://store.kyobobook.co.kr/person/detail/1000345816',
        ],
        { expectedCategory: '기타' },
    ),

    ...makeLinkSeeds(
        [
            'https://blog.naver.com/foreverdmswn/224067296967',
            'https://www.instagram.com/p/DaCjlLwEzWf/?img_index=4&igsh=NDNibmh3ZHM5dWxj',
            'https://www.instagram.com/reel/DaF4SZiN1ry/?igsh=eWNsc3VvZDJtNnVm',
            'https://naver.me/GAr4Fdw2',
            'https://www.instagram.com/reel/DWWQQ92BS8B/?utm_source=ig_web_copy_link&igsh=NTc4MTIwNjQ2YQ==',
        ],
        { expectedCategory: '여행' },
    ),

    ...makeLinkSeeds(
        [
            'http://m.pet-friends.co.kr/main/tab/2?authRoute=true&fromReact=true',
            'https://www.10000recipe.com/recipe/6872350',
            'https://dailif.tistory.com/entry/%EB%A0%88%EC%8B%9C%ED%94%BC%EB%AA%A8%EC%9D%8C-%EB%82%B4%EA%B0%80-%EB%B3%B4%EB%A0%A4%EA%B3%A0-%EC%A0%95%EB%A6%AC%ED%95%98%EB%8A%94-%EC%9C%A0%ED%8A%9C%EB%B8%8C-%EB%A0%88%EC%8B%9C%ED%94%BC-%EB%AA%A8%EC%9D%8C-%EC%B5%9C%EA%B0%95%EB%A1%9DUDT-%EC%9C%A0%ED%8A%9C%EB%B8%8C-%EB%A0%88%EC%8B%9C%ED%94%BC-%EB%AA%A8%EC%9D%8C-1%ED%83%84',
            'https://www.youtube.com/shorts/fBEX5T5GTG0',
            'https://www.youtube.com/shorts/jvEKIA8GjQk',
            'https://www.10000recipe.com/recipe/6854423?srsltid=AfmBOor5aWECC9qODDbTmuQHRLDT_1IvJ81yqKk7O-zQ5Yxl8yQZbk5e',
            'https://www.instagram.com/reel/Dao8IMFJV3G/?igsh=MWxnbTJ6b3pmeW8xbQ==',
            'https://x.com/felicejeong/status/2028114240113168562?s=12&t=tz85btyXo6RglnyBjv7tBg',
        ],
        { expectedCategory: '요리' },
    ),

    ...makeLinkSeeds(
        [
            'https://product.kyobobook.co.kr/detail/S000220662769',
            'http://product.kyobobook.co.kr/detail/S000219931400',
            'https://product.kyobobook.co.kr/detail/S000220036708',
        ],
        { expectedCategory: '도서' },
    ),

    ...makeLinkSeeds(
        [
            'https://hermes-ai.net/ko/',
            'https://threejs-journey.com/#testimonies',
            'https://api.link-ding-dong.com/api-docs#/',
            'https://deepwelloper.tistory.com/entry/React-Native-%EB%B0%B0%ED%8F%AC%EC%9D%98-%EA%B5%AC%EC%84%B8%EC%A3%BC-Expo-EAS-%EC%99%84%EB%B2%BD-%EA%B0%80%EC%9D%B4%EB%93%9C-%EB%A7%A5%EB%B6%81-%EC%97%86%EC%9D%B4%EB%8F%84-%EC%95%84%EC%9D%B4%ED%8F%B0-%EC%95%B1%EC%9D%84-%EB%A7%8C%EB%93%A0%EB%8B%A4%EA%B3%A0',
            'https://es-toolkit.dev/ko/intro.html',
            'https://velog.io/@teo/%EC%99%9C-Svelte%EC%8A%A4%EB%B2%A8%ED%8A%B8%EB%A5%BC-%EC%A2%8B%EC%95%84%ED%95%98%EB%82%98%EC%9A%94',
            'https://anthropic-partners.skilljar.com/page/partner-certifications',
        ],
        { expectedCategory: '개발' },
    ),

    ...makeLinkSeeds(
        [
            'https://astryx.atmeta.com/',
            'https://www.figma.com/design/N1Be7W5xCHcpdgjcjyoZs3/shadcn-studio-figma-uikit-pro-nova-preview?t=o0ZjN0zUqnloc9cB-0',
            'https://www.nngroup.com/articles/design-systems-101/',
            'https://x.com/figma/status/2069827742800253230?s=12&t=tz85btyXo6RglnyBjv7tBg',
            'https://www.figma.com/blog/design-systems-101-what-is-a-design-system/',
            'https://www.krds.go.kr/html/site/utility/utility_03.html',
            'https://toss.im/career/article/44905',
            'https://www.bucketplace.com/post/2025-11-06-%EC%98%A4%EB%8A%98%EC%9D%98%EC%A7%91%EC%9D%80-%EC%96%B4%EB%96%BB%EA%B2%8C-200%EB%AA%85%EC%9D%98-%EB%A6%AC%EC%84%9C%EC%B2%98%EB%A5%BC-%EB%A7%8C%EB%93%A4%EC%97%88%EC%9D%84%EA%B9%8C/?ref=surfit.io',
            'https://www.instagram.com/reels/DUNaG4RCaOA/',
            'https://www.instagram.com/p/DaC2me-gQBp/',
            'https://www.instagram.com/p/C67wDCSLQCL/',
        ],
        { expectedCategory: '디자인' },
    ),

    ...makeLinkSeeds(
        [
            'https://www.i-sh.co.kr/app/index.do#none',
            'https://hogangnono.com/',
            'https://www.instagram.com/p/DabwCPqijbj/?img_index=2',
        ],
        { expectedCategory: '부동산' },
    ),

    ...makeLinkSeeds(
        [
            'https://medium.com/daangn/%EB%94%94%EC%9E%90%EC%9D%B8%EC%8B%9C%EC%8A%A4%ED%85%9C-%ED%8C%80%EC%9D%80-%EB%94%94%EC%9E%90%EC%9D%B8%EC%8B%9C%EC%8A%A4%ED%85%9C%EB%A7%8C-%EC%9E%98-%EB%A7%8C%EB%93%A4%EB%A9%B4-%EB%90%A0%EA%B9%8C-4f6f2478a8db',
            'https://www.bucketplace.com/post/2026-01-14-%EC%98%A4%EB%8A%98%EC%9D%98%EC%A7%91-%EA%B2%80%EC%83%89-%EB%AA%A8%EB%93%A0-%EC%96%B8%EC%96%B4%EC%99%80-%EB%8F%84%EB%A9%94%EC%9D%B8%EC%9D%84-%EC%95%84%EC%9A%B0%EB%A5%B4%EB%8A%94-%EC%9D%BC%EB%B0%98%ED%99%94%EB%90%9C-retrieval-%EC%8B%9C%EC%8A%A4%ED%85%9C-%EB%A7%8C%EB%93%A4%EA%B8%B0/',
        ],
        { expectedCategory: '아티클' },
    ),

    ...makeLinkSeeds(
        [
            'http://wntd.co/626df39c',
            'https://toss.im/career/jobs',
            'https://careers.daangn.com/jobs/role/7791182003/',
            'https://www.rallit.com/positions/4125/%ED%94%84%EB%A1%A0%ED%8A%B8%EC%97%94%EB%93%9C-%EA%B0%9C%EB%B0%9C%EC%9E%90',
        ],
        { expectedCategory: '채용 공고' },
    ),

    ...makeLinkSeeds(
        [
            'https://www.kakaobank.com/',
            'https://n.news.naver.com/mnews/article/003/0014045951?sid=101',
        ],
        { expectedCategory: '은행/증권' },
    ),

    ...makeLinkSeeds(
        [
            'https://www.threads.com/@nono_ai_archive/post/DZuLBKpk-km?xmt=AQG07kvird8sdZFNB5oMb75mPG7TnsNQ7QH9uZrZdjIdQw',
            'https://openai.com/index/introducing-gpt-5/',
            'https://www.anthropic.com/news/redeploying-fable-5',
            'https://www.threads.com/@choi.openai/post/DY8cUNjDLtG/video-codex-%ED%99%9C%EC%9A%A9%ED%8C%81%EC%98%A4%EB%8A%98-codex%EC%97%90-%EC%8A%A4%EB%A0%88%EB%93%9C%EB%A5%BC-%EC%A7%81%EC%A0%91-%EC%83%9D%EC%84%B1%ED%95%98%EA%B3%A0-%EA%B4%80%EB%A6%AC%ED%95%98%EB%8A%94-%EA%B8%B0%EB%8A%A5%EC%9D%B4-%EC%B6%94%EA%B0%80%EB%90%98%EC%97%88%EB%8A%94%EB%8D%B0%EC%9A%94%ED%95%98%EB%82%98%EC%9D%98-%EB%A9%94%EC%9D%B8-%EC%8A%A4%EB%A0%88%EB%93%9C%EB%A5%BC-%EB%91%90%EA%B3%A0-%ED%94%84%EB%A1%9C%EC%A0%9D%ED%8A%B8%EB%B3%84-%EC%8A%A4%EB%A0%88%EB%93%9C%EB%A5%BC-%EC%9E%90%EB%8F%99%EC%9C%BC%EB%A1%9C-%EB%A7%8C/?hl=ko',
            'https://www.instagram.com/p/DajXgOPgeAS/',
        ],
        { expectedCategory: 'AI' },
    ),

    ...makeLinkSeeds(
        [
            'https://maplestory.nexon.com/promotion/event/2026/20260618/intro',
            'https://www.metatft.com/comps',
            'https://fco.vod.nexoncdn.co.kr/list/2026/6/info_FCO_260625_dvlI3wQ8bqA.html',
            'https://blog.naver.com/jun84210/223249693039',
        ],
        { expectedCategory: '게임' },
    ),

    ...makeLinkSeeds(['https://music.bugs.co.kr/track/33770878'], {
        expectedCategory: '노래',
    }),

    ...makeLinkSeeds(
        [
            'https://www.instagram.com/reel/DZ92KmeSwwP/?igsh=dnNza2Njc2dvZnpo',
            'https://www.instagram.com/reel/DZCnL92yNIm/?igsh=Ymlhcmt2dGZlcHls',
            'https://x.com/rlheiv0ls_iylqz/status/2075944590767755647?s=12&t=tz85btyXo6RglnyBjv7tBg',
        ],
        { expectedCategory: '운동' },
    ),

    ...makeLinkSeeds(
        [
            'https://naver.me/Gbyv9gC6',
            'https://naver.me/GZZuHlRt',
            'https://naver.me/5fIpv2b3',
            'https://www.instagram.com/p/DZWyCY6icNL/?img_index=2',
            'https://www.instagram.com/p/DZpRS34k2ph/',
            'https://x.com/no_extra_time/status/2066512033453883420?s=12&t=tz85btyXo6RglnyBjv7tBg',
            'https://www.instagram.com/p/DZe4pRACU9e/',
            'https://www.instagram.com/reels/DYCWgGBRpvA/',
            'https://www.instagram.com/p/DY0qZgKkxJv/',
        ],
        { expectedCategory: '장소' },
    ),
]

const EXPECTED_LINK_COUNT = 101
const EXPECTED_UNASSIGNED_COUNT = 82
const EXPECTED_CATEGORY_LABEL_COUNT = 73
const DEFAULT_PREFLIGHT_CONCURRENCY = 4
const DEFAULT_SEED_CONCURRENCY = 2
const DEFAULT_REQUEST_TIMEOUT_MS = 15_000
const DEFAULT_ANALYSIS_TIMEOUT_MS = 180_000
const ANALYSIS_POLL_INTERVAL_MS = 2_000

type CliOptions = {
    apply: boolean
    resetMasterData: boolean
    help: boolean
    apiBaseUrl: string
    preflightConcurrency: number
    seedConcurrency: number
    requestTimeoutMs: number
    analysisTimeoutMs: number
}

type ApiClient = {
    baseUrl: string
    accessToken: string
    timeoutMs: number
}

type FolderSnapshot = {
    systemFolders: {
        all: { linkCount: number }
        uncategorized: { linkCount: number }
        favorite: { linkCount: number }
        recentlyDeleted: { linkCount: number }
    }
    folders: Array<{
        folderId: number
        folderName: string
        color: string
        linkCount: number
        lastSavedAt: string | null
    }>
}

type CreatedFolder = {
    folderId: number
    folderName: string
    color: string
    createdAt: string
}

type CreatedLink = {
    linkId: number
    url: string
    savedAt: string
}

type CurrentUser = {
    userId: number
}

type LinkTag = {
    tagId: number
    name: string
    sourceType: string
    sortOrder: number | null
}

type LinkDetail = {
    linkId: number
    url: string
    title: string | null
    processingStatus: 'PENDING' | 'SUCCESS' | 'NEEDS_REVIEW' | 'FAILED'
    aiSummary: string | null
    tags: LinkTag[]
    memo: string | null
}

type ResolvedLinkSeed = LinkSeed & {
    url: string
    originalUrl: string
    usedFallback: boolean
}

type PreflightSuccess = {
    resolved: ResolvedLinkSeed
}

type PreflightFailure = {
    seed: LinkSeed
    attempts: string[]
}

type PreflightResult = PreflightSuccess | PreflightFailure

type SeededLink = {
    seed: ResolvedLinkSeed
    linkId: number
}

type AnalysisResult = {
    seededLink: SeededLink
    detail?: LinkDetail
    error?: string
}

type DatabaseStats = {
    activeLinks: number
    deletedLinks: number
    folders: number
    successfulSummaries: number
    aiTaggedLinks: number
    embeddedLinks: number
}

class ApiRequestError extends Error {
    constructor(
        message: string,
        readonly status?: number,
    ) {
        super(message)
        this.name = 'ApiRequestError'
    }
}

async function main() {
    const options = parseCliOptions(process.argv.slice(2))

    if (options.help) {
        printHelp()
        return
    }

    validateCliOptions(options)
    validateDataset()

    const masterUserId = parsePositiveIntegerEnvironment(
        'MASTER_USER_ID',
        process.env.MASTER_USER_ID,
    )
    const masterAccessToken = requireEnvironment(
        'MASTER_ACCESS_TOKEN',
        process.env.MASTER_ACCESS_TOKEN,
    )
    const apiClient: ApiClient = {
        baseUrl: normalizeAndValidateApiBaseUrl(options.apiBaseUrl),
        accessToken: masterAccessToken,
        timeoutMs: options.requestTimeoutMs,
    }
    const databaseConfig = resolveDatabaseConfig('development')
    const sql = postgres(databaseConfig.databaseUrl, { max: 1 })

    try {
        printTitle('랭킹 평가용 실제 링크 데이터셋')
        printKeyValue('대상 환경', 'development')
        printKeyValue('MASTER_USER_ID', masterUserId)
        printKeyValue('API', apiClient.baseUrl)
        printKeyValue('링크 수', LINK_SEEDS.length)
        printKeyValue('미분류 링크 수', EXPECTED_UNASSIGNED_COUNT)
        printKeyValue('평가 카테고리 라벨 수', EXPECTED_CATEGORY_LABEL_COUNT)
        printKeyValue(
            '실행 모드',
            options.apply ? '초기화 후 실제 생성' : '사전검사 전용',
        )

        await assertMasterUserExists(sql, masterUserId)
        const currentUser = await apiGet<CurrentUser>(apiClient, '/users/me')
        if (currentUser.userId !== masterUserId) {
            throw new Error(
                `MASTER_ACCESS_TOKEN의 userId=${currentUser.userId}가 MASTER_USER_ID=${masterUserId}와 일치하지 않습니다.`,
            )
        }
        const beforeStats = await readDatabaseStats(sql, masterUserId)
        const beforeSnapshot = await apiGet<FolderSnapshot>(
            apiClient,
            '/folders',
        )
        assertApiTargetsDatabase(beforeStats, beforeSnapshot)

        printStep('실제 API 크롤링 경로로 URL 사전검사')
        const preflight = await preflightLinks(
            apiClient,
            LINK_SEEDS,
            options.preflightConcurrency,
        )

        if (preflight.failures.length > 0) {
            printPreflightFailures(preflight.failures)
            throw new Error(
                `${preflight.failures.length}개 URL의 사전검사에 실패했습니다. 대체 URL을 확정하기 전에는 DB를 초기화하지 않습니다.`,
            )
        }

        printSuccess(`URL ${preflight.resolvedSeeds.length}개 사전검사 완료`)

        if (!options.apply) {
            printSuccess(
                '사전검사만 완료했습니다. DB 데이터는 변경하지 않았습니다.',
            )
            printStep(
                '실제 적용: bun run db:seed:ranking -- --apply --reset-master-data',
            )
            return
        }

        printStep('MASTER_USER_ID 범위의 기존 랭킹 데이터 초기화')
        printDatabaseStats('초기화 전', beforeStats)
        await resetMasterData(sql, masterUserId)

        const emptyStats = await readDatabaseStats(sql, masterUserId)
        const emptySnapshot = await apiGet<FolderSnapshot>(
            apiClient,
            '/folders',
        )
        assertResetCompleted(emptyStats, emptySnapshot)
        printSuccess('대상 사용자의 링크·태그·AI 메트릭·폴더를 초기화했습니다.')

        printStep('HTTP API로 폴더 생성')
        const folderIdByKey = await createFolders(apiClient)

        printStep('HTTP API로 링크 생성 후 비동기 분석 완료 검증')
        const seedResult = await seedLinks(
            apiClient,
            preflight.resolvedSeeds,
            folderIdByKey,
            options,
        )

        printStep('비동기 임베딩 저장 완료 검증')
        await waitForEmbeddings(
            sql,
            masterUserId,
            seedResult.createdLinks,
            options.analysisTimeoutMs,
        )

        const afterStats = await readDatabaseStats(sql, masterUserId)
        const afterSnapshot = await apiGet<FolderSnapshot>(
            apiClient,
            '/folders',
        )
        printDatabaseStats('생성 후', afterStats)
        verifyFinalState(afterStats, afterSnapshot, seedResult)
        printCategoryEvaluation(seedResult.analysisResults)

        printSuccess('랭킹 평가용 실제 링크 데이터셋 생성이 완료되었습니다.')
    } finally {
        await sql.end()
    }
}

function parseCliOptions(args: string[]): CliOptions {
    const options: CliOptions = {
        apply: false,
        resetMasterData: false,
        help: false,
        apiBaseUrl:
            process.env.RANKING_SEED_API_BASE_URL ??
            `http://127.0.0.1:${process.env.PORT ?? '3000'}/api/v1`,
        preflightConcurrency: DEFAULT_PREFLIGHT_CONCURRENCY,
        seedConcurrency: DEFAULT_SEED_CONCURRENCY,
        requestTimeoutMs: DEFAULT_REQUEST_TIMEOUT_MS,
        analysisTimeoutMs: DEFAULT_ANALYSIS_TIMEOUT_MS,
    }

    for (let index = 0; index < args.length; index += 1) {
        const arg = args[index]

        if (arg === '--help' || arg === '-h') {
            options.help = true
            continue
        }
        if (arg === '--apply') {
            options.apply = true
            continue
        }
        if (arg === '--reset-master-data') {
            options.resetMasterData = true
            continue
        }

        const parsed = readCliOption(args, index, arg)
        if (!parsed) {
            throw new Error(`알 수 없는 옵션입니다: ${arg}`)
        }

        index = parsed.nextIndex
        if (parsed.name === '--api-base-url') {
            options.apiBaseUrl = parsed.value
        } else if (parsed.name === '--preflight-concurrency') {
            options.preflightConcurrency = parsePositiveInteger(
                parsed.name,
                parsed.value,
            )
        } else if (parsed.name === '--seed-concurrency') {
            options.seedConcurrency = parsePositiveInteger(
                parsed.name,
                parsed.value,
            )
        } else if (parsed.name === '--request-timeout-ms') {
            options.requestTimeoutMs = parsePositiveInteger(
                parsed.name,
                parsed.value,
            )
        } else if (parsed.name === '--analysis-timeout-ms') {
            options.analysisTimeoutMs = parsePositiveInteger(
                parsed.name,
                parsed.value,
            )
        }
    }

    return options
}

function readCliOption(
    args: string[],
    index: number,
    arg: string,
): { name: string; value: string; nextIndex: number } | undefined {
    const names = [
        '--api-base-url',
        '--preflight-concurrency',
        '--seed-concurrency',
        '--request-timeout-ms',
        '--analysis-timeout-ms',
    ]

    for (const name of names) {
        if (arg === name) {
            const value = args[index + 1]
            if (!value || value.startsWith('-')) {
                throw new Error(`${name} 옵션의 값이 필요합니다.`)
            }
            return { name, value, nextIndex: index + 1 }
        }
        if (arg.startsWith(`${name}=`)) {
            return {
                name,
                value: arg.slice(name.length + 1),
                nextIndex: index,
            }
        }
    }

    return undefined
}

function validateCliOptions(options: CliOptions) {
    if (options.apply !== options.resetMasterData) {
        throw new Error(
            '실제 초기화·생성에는 --apply와 --reset-master-data를 함께 지정해야 합니다.',
        )
    }
}

function validateDataset() {
    if (LINK_SEEDS.length !== EXPECTED_LINK_COUNT) {
        throw new Error(
            `데이터셋 링크 수가 예상과 다릅니다: ${LINK_SEEDS.length}/${EXPECTED_LINK_COUNT}`,
        )
    }

    const folderKeys = new Set(FOLDER_SEEDS.map((folder) => folder.key))
    const normalizedUrls = new Map<string, string>()
    let unassignedCount = 0
    let categoryLabelCount = 0

    for (const seed of LINK_SEEDS) {
        if (seed.folderKey && !folderKeys.has(seed.folderKey)) {
            throw new Error(`정의되지 않은 folderKey입니다: ${seed.folderKey}`)
        }
        if (!seed.folderKey) unassignedCount += 1
        if (seed.expectedCategory) categoryLabelCount += 1

        for (const url of [seed.url, ...(seed.fallbackUrls ?? [])]) {
            const parsed = new URL(url)
            if (!['http:', 'https:'].includes(parsed.protocol)) {
                throw new Error(`HTTP(S)가 아닌 URL입니다: ${url}`)
            }
            if (isLocalHostname(parsed.hostname)) {
                throw new Error(
                    `로컬·사설 호스트 URL은 사용할 수 없습니다: ${url}`,
                )
            }
        }

        const normalized = normalizeUrl(seed.url)
        const duplicated = normalizedUrls.get(normalized)
        if (duplicated) {
            throw new Error(
                `정규화 기준 중복 URL입니다: ${duplicated} / ${seed.url}`,
            )
        }
        normalizedUrls.set(normalized, seed.url)
    }

    if (unassignedCount !== EXPECTED_UNASSIGNED_COUNT) {
        throw new Error(
            `미분류 링크 수가 예상과 다릅니다: ${unassignedCount}/${EXPECTED_UNASSIGNED_COUNT}`,
        )
    }
    if (categoryLabelCount !== EXPECTED_CATEGORY_LABEL_COUNT) {
        throw new Error(
            `카테고리 라벨 수가 예상과 다릅니다: ${categoryLabelCount}/${EXPECTED_CATEGORY_LABEL_COUNT}`,
        )
    }
}

function normalizeUrl(raw: string): string {
    const url = new URL(raw)
    url.hash = ''
    url.protocol = url.protocol.toLowerCase()
    url.hostname = url.hostname.toLowerCase()

    let normalized = url.toString()
    if (url.pathname !== '/' && normalized.endsWith('/')) {
        normalized = normalized.slice(0, -1)
    }

    return normalized
}

function isLocalHostname(hostname: string) {
    const normalized = hostname.toLowerCase()
    return (
        normalized === 'localhost' ||
        normalized === '::1' ||
        normalized.endsWith('.localhost') ||
        normalized.startsWith('127.') ||
        normalized.startsWith('10.') ||
        normalized.startsWith('192.168.') ||
        /^172\.(1[6-9]|2\d|3[01])\./.test(normalized)
    )
}

function normalizeAndValidateApiBaseUrl(raw: string): string {
    const url = new URL(raw)
    if (url.protocol !== 'http:') {
        throw new Error('시드 API는 로컬 development HTTP 주소만 허용합니다.')
    }
    if (!['localhost', '127.0.0.1'].includes(url.hostname)) {
        throw new Error(
            'production 오접속 방지를 위해 --api-base-url은 localhost 또는 127.0.0.1만 허용합니다.',
        )
    }

    return url.toString().replace(/\/$/, '')
}

async function assertMasterUserExists(sql: postgres.Sql, userId: number) {
    const [row] = await sql<Array<{ id: number; deleted_at: Date | null }>>`
        select id, deleted_at
        from users
        where id = ${userId}
        limit 1
    `

    if (!row) {
        throw new Error(
            `MASTER_USER_ID=${userId} 사용자가 development DB에 없습니다. db:seed:master를 먼저 실행해주세요.`,
        )
    }
    if (row.deleted_at) {
        throw new Error(`MASTER_USER_ID=${userId} 사용자가 삭제 상태입니다.`)
    }
}

async function readDatabaseStats(
    sql: postgres.Sql,
    userId: number,
): Promise<DatabaseStats> {
    const [row] = await sql<
        Array<{
            active_links: string
            deleted_links: string
            folders: string
            successful_summaries: string
            ai_tagged_links: string
            embedded_links: string
        }>
    >`
        select
            count(*) filter (where l.deleted_at is null)::text as active_links,
            count(*) filter (where l.deleted_at is not null)::text as deleted_links,
            (select count(*)::text from folders f where f.user_id = ${userId}) as folders,
            count(*) filter (
                where l.deleted_at is null
                  and l.ai_summary_status = 'SUCCESS'
                  and l.ai_summary is not null
            )::text as successful_summaries,
            count(*) filter (
                where l.deleted_at is null
                  and exists (
                      select 1 from tags t
                      where t.link_id = l.id
                        and t.user_id = l.user_id
                        and t.source_type = 'ai'
                  )
            )::text as ai_tagged_links,
            count(*) filter (
                where l.deleted_at is null and l.embedding is not null
            )::text as embedded_links
        from links l
        where l.user_id = ${userId}
    `

    return {
        activeLinks: Number(row.active_links),
        deletedLinks: Number(row.deleted_links),
        folders: Number(row.folders),
        successfulSummaries: Number(row.successful_summaries),
        aiTaggedLinks: Number(row.ai_tagged_links),
        embeddedLinks: Number(row.embedded_links),
    }
}

function assertApiTargetsDatabase(
    database: DatabaseStats,
    api: FolderSnapshot,
) {
    const errors: string[] = []
    if (database.activeLinks !== api.systemFolders.all.linkCount) {
        errors.push(
            `활성 링크 DB=${database.activeLinks}, API=${api.systemFolders.all.linkCount}`,
        )
    }
    if (database.deletedLinks !== api.systemFolders.recentlyDeleted.linkCount) {
        errors.push(
            `삭제 링크 DB=${database.deletedLinks}, API=${api.systemFolders.recentlyDeleted.linkCount}`,
        )
    }
    if (database.folders !== api.folders.length) {
        errors.push(`폴더 DB=${database.folders}, API=${api.folders.length}`)
    }

    if (errors.length > 0) {
        throw new Error(
            `로컬 API가 MASTER_USER_ID의 development DB와 일치하지 않습니다: ${errors.join(', ')}`,
        )
    }
}

async function resetMasterData(sql: postgres.Sql, userId: number) {
    await sql.begin(async (tx) => {
        await tx`
            delete from ai_metrics
            where user_link_id in (
                select id from links where user_id = ${userId}
            )
        `
        await tx`
            delete from ai_summary_metrics
            where link_id in (
                select id from links where user_id = ${userId}
            )
        `
        await tx`delete from tags where user_id = ${userId}`
        await tx`delete from links where user_id = ${userId}`
        await tx`delete from folders where user_id = ${userId}`
    })
}

function assertResetCompleted(database: DatabaseStats, api: FolderSnapshot) {
    const total = Object.values(database).reduce((sum, value) => sum + value, 0)
    if (total !== 0) {
        throw new Error('DB 초기화 후 대상 데이터가 남아 있습니다.')
    }
    if (
        api.systemFolders.all.linkCount !== 0 ||
        api.systemFolders.recentlyDeleted.linkCount !== 0 ||
        api.folders.length !== 0
    ) {
        throw new Error('DB 초기화 결과가 API 조회에 반영되지 않았습니다.')
    }
}

async function preflightLinks(
    client: ApiClient,
    seeds: readonly LinkSeed[],
    concurrency: number,
) {
    let completed = 0
    const results = await mapWithConcurrency<LinkSeed, PreflightResult>(
        seeds,
        concurrency,
        async (seed) => {
            const attempts: string[] = []
            const candidates = [seed.url, ...(seed.fallbackUrls ?? [])]

            for (const candidate of candidates) {
                try {
                    await apiGetWithRetry(
                        client,
                        `/links/preview?url=${encodeURIComponent(candidate)}`,
                        2,
                    )
                    completed += 1
                    if (completed % 10 === 0 || completed === seeds.length) {
                        printKeyValue(
                            '사전검사 진행',
                            `${completed}/${seeds.length}`,
                        )
                    }
                    return {
                        resolved: {
                            ...seed,
                            url: candidate,
                            originalUrl: seed.url,
                            usedFallback: candidate !== seed.url,
                        },
                    }
                } catch (error) {
                    attempts.push(
                        `${candidate} → ${error instanceof Error ? error.message : String(error)}`,
                    )
                }
            }

            completed += 1
            if (completed % 10 === 0 || completed === seeds.length) {
                printKeyValue('사전검사 진행', `${completed}/${seeds.length}`)
            }
            return { seed, attempts }
        },
    )

    const successes = results.filter(isPreflightSuccess)
    const failures = results.filter(isPreflightFailure)

    return {
        resolvedSeeds: successes.map((result) => result.resolved),
        failures,
    }
}

function isPreflightSuccess(
    result: PreflightResult,
): result is PreflightSuccess {
    return 'resolved' in result
}

function isPreflightFailure(
    result: PreflightResult,
): result is PreflightFailure {
    return 'seed' in result
}

function printPreflightFailures(
    failures: Array<{ seed: LinkSeed; attempts: string[] }>,
) {
    console.error('\n사전검사 실패 URL (대체 URL 필요)')
    for (const [index, failure] of failures.entries()) {
        console.error(`  ${index + 1}. ${failure.seed.url}`)
        for (const attempt of failure.attempts) {
            console.error(`     - ${attempt}`)
        }
    }
}

async function createFolders(client: ApiClient) {
    const folderIdByKey = new Map<FolderKey, number>()

    for (const folder of FOLDER_SEEDS) {
        const created = await apiPost<CreatedFolder>(client, '/folders', {
            folderName: folder.name,
            color: folder.color,
        })
        folderIdByKey.set(folder.key, created.folderId)
        printKeyValue(folder.name, `folderId=${created.folderId}`)
    }

    return folderIdByKey
}

async function seedLinks(
    client: ApiClient,
    seeds: readonly ResolvedLinkSeed[],
    folderIdByKey: Map<FolderKey, number>,
    options: CliOptions,
) {
    const createdLinks: SeededLink[] = []
    const creationFailures: Array<{ seed: ResolvedLinkSeed; error: string }> =
        []
    const analysisResults: AnalysisResult[] = []

    for (
        let offset = 0;
        offset < seeds.length;
        offset += options.seedConcurrency
    ) {
        const batch = seeds.slice(offset, offset + options.seedConcurrency)
        const createdBatch = await Promise.all(
            batch.map(async (seed) => {
                try {
                    const body: { url: string; folderId?: number } = {
                        url: seed.url,
                    }
                    if (seed.folderKey) {
                        const folderId = folderIdByKey.get(seed.folderKey)
                        if (!folderId) {
                            throw new Error(
                                `folderKey=${seed.folderKey}의 folderId가 없습니다.`,
                            )
                        }
                        body.folderId = folderId
                    }

                    const created = await apiPost<CreatedLink>(
                        client,
                        '/links',
                        body,
                    )
                    return { seed, linkId: created.linkId } satisfies SeededLink
                } catch (error) {
                    creationFailures.push({
                        seed,
                        error:
                            error instanceof Error
                                ? error.message
                                : String(error),
                    })
                    return undefined
                }
            }),
        )

        const successfulBatch = createdBatch.filter(
            (value): value is SeededLink => value !== undefined,
        )
        createdLinks.push(...successfulBatch)
        analysisResults.push(
            ...(await waitForAnalysisBatch(
                client,
                successfulBatch,
                options.analysisTimeoutMs,
            )),
        )

        printKeyValue(
            '시드 진행',
            `${Math.min(offset + batch.length, seeds.length)}/${seeds.length}`,
        )
    }

    return { createdLinks, creationFailures, analysisResults }
}

async function waitForAnalysisBatch(
    client: ApiClient,
    links: SeededLink[],
    timeoutMs: number,
): Promise<AnalysisResult[]> {
    const startedAt = Date.now()
    const pending = new Map(links.map((link) => [link.linkId, link]))
    const completed: AnalysisResult[] = []
    const lastErrors = new Map<number, string>()

    while (pending.size > 0 && Date.now() - startedAt < timeoutMs) {
        await Promise.all(
            [...pending.values()].map(async (seededLink) => {
                try {
                    const detail = await apiGet<LinkDetail>(
                        client,
                        `/links/${seededLink.linkId}`,
                    )
                    const aiTags = detail.tags.filter(
                        (tag) => tag.sourceType === 'ai',
                    )

                    if (
                        detail.processingStatus === 'FAILED' ||
                        detail.processingStatus === 'NEEDS_REVIEW'
                    ) {
                        completed.push({
                            seededLink,
                            detail,
                            error: `AI 요약 상태=${detail.processingStatus}`,
                        })
                        pending.delete(seededLink.linkId)
                        return
                    }

                    if (
                        detail.processingStatus === 'SUCCESS' &&
                        Boolean(detail.aiSummary?.trim()) &&
                        aiTags.length > 0
                    ) {
                        completed.push({ seededLink, detail })
                        pending.delete(seededLink.linkId)
                    }
                } catch (error) {
                    lastErrors.set(
                        seededLink.linkId,
                        error instanceof Error ? error.message : String(error),
                    )
                }
            }),
        )

        if (pending.size > 0) {
            await sleep(ANALYSIS_POLL_INTERVAL_MS)
        }
    }

    for (const seededLink of pending.values()) {
        completed.push({
            seededLink,
            error: `분석 제한 시간 ${timeoutMs}ms 초과${lastErrors.has(seededLink.linkId) ? `: ${lastErrors.get(seededLink.linkId)}` : ''}`,
        })
    }

    return completed
}

async function waitForEmbeddings(
    sql: postgres.Sql,
    userId: number,
    createdLinks: readonly SeededLink[],
    timeoutMs: number,
): Promise<void> {
    if (createdLinks.length === 0) return

    const deadline = Date.now() + timeoutMs
    let pending = await findPendingEmbeddings(sql, userId, createdLinks)
    let previousPendingCount: number | undefined

    while (pending.length > 0 && Date.now() < deadline) {
        if (pending.length !== previousPendingCount) {
            printKeyValue(
                '임베딩 진행',
                `${createdLinks.length - pending.length}/${createdLinks.length}`,
            )
            previousPendingCount = pending.length
        }

        await sleep(
            Math.min(
                ANALYSIS_POLL_INTERVAL_MS,
                Math.max(deadline - Date.now(), 1),
            ),
        )
        pending = await findPendingEmbeddings(sql, userId, createdLinks)
    }

    if (pending.length === 0) {
        printKeyValue(
            '임베딩 진행',
            `${createdLinks.length}/${createdLinks.length}`,
        )
        return
    }

    console.error('\n임베딩 생성 실패 URL')
    for (const [index, link] of pending.entries()) {
        console.error(
            `  ${index + 1}. linkId=${link.linkId} ${link.url} (${link.reason})`,
        )
    }

    throw new Error(
        `제한 시간 ${timeoutMs}ms 안에 ${pending.length}/${createdLinks.length}개 링크의 임베딩이 저장되지 않았습니다.`,
    )
}

async function findPendingEmbeddings(
    sql: postgres.Sql,
    userId: number,
    createdLinks: readonly SeededLink[],
) {
    const rows = await sql<
        Array<{
            id: number
            original_url: string
            has_embedding: boolean
        }>
    >`
        select id, original_url, embedding is not null as has_embedding
        from links
        where user_id = ${userId}
          and deleted_at is null
    `
    const rowById = new Map(rows.map((row) => [row.id, row]))

    return createdLinks.flatMap((createdLink) => {
        const row = rowById.get(createdLink.linkId)
        if (!row) {
            return [
                {
                    linkId: createdLink.linkId,
                    url: createdLink.seed.url,
                    reason: 'DB 행 없음',
                },
            ]
        }
        if (!row.has_embedding) {
            return [
                {
                    linkId: row.id,
                    url: row.original_url,
                    reason: 'embedding is null',
                },
            ]
        }
        return []
    })
}

function verifyFinalState(
    database: DatabaseStats,
    api: FolderSnapshot,
    result: Awaited<ReturnType<typeof seedLinks>>,
) {
    const errors: string[] = []
    const analysisFailures = result.analysisResults.filter(
        (analysis) => analysis.error,
    )

    if (result.creationFailures.length > 0) {
        errors.push(`링크 생성 실패 ${result.creationFailures.length}건`)
        for (const failure of result.creationFailures) {
            console.error(`  - ${failure.seed.url}: ${failure.error}`)
        }
    }
    if (analysisFailures.length > 0) {
        errors.push(`비동기 분석 실패 ${analysisFailures.length}건`)
        for (const failure of analysisFailures) {
            console.error(
                `  - ${failure.seededLink.seed.url}: ${failure.error ?? '확인 안 됨'}`,
            )
        }
    }
    if (database.activeLinks !== EXPECTED_LINK_COUNT) {
        errors.push(`활성 링크 ${database.activeLinks}/${EXPECTED_LINK_COUNT}`)
    }
    if (database.deletedLinks !== 0) {
        errors.push(`삭제 링크 ${database.deletedLinks}/0`)
    }
    if (database.folders !== FOLDER_SEEDS.length) {
        errors.push(`폴더 ${database.folders}/${FOLDER_SEEDS.length}`)
    }
    if (database.successfulSummaries !== EXPECTED_LINK_COUNT) {
        errors.push(
            `AI 요약 성공 ${database.successfulSummaries}/${EXPECTED_LINK_COUNT}`,
        )
    }
    if (database.aiTaggedLinks !== EXPECTED_LINK_COUNT) {
        errors.push(
            `AI 태그 생성 ${database.aiTaggedLinks}/${EXPECTED_LINK_COUNT}`,
        )
    }
    if (database.embeddedLinks !== EXPECTED_LINK_COUNT) {
        errors.push(
            `임베딩 생성 ${database.embeddedLinks}/${EXPECTED_LINK_COUNT}`,
        )
    }
    if (api.systemFolders.all.linkCount !== EXPECTED_LINK_COUNT) {
        errors.push(
            `API 전체 링크 ${api.systemFolders.all.linkCount}/${EXPECTED_LINK_COUNT}`,
        )
    }
    if (
        api.systemFolders.uncategorized.linkCount !== EXPECTED_UNASSIGNED_COUNT
    ) {
        errors.push(
            `API 미분류 링크 ${api.systemFolders.uncategorized.linkCount}/${EXPECTED_UNASSIGNED_COUNT}`,
        )
    }

    for (const folder of FOLDER_SEEDS) {
        const expected = LINK_SEEDS.filter(
            (seed) => seed.folderKey === folder.key,
        ).length
        const actual = api.folders.find(
            (item) => item.folderName === folder.name,
        )?.linkCount
        if (actual !== expected) {
            errors.push(`${folder.name} 링크 ${actual ?? 0}/${expected}`)
        }
    }

    if (errors.length > 0) {
        throw new Error(`최종 검증에 실패했습니다: ${errors.join(', ')}`)
    }
}

function printCategoryEvaluation(results: AnalysisResult[]) {
    const labeled = results.filter(
        (result) => result.seededLink.seed.expectedCategory && result.detail,
    )
    const exactRanks = labeled.map((result) => {
        const expected = normalizeLabel(
            result.seededLink.seed.expectedCategory ?? '',
        )
        return (
            result.detail?.tags.findIndex(
                (tag) => normalizeLabel(tag.name) === expected,
            ) ?? -1
        )
    })
    const hits = exactRanks.filter((rank) => rank >= 0)

    printStep('AI 태그의 정답 카테고리 exact match 참고 지표')
    printKeyValue('평가 링크 수', labeled.length)
    printKeyValue('exact match 링크 수', `${hits.length}/${labeled.length}`)
    printKeyValue(
        '평균 태그 순위',
        hits.length > 0
            ? (
                  hits.reduce(
                      (sum, zeroBasedRank) => sum + zeroBasedRank + 1,
                      0,
                  ) / hits.length
              ).toFixed(2)
            : null,
    )
}

function normalizeLabel(value: string) {
    return value.trim().replace(/\s+/g, ' ').toLowerCase()
}

async function apiGet<T>(client: ApiClient, path: string): Promise<T> {
    return apiRequest<T>(client, path, { method: 'GET' })
}

async function apiGetWithRetry<T>(
    client: ApiClient,
    path: string,
    retries: number,
): Promise<T> {
    let lastError: unknown

    for (let attempt = 0; attempt <= retries; attempt += 1) {
        try {
            return await apiGet<T>(client, path)
        } catch (error) {
            lastError = error
            if (!isRetryable(error) || attempt === retries) break
            await sleep(500 * (attempt + 1))
        }
    }

    throw lastError
}

async function apiPost<T>(
    client: ApiClient,
    path: string,
    body: unknown,
): Promise<T> {
    return apiRequest<T>(client, path, {
        method: 'POST',
        body: JSON.stringify(body),
        headers: { 'Content-Type': 'application/json' },
    })
}

async function apiRequest<T>(
    client: ApiClient,
    path: string,
    init: RequestInit,
): Promise<T> {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), client.timeoutMs)

    try {
        const response = await fetch(`${client.baseUrl}${path}`, {
            ...init,
            headers: {
                Authorization: `Bearer ${client.accessToken}`,
                ...init.headers,
            },
            signal: controller.signal,
        })
        const raw = await response.text()
        const payload = parseJson(raw)

        if (!response.ok) {
            throw new ApiRequestError(
                readApiErrorMessage(payload) ??
                    `HTTP ${response.status} ${response.statusText}`,
                response.status,
            )
        }
        if (
            !isRecord(payload) ||
            payload.success !== true ||
            !('data' in payload)
        ) {
            throw new ApiRequestError('API 성공 응답 형식이 올바르지 않습니다.')
        }

        return payload.data as T
    } catch (error) {
        if (error instanceof ApiRequestError) throw error
        if (error instanceof Error && error.name === 'AbortError') {
            throw new ApiRequestError(
                `API 요청 시간이 ${client.timeoutMs}ms를 초과했습니다.`,
            )
        }
        throw new ApiRequestError(
            error instanceof Error ? error.message : String(error),
        )
    } finally {
        clearTimeout(timeout)
    }
}

function parseJson(raw: string): unknown {
    if (!raw) return undefined
    try {
        return JSON.parse(raw) as unknown
    } catch {
        return raw
    }
}

function readApiErrorMessage(payload: unknown): string | undefined {
    if (!isRecord(payload) || !isRecord(payload.error)) return undefined
    return typeof payload.error.message === 'string'
        ? payload.error.message
        : undefined
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null
}

function isRetryable(error: unknown) {
    return (
        error instanceof ApiRequestError &&
        (error.status === undefined ||
            error.status === 429 ||
            error.status >= 500)
    )
}

async function mapWithConcurrency<T, R>(
    values: readonly T[],
    concurrency: number,
    mapper: (value: T) => Promise<R>,
): Promise<R[]> {
    const results = new Array<R>(values.length)
    let nextIndex = 0

    async function worker() {
        for (;;) {
            const index = nextIndex
            nextIndex += 1
            if (index >= values.length) return
            results[index] = await mapper(values[index])
        }
    }

    await Promise.all(
        Array.from({ length: Math.min(concurrency, values.length) }, async () =>
            worker(),
        ),
    )

    return results
}

function printDatabaseStats(label: string, stats: DatabaseStats) {
    printKeyValue(
        label,
        [
            `활성=${stats.activeLinks}`,
            `삭제=${stats.deletedLinks}`,
            `폴더=${stats.folders}`,
            `요약=${stats.successfulSummaries}`,
            `AI태그=${stats.aiTaggedLinks}`,
            `임베딩=${stats.embeddedLinks}`,
        ].join(', '),
    )
}

function parsePositiveInteger(label: string, raw: string): number {
    const parsed = Number(raw)
    if (!Number.isInteger(parsed) || parsed <= 0) {
        throw new Error(`${label}은(는) 양의 정수여야 합니다: ${raw}`)
    }
    return parsed
}

function parsePositiveIntegerEnvironment(
    name: string,
    raw: string | undefined,
): number {
    return parsePositiveInteger(name, requireEnvironment(name, raw))
}

function requireEnvironment(name: string, value: string | undefined): string {
    if (!value?.trim()) {
        throw new Error(`${name} 환경변수가 필요합니다.`)
    }
    return value.trim()
}

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
}

function printHelp() {
    console.log(`랭킹 평가용 실제 링크 데이터셋 시드

사용법
  bun run db:seed:ranking
  bun run db:seed:ranking -- --apply --reset-master-data

기본 동작
  - 항상 development DB와 로컬 API만 대상으로 합니다.
  - 옵션 없이 실행하면 URL 사전검사만 하며 DB를 변경하지 않습니다.
  - 실제 생성은 --apply와 --reset-master-data를 함께 지정해야 합니다.
  - 초기화는 MASTER_USER_ID 사용자의 링크·태그·AI 메트릭·폴더만 삭제합니다.
  - 폴더와 링크 생성, 크롤링, AI 요약·태그는 MASTER_ACCESS_TOKEN으로 HTTP API를 호출합니다.

옵션
  --api-base-url <url>            기본값: RANKING_SEED_API_BASE_URL 또는 http://127.0.0.1:$PORT/api/v1
  --preflight-concurrency <n>     URL 사전검사 동시 요청 수 (기본 ${DEFAULT_PREFLIGHT_CONCURRENCY})
  --seed-concurrency <n>          동시에 분석할 링크 수 (기본 ${DEFAULT_SEED_CONCURRENCY})
  --request-timeout-ms <ms>       HTTP 요청 제한 시간 (기본 ${DEFAULT_REQUEST_TIMEOUT_MS})
  --analysis-timeout-ms <ms>      배치별 비동기 분석 제한 시간 (기본 ${DEFAULT_ANALYSIS_TIMEOUT_MS})
  -h, --help                      도움말
`)
}

main().catch((error: unknown) => {
    printError(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
})
