const assert = require('node:assert/strict')
const { fork, spawn } = require('node:child_process')
const { once } = require('node:events')
const http = require('node:http')
const path = require('node:path')
const { test } = require('node:test')

for (const origin of ['uncaughtException', 'unhandledRejection']) {
    test(
        `프로세스 ${origin}: 마스킹된 fatal만 동기 기록하고 종료한다`,
        { timeout: 10_000 },
        async () => {
            const child = spawn(
                process.execPath,
                [
                    '-e',
                    `
                    const { TelemetryLogger } = require('./dist/infrastructure/observability/telemetry.logger');
                    const { registerFatalErrorHandler } = require('./dist/infrastructure/observability/fatal-error-handler');
                    registerFatalErrorHandler(new TelemetryLogger());
                    const error = new Error('failed access_token=fatal-secret fatal-user@example.test');
                    setTimeout(() => console.log('unexpected-resume'), 100);
                    ${origin === 'uncaughtException' ? 'setImmediate(() => { throw error; });' : 'Promise.reject(error);'}
                    `,
                ],
                { cwd: path.join(__dirname, '..') },
            )
            let stdout = ''
            let stderr = ''
            child.stdout.on('data', (chunk) => (stdout += chunk))
            child.stderr.on('data', (chunk) => (stderr += chunk))
            const [code] = await once(child, 'close')
            assert.equal(code, 1)
            assert.equal(stdout, '')
            const record = JSON.parse(stderr.trim())
            assert.equal(record.event, 'process.uncaught_exception')
            assert.equal(record.level, 'fatal')
            assert.equal(record.origin, origin)
            assert.ok(record.error.stack.includes('[eval]'))
            assert.ok(!stderr.includes('fatal-secret'))
            assert.ok(!stderr.includes('fatal-user@example.test'))
        },
    )
}

test(
    '실제 main 진입점: 부팅 실패를 JSON으로 남기고 종료한다',
    { timeout: 15_000 },
    async (t) => {
        const child = spawn(
            process.execPath,
            [path.join(__dirname, '../dist/main.js')],
            {
                env: {
                    ...process.env,
                    APP_ENV: 'development',
                    DATABASE_URL_DEVELOPMENT: '',
                    OTEL_ENABLED: 'false',
                    OTEL_EXPORTER_OTLP_PROTOCOL: 'http/protobuf',
                    OTEL_TRACES_SAMPLER_ARG: '1',
                    LOG_LEVEL: 'error',
                },
            },
        )
        t.after(() => {
            if (child.exitCode === null) child.kill('SIGKILL')
        })
        let output = ''
        child.stdout.on('data', (chunk) => {
            output += chunk
        })
        child.stderr.on('data', (chunk) => {
            output += chunk
        })
        const [code] = await once(child, 'close')
        assert.equal(code, 1)
        const records = output
            .trim()
            .split('\n')
            .map((line) => JSON.parse(line))
        assert.ok(
            records.some(
                (record) =>
                    record.event === 'application.start_failed' &&
                    record.level === 'fatal',
            ),
        )
    },
)

test(
    'OTLP 수집기가 실패해도 API 응답과 종료 처리를 유지한다',
    { timeout: 25_000 },
    async (t) => {
        let exportAttempts = 0
        const collector = http.createServer((request, response) => {
            exportAttempts += 1
            request.resume()
            response.writeHead(503).end('unavailable')
        })
        collector.listen(0, '127.0.0.1')
        await once(collector, 'listening')
        t.after(() => {
            collector.closeAllConnections()
            collector.close()
        })
        const child = fork(
            path.join(__dirname, 'fixtures/observability-app.cjs'),
            [],
            {
                silent: true,
                execArgv: [],
                env: {
                    ...process.env,
                    APP_ENV: 'production',
                    OTEL_ENABLED: 'true',
                    OTEL_SDK_DISABLED: 'false',
                    OTEL_EXPORTER_OTLP_ENDPOINT: `http://127.0.0.1:${collector.address().port}`,
                    OTEL_EXPORTER_OTLP_PROTOCOL: 'http/protobuf',
                    OTEL_EXPORTER_OTLP_HEADERS: '',
                    OTEL_EXPORTER_OTLP_LOGS_HEADERS: '',
                    OTEL_EXPORTER_OTLP_METRICS_HEADERS: '',
                    OTEL_EXPORTER_OTLP_TRACES_HEADERS: '',
                    OTEL_RESOURCE_ATTRIBUTES: '',
                    OTEL_TRACES_SAMPLER_ARG: '1',
                },
            },
        )
        t.after(() => {
            if (child.exitCode === null && child.signalCode === null)
                child.kill('SIGKILL')
        })
        child.stdout.resume()
        let diagnostics = ''
        const exporterFailed = new Promise((resolve) => {
            child.stderr.on('data', (chunk) => {
                diagnostics += chunk
                if (diagnostics.includes('"context":"OpenTelemetry"'))
                    resolve()
            })
        })
        const exited = once(child, 'close')
        const [ready] = await Promise.race([
            once(child, 'message'),
            exited.then(() => {
                throw new Error(`Fixture startup failed: ${diagnostics}`)
            }),
        ])
        const endpoint = `http://127.0.0.1:${ready.port}/api/v1/items/42`
        await (await fetch(endpoint)).text()
        // 실제 배치 export가 실패한 뒤에도 새 요청이 응답하는지 확인한다.
        await exporterFailed
        assert.ok(exportAttempts > 0)
        const response = await fetch(endpoint, {
            signal: AbortSignal.timeout(2000),
        })
        assert.equal(response.status, 200)
        assert.deepEqual(await response.json(), { id: '42' })
        child.kill('SIGTERM')
        const [, signal] = await exited
        assert.equal(signal, 'SIGTERM', diagnostics)
        const diagnosticRecords = diagnostics
            .trim()
            .split('\n')
            .map((line) => JSON.parse(line))
        assert.ok(diagnosticRecords.some((record) => record.level === 'error'))
        assert.ok(
            diagnosticRecords.every(
                (record) =>
                    record.context === 'OpenTelemetry' &&
                    ['error', 'warn'].includes(record.level),
            ),
            diagnostics,
        )
    },
)

for (const { enabled, appEnvironment, resourceAttributes, environment } of [
    {
        enabled: true,
        appEnvironment: 'development',
        resourceAttributes:
            'deployment.environment=dev,deployment.environment.name=dev',
        environment: 'dev',
    },
    {
        enabled: true,
        appEnvironment: 'production',
        resourceAttributes: '',
        environment: 'production',
    },
    {
        enabled: false,
        appEnvironment: 'production',
        resourceAttributes: '',
        environment: 'production',
    },
]) {
    const hostId = `promise9-smoke-${environment}`
    test(
        `Node 배포 빌드: ${environment} OTLP ${enabled ? '활성' : '비활성'}`,
        { timeout: 30_000 },
        async (t) => {
            const payloads = []
            let outgoingTraceparent
            const collector = http.createServer(async (request, response) => {
                if (request.url.startsWith('/resource')) {
                    outgoingTraceparent = request.headers.traceparent
                    response.end('ok')
                    return
                }
                const chunks = []
                for await (const chunk of request) chunks.push(chunk)
                payloads.push({
                    path: request.url,
                    type: request.headers['content-type'],
                    body: Buffer.concat(chunks),
                })
                response
                    .writeHead(200, {
                        'Content-Type': 'application/x-protobuf',
                    })
                    .end()
            })
            collector.listen(0, '127.0.0.1')
            await once(collector, 'listening')
            t.after(() => {
                collector.closeAllConnections()
                collector.close()
            })
            const endpoint = `http://127.0.0.1:${collector.address().port}`
            const child = fork(
                path.join(__dirname, 'fixtures/observability-app.cjs'),
                [],
                {
                    silent: true,
                    execArgv: [],
                    env: {
                        ...process.env,
                        APP_ENV: appEnvironment,
                        OTEL_ENABLED: String(enabled),
                        OTEL_SDK_DISABLED: 'false',
                        OTEL_EXPORTER_OTLP_ENDPOINT: endpoint,
                        OTEL_EXPORTER_OTLP_PROTOCOL: 'http/protobuf',
                        OTEL_EXPORTER_OTLP_HEADERS: '',
                        OTEL_EXPORTER_OTLP_LOGS_HEADERS: '',
                        OTEL_EXPORTER_OTLP_METRICS_HEADERS: '',
                        OTEL_EXPORTER_OTLP_TRACES_HEADERS: '',
                        OTEL_TRACES_SAMPLER_ARG: '1',
                        OTEL_HOST_ID: hostId,
                        OTEL_RESOURCE_ATTRIBUTES: resourceAttributes,
                        OBS_TEST_UPSTREAM_URL: endpoint,
                    },
                },
            )
            t.after(() => {
                if (child.exitCode === null) child.kill('SIGKILL')
            })
            let output = ''
            let diagnostics = ''
            child.stdout.on('data', (chunk) => {
                output += chunk
            })
            child.stderr.on('data', (chunk) => {
                diagnostics += chunk
            })
            const waitForOutput = (text) =>
                new Promise((resolve) => {
                    const check = () => {
                        if (!output.includes(text)) return
                        child.stdout.off('data', check)
                        resolve()
                    }
                    child.stdout.on('data', check)
                    check()
                })
            const exited = once(child, 'close')
            const [ready] = await Promise.race([
                once(child, 'message'),
                exited.then(() => {
                    throw new Error(`Fixture startup failed: ${diagnostics}`)
                }),
            ])
            const base = `http://127.0.0.1:${ready.port}/api/v1`
            const inboundTraceId = '1234567890abcdef1234567890abcdef'
            const items = await Promise.all(
                ['42', '43'].map(async (id) => {
                    const response = await fetch(
                        `${base}/items/${id}?access_token=request-secret`,
                        {
                            headers: {
                                authorization: 'Bearer header-secret',
                                traceparent: `00-${inboundTraceId}-1234567890abcdef-01`,
                            },
                        },
                    )
                    assert.equal(response.status, 200)
                    assert.deepEqual(await response.json(), { id })
                    if (enabled)
                        assert.equal(
                            response.headers.get('x-trace-id'),
                            inboundTraceId,
                        )
                    return {
                        id,
                        requestId: response.headers.get('x-request-id'),
                    }
                }),
            )
            assert.notEqual(items[0].requestId, items[1].requestId)
            const boom = await fetch(`${base}/boom`)
            assert.equal(boom.status, 500)
            const body = await boom.json()
            assert.equal(body.error.errorCode, 910002)
            assert.equal(body.error.message, '서버 내부 오류가 발생했습니다.')
            assert.ok(!JSON.stringify(body).includes('upstream'))
            const expected = await fetch(`${base}/expected`)
            assert.equal(expected.status, 409)
            assert.equal((await expected.json()).error.existingLinkId, 7)
            const bad = await fetch(`${base}/bad`)
            assert.equal((await bad.json()).error.errorCode, 910001)
            const oversized = await fetch(`${base}/items/42`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ text: 'x'.repeat(110_000) }),
            })
            assert.equal(oversized.status, 413)
            assert.equal((await oversized.json()).error.code, 413)
            const unsupportedEncoding = await fetch(`${base}/items/42`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Content-Encoding': 'not-supported',
                },
                body: '{}',
            })
            assert.equal(unsupportedEncoding.status, 415)
            assert.equal((await unsupportedEncoding.json()).error.code, 415)
            const missing = await fetch(
                `${base}/missing?api_key=notfound-secret`,
            )
            assert.equal(missing.status, 404)
            await missing.text()
            await (await fetch(base)).text()
            await (await fetch(`${base}/outbound`)).text()
            const slow = http.get(`${base}/slow`)
            slow.on('error', () => {})
            await waitForOutput('fixture.slow.started')
            slow.destroy()
            await waitForOutput('"aborted":true')

            // SIGTERM -> Nest drain/HTTP 종료 -> SDK 마지막 배치 export를 실제 프로세스에서 검증한다.
            child.kill('SIGTERM')
            const [, signal] = await exited
            assert.equal(signal, 'SIGTERM', diagnostics)
            const records = (output + diagnostics)
                .trim()
                .split('\n')
                .map((line) => JSON.parse(line))
            const access = records.filter(
                (record) => record.event === 'http.request',
            )
            assert.equal(access.length, 10)
            assert.equal(
                access.filter(
                    (record) => record.aborted && record.status_code === 0,
                ).length,
                1,
            )
            assert.ok(access.some((record) => record.route === 'unmatched'))
            for (const item of items) {
                const log = records.find(
                    (record) =>
                        record.event === 'fixture.item' &&
                        record.marker === item.id,
                )
                assert.equal(log.request_id, item.requestId)
                const requestLog = access.find(
                    (record) => record.request_id === item.requestId,
                )
                assert.equal(requestLog.route, '/api/v1/items/:id')
                assert.equal(Boolean(requestLog.trace_id), enabled)
                if (enabled) assert.equal(log.trace_id, requestLog.trace_id)
            }
            const errorLog = records.find(
                (record) =>
                    record.event === 'http.exception' &&
                    record.status_code === 500,
            )
            assert.equal(errorLog.level, 'error')
            assert.ok(errorLog.error.stack.includes('FixtureController.boom'))
            assert.equal(errorLog.request_id, boom.headers.get('x-request-id'))
            assert.ok(
                records.every((record) => record.context !== 'OpenTelemetry'),
                diagnostics,
            )
            const allText =
                output +
                diagnostics +
                payloads.map((payload) => payload.body.toString()).join('')
            for (const secret of [
                'request-secret',
                'header-secret',
                'error-secret',
                'outbound-secret',
                'notfound-secret',
                'mail@example.test',
            ])
                assert.ok(
                    !allText.includes(secret),
                    `수집 데이터에 ${secret}가 포함됨`,
                )

            if (enabled) {
                assert.match(
                    outgoingTraceparent,
                    /^00-[a-f0-9]{32}-[a-f0-9]{16}-01$/,
                )
                for (const signalName of ['logs', 'traces', 'metrics']) {
                    const signalPayloads = payloads.filter(
                        (payload) => payload.path === `/v1/${signalName}`,
                    )
                    assert.ok(
                        payloads.some(
                            (payload) =>
                                payload.path === `/v1/${signalName}` &&
                                payload.type === 'application/x-protobuf' &&
                                payload.body.length > 0,
                        ),
                        `${signalName} OTLP 배치 없음: ${diagnostics}`,
                    )
                    // 세 신호의 환경과 호스트가 동일하게 분리되어 전송되는지 확인한다.
                    for (const [key, value] of [
                        ['deployment.environment', environment],
                        ['deployment.environment.name', environment],
                        ['host.id', hostId],
                    ]) {
                        const valueLength = Buffer.byteLength(value)
                        const encodedAttribute = Buffer.concat([
                            Buffer.from([0x0a, Buffer.byteLength(key)]),
                            Buffer.from(key),
                            Buffer.from([
                                0x12,
                                valueLength + 2,
                                0x0a,
                                valueLength,
                            ]),
                            Buffer.from(value),
                        ])
                        assert.ok(
                            signalPayloads.every((payload) =>
                                payload.body.includes(encodedAttribute),
                            ),
                            `${signalName}: ${key}=${value} 누락`,
                        )
                    }
                }
                const traces = Buffer.concat(
                    payloads
                        .filter((payload) => payload.path === '/v1/traces')
                        .map((payload) => payload.body),
                )
                const logs = Buffer.concat(
                    payloads
                        .filter((payload) => payload.path === '/v1/logs')
                        .map((payload) => payload.body),
                )
                assert.ok(
                    traces.includes(Buffer.from(errorLog.trace_id, 'hex')),
                )
                assert.ok(logs.includes(Buffer.from(errorLog.trace_id, 'hex')))
                assert.ok(traces.includes(Buffer.from('/api/v1/items/:id')))
                assert.ok(
                    payloads.some(
                        (payload) =>
                            payload.path === '/v1/metrics' &&
                            payload.body.includes(
                                Buffer.from('promise9.http.server.duration'),
                            ),
                    ),
                )
            } else {
                assert.equal(payloads.length, 0)
                assert.equal(outgoingTraceparent, undefined)
            }
        },
    )
}
