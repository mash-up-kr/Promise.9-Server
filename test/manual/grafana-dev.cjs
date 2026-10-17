// 실제 Grafana Cloud 수신을 확인하는 수동 실행 도구. CI에서는 실행하지 않는다.
// node --env-file=.env.local test/manual/grafana-dev.cjs
// 제품 DB/API 대신 실제 계측 모듈을 사용하는 Nest fixture로 정상·500 요청을 만든다.
const assert = require('node:assert/strict')
const { fork } = require('node:child_process')
const { randomBytes } = require('node:crypto')
const { once } = require('node:events')
const fs = require('node:fs')
const path = require('node:path')
const { setTimeout: delay } = require('node:timers/promises')

async function main() {
    const endpoint = new URL(process.env.OTEL_EXPORTER_OTLP_ENDPOINT ?? '')
    assert.equal(endpoint.protocol, 'https:', '실제 Cloud HTTPS endpoint 필요')
    assert.ok(
        process.env.OTEL_EXPORTER_OTLP_HEADERS,
        'OTEL_EXPORTER_OTLP_HEADERS를 .env.local에 설정해야 합니다.',
    )
    const runId = `grafana-dev-${new Date().toISOString().replace(/[:.]/g, '-')}`
    const outputDirectory = path.resolve(__dirname, '../../.tmp')
    fs.mkdirSync(outputDirectory, { recursive: true, mode: 0o700 })
    const logPath = path.join(outputDirectory, `${runId}.jsonl`)
    const log = fs.createWriteStream(logPath, { flags: 'wx', mode: 0o600 })
    const report = {
        runId,
        startedAt: new Date().toISOString(),
        service: 'promise9-api',
        environment: 'dev',
        fixture: true,
        logPath,
        requests: [],
        exporterErrors: 0,
    }
    const child = fork(
        path.join(__dirname, '../fixtures/observability-app.cjs'),
        [],
        {
            silent: true,
            execArgv: ['--enable-source-maps'],
            env: {
                ...process.env,
                APP_ENV: 'development',
                OTEL_ENABLED: 'true',
                OTEL_SDK_DISABLED: 'false',
                OTEL_EXPORTER_OTLP_PROTOCOL: 'http/protobuf',
                OTEL_SERVICE_NAME: report.service,
                OTEL_SERVICE_VERSION: runId,
                OTEL_HOST_ID: 'promise9-local-dev',
                OTEL_RESOURCE_ATTRIBUTES:
                    'deployment.environment=dev,deployment.environment.name=dev,host.name=promise9-local-dev',
                OTEL_TRACES_SAMPLER_ARG: '1',
            },
        },
    )
    const exited = once(child, 'close')
    let stderr = ''
    child.stdout.on('data', (chunk) => log.write(chunk))
    child.stderr.on('data', (chunk) => {
        stderr += chunk.toString()
        log.write(chunk)
    })
    let cancelled = false
    const stop = () => {
        cancelled = true
    }
    process.once('SIGINT', stop)
    process.once('SIGTERM', stop)
    try {
        const [ready] = await Promise.race([
            once(child, 'message'),
            exited.then(() => {
                throw new Error(`Fixture 부팅 실패. ${logPath} 확인`)
            }),
            delay(15000, undefined, { ref: false }).then(() => {
                throw new Error('Fixture 부팅 제한 시간 초과')
            }),
        ])
        const base = `http://127.0.0.1:${ready.port}/api/v1`
        console.log(
            JSON.stringify({
                event: 'validation.started',
                runId,
                environment: 'dev',
                logPath,
            }),
        )
        // 60초 간격 메트릭 두 번과 마지막 flush를 확인할 수 있도록 약 130초 실행한다.
        for (let round = 0; round < 26 && !cancelled; round += 1) {
            if (child.exitCode !== null || child.signalCode !== null)
                throw new Error('검증 도중 서버 종료')
            for (const route of [
                `items/${runId}`,
                ...(round % 5 === 0 ? ['boom'] : []),
            ]) {
                const traceId = randomBytes(16).toString('hex')
                const response = await fetch(`${base}/${route}`, {
                    signal: AbortSignal.timeout(5000),
                    headers: {
                        traceparent: `00-${traceId}-${randomBytes(8).toString('hex')}-01`,
                    },
                })
                await response.text()
                assert.equal(response.status, route === 'boom' ? 500 : 200)
                assert.equal(response.headers.get('x-trace-id'), traceId)
                const request = {
                    route:
                        route === 'boom' ? '/api/v1/boom' : '/api/v1/items/:id',
                    status: response.status,
                    requestId: response.headers.get('x-request-id'),
                    traceId,
                }
                report.requests.push(request)
                if (round === 0)
                    console.log(
                        JSON.stringify({
                            event: 'validation.request',
                            ...request,
                        }),
                    )
            }
            await delay(5000)
        }
    } finally {
        if (child.exitCode === null && child.signalCode === null)
            child.kill('SIGTERM')
        const forceStop = setTimeout(() => child.kill('SIGKILL'), 15000)
        const [code, signal] = await exited
        clearTimeout(forceStop)
        await new Promise((resolve) => log.end(resolve))
        report.endedAt = new Date().toISOString()
        report.exporterErrors = stderr
            .split('\n')
            .filter((line) => line.includes('"context":"OpenTelemetry"')).length
        report.exit = { code, signal }
        fs.writeFileSync(
            path.join(outputDirectory, 'grafana-dev-last.json'),
            JSON.stringify(report, null, 2),
            { mode: 0o600 },
        )
        console.log(
            JSON.stringify({
                event: 'validation.finished',
                runId,
                requests: report.requests.length,
                exporterErrors: report.exporterErrors,
                exit: report.exit,
            }),
        )
        process.off('SIGINT', stop)
        process.off('SIGTERM', stop)
        if (report.exporterErrors || signal !== 'SIGTERM') process.exitCode = 1
    }
}

main().catch((error) => {
    console.error(error.message)
    process.exitCode = 1
})
