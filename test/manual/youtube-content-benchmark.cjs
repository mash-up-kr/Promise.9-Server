// 실행: YOUTUBE_BASELINE_ROOT=/path/to/main YOUTUBE_BENCH_ENV_FILE=/path/to/.env \
// node test/manual/youtube-content-benchmark.cjs > /tmp/youtube-benchmark.json
// baseline에는 비교할 커밋의 src·tsconfig.json과 설치된 node_modules가 필요하다.
const fs = require('node:fs')
const path = require('node:path')
const { performance } = require('node:perf_hooks')

const root = path.resolve(__dirname, '../..')
const baselineRoot = process.env.YOUTUBE_BASELINE_ROOT
const apiKey =
    process.env.YOUTUBE_API_KEY ||
    (process.env.YOUTUBE_BENCH_ENV_FILE
        ? require('dotenv').parse(
              fs.readFileSync(process.env.YOUTUBE_BENCH_ENV_FILE),
          ).YOUTUBE_API_KEY
        : undefined)
if (!baselineRoot || !apiKey)
    throw new Error('baseline 경로와 YouTube API 키가 필요합니다.')

require('ts-node').register({
    transpileOnly: true,
    project: path.join(root, 'tsconfig.json'),
})
require('@nestjs/common').Logger.overrideLogger(false)
const { YoutubeDataClient } = require(
    path.join(root, 'src/modules/link/content/youtube/youtube-data.client'),
)
const load = (directory, file) => require(path.join(directory, 'src', file))
const services = {}
for (const [name, directory] of Object.entries({
    before: baselineRoot,
    after: root,
})) {
    const { UrlSecurityService } = load(
        directory,
        'common/security/url-security/url-security.service',
    )
    const { LinkContentHtmlFetcher } = load(
        directory,
        'modules/link/content/html/link-content-html.fetcher',
    )
    const { LinkContentService } = load(
        directory,
        'modules/link/content/link-content.service',
    )
    const security = new UrlSecurityService()
    services[name] = new LinkContentService(
        security,
        new LinkContentHtmlFetcher(security),
        { isEnabled: () => false },
        ...(name === 'after'
            ? [new YoutubeDataClient({ get: () => apiKey })]
            : []),
    )
}

const originalFetch = global.fetch
let requests
global.fetch = async (input, options) => {
    const url = new URL(input instanceof Request ? input.url : input)
    // 쿼리 문자열·키·오류 응답 본문은 기록하지 않는다.
    const request = { endpoint: url.hostname + url.pathname }
    requests.push(request)
    const start = performance.now()
    try {
        const response = await originalFetch(input, options)
        request.status = response.status
        return response
    } finally {
        request.headersMs = Math.round(performance.now() - start)
    }
}

const videos = ['8Pbt-Aum5Q4', 'rfscVS0vtbw']
const methods = ['preview', 'collect']
const repetitions = 10
async function sample(variant, videoId, method, round) {
    requests = []
    const start = performance.now()
    try {
        const result = await services[variant][method](
            'https://www.youtube.com/watch?v=' + videoId,
        )
        return {
            variant,
            videoId,
            method,
            round,
            ms: Math.round((performance.now() - start) * 10) / 10,
            title: result?.title ?? null,
            descriptionLength: result?.description?.length ?? 0,
            contentLength: result?.content?.length ?? 0,
            imageUrl: result?.thumbnailUrl ?? result?.image?.url ?? null,
            requests,
        }
    } catch {
        return {
            variant,
            videoId,
            method,
            round,
            ms: Math.round(performance.now() - start),
            failed: true,
            requests,
        }
    }
}

async function main() {
    const warmups = []
    const samples = []
    for (const videoId of videos) {
        for (const method of methods) {
            for (const variant of ['before', 'after']) {
                warmups.push(await sample(variant, videoId, method, -1))
            }
        }
    }
    for (let round = 0; round < repetitions; round++) {
        // 같은 프로세스·네트워크에서 호출 순서를 교대해 연결 재사용·시간대 편향을 줄인다.
        const order = round % 2 ? ['after', 'before'] : ['before', 'after']
        for (const videoId of videos) {
            for (const method of methods) {
                for (const variant of order)
                    samples.push(await sample(variant, videoId, method, round))
            }
        }
    }
    const summaries = []
    for (const method of methods) {
        for (const variant of ['before', 'after']) {
            const group = samples.filter(
                (row) => row.variant === variant && row.method === method,
            )
            const times = group.map((row) => row.ms).sort((a, b) => a - b)
            summaries.push({
                method,
                variant,
                count: group.length,
                failures: group.filter((row) => row.failed).length,
                medianMs: (times[9] + times[10]) / 2,
                p95Ms: times[Math.ceil(times.length * 0.95) - 1],
                minMs: times[0],
                maxMs: times.at(-1),
                meanMs:
                    group.reduce((sum, row) => sum + row.ms, 0) / group.length,
                totalRequests: group.reduce(
                    (sum, row) => sum + row.requests.length,
                    0,
                ),
            })
        }
    }
    console.log(
        JSON.stringify(
            {
                recordedAt: new Date().toISOString(),
                node: process.version,
                baselineCommit: process.env.YOUTUBE_BASELINE_COMMIT ?? null,
                repetitions,
                warmups,
                summaries,
                samples,
            },
            null,
            2,
        ),
    )
    if (samples.some((row) => row.failed)) process.exitCode = 1
}
main().catch(() => {
    console.error('벤치마크 실행 실패')
    process.exitCode = 1
})
