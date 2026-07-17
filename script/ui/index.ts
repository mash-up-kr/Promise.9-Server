#!/usr/bin/env bun
import { spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { createServer, IncomingMessage, ServerResponse } from 'node:http'
import { platform } from 'node:os'
import { join } from 'node:path'

import { printError, printKeyValue, printTitle } from '../script-log'

import { SCRIPT_ACTIONS, type ScriptAction } from './actions'
import { createScopedScript, getScopeOptions } from './scopes'

import 'dotenv/config'

type RunStatus = 'running' | 'completed' | 'failed' | 'stopped'

type ScriptRun = {
    runId: string
    sequence: number
    script: ScriptAction
    child: ReturnType<typeof spawn> | null
    startedAt: string
    finishedAt?: string
    stopping: boolean
    status: RunStatus
    exitCode?: number | null
    signal?: NodeJS.Signals | null
    terminalLog: string
    openUrlReady: boolean
}

type UiOptions = {
    host: string
    port: number
    openBrowser: boolean
    help: boolean
}

const DEFAULT_HOST = '127.0.0.1'
const DEFAULT_PORT = 46290
const MAX_TERMINAL_LOG_LENGTH = 250_000
const OPEN_URL_POLL_INTERVAL_MS = 300
const OPEN_URL_TIMEOUT_MS = 30_000

const UI_FILES: Record<string, { contentType: string; content: string }> = {
    '/': {
        contentType: 'text/html; charset=utf-8',
        content: readFileSync(join(__dirname, 'index.html'), 'utf8'),
    },
    '/styles.css': {
        contentType: 'text/css; charset=utf-8',
        content: readFileSync(join(__dirname, 'styles.css'), 'utf8'),
    },
    '/app.js': {
        contentType: 'text/javascript; charset=utf-8',
        content: readFileSync(join(__dirname, 'app.js'), 'utf8'),
    },
}

let scriptRuns: ScriptRun[] = []
let runSequence = 0
const sseClients = new Set<ServerResponse>()

async function main() {
    const options = parseUiOptions(process.argv.slice(2))

    if (options.help) {
        printHelp()
        return
    }

    const server = await listenOnPort(options.host, options.port)
    const port = options.port
    const url = `http://${options.host}:${port}`

    printTitle('🧰 스크립트 UI')
    printKeyValue('접속 URL', url)

    if (options.openBrowser) {
        openBrowser(url)
    }

    let shuttingDown = false

    const shutdown = () => {
        if (shuttingDown) {
            return
        }

        shuttingDown = true
        void shutdownUi(server).catch((error: unknown) => {
            const message =
                error instanceof Error ? error.message : String(error)

            printError(`UI 서버 종료 실패: ${message}`)
            process.exit(1)
        })
    }

    process.once('SIGINT', shutdown)
    process.once('SIGTERM', shutdown)
}

function parseUiOptions(args: string[]): UiOptions {
    const options: UiOptions = {
        host: DEFAULT_HOST,
        port: DEFAULT_PORT,
        openBrowser: true,
        help: false,
    }

    for (let index = 0; index < args.length; index += 1) {
        const arg = args[index]

        if (arg === '--help' || arg === '-h') {
            options.help = true
            continue
        }

        if (arg === '--no-open') {
            options.openBrowser = false
            continue
        }

        if (arg === '--host') {
            const { value, nextIndex } = readOptionValue(args, index, arg)
            options.host = parseHost(value)
            index = nextIndex
            continue
        }

        if (arg.startsWith('--host=')) {
            options.host = parseHost(arg.slice('--host='.length))
            continue
        }

        if (arg === '--port') {
            const { value, nextIndex } = readOptionValue(args, index, arg)
            options.port = parsePort(value)
            index = nextIndex
            continue
        }

        if (arg.startsWith('--port=')) {
            options.port = parsePort(arg.slice('--port='.length))
            continue
        }

        throw new Error(`알 수 없는 옵션입니다: ${arg}`)
    }

    return options
}

function readOptionValue(args: string[], index: number, optionName: string) {
    const value = args[index + 1]

    if (!value || value.startsWith('-')) {
        throw new Error(`${optionName} 옵션의 값이 필요합니다.`)
    }

    return {
        value,
        nextIndex: index + 1,
    }
}

function parsePort(value: string) {
    const port = Number(value)

    if (!Number.isInteger(port) || port <= 0 || port > 65_535) {
        throw new Error(`port 값이 올바르지 않습니다. 입력값: ${value}`)
    }

    return port
}

function parseHost(value: string) {
    const host = value.trim().toLowerCase()

    if (host === '127.0.0.1' || host === 'localhost') {
        return host
    }

    throw new Error(
        `UI 서버는 로컬에서만 실행할 수 있습니다. --host는 127.0.0.1 또는 localhost만 허용합니다. 입력값: ${value}`,
    )
}

async function listenOnPort(host: string, port: number) {
    const server = createServer((request, response) => {
        void handleRequest(request, response)
    })
    const listened = await tryListen(server, host, port)

    if (listened) {
        return server
    }

    throw new Error(
        `${host}:${port} port를 이미 사용 중입니다. 기존 UI를 확인하거나 해당 프로세스를 종료해주세요: http://${host}:${port}`,
    )
}

function tryListen(
    server: ReturnType<typeof createServer>,
    host: string,
    port: number,
) {
    return new Promise<boolean>((resolvePromise, reject) => {
        const handleError = (error: NodeJS.ErrnoException) => {
            server.off('listening', handleListening)

            if (error.code === 'EADDRINUSE') {
                resolvePromise(false)
                return
            }

            reject(error)
        }
        const handleListening = () => {
            server.off('error', handleError)
            resolvePromise(true)
        }

        server.once('error', handleError)
        server.once('listening', handleListening)
        server.listen(port, host)
    })
}

async function handleRequest(
    request: IncomingMessage,
    response: ServerResponse,
) {
    const url = new URL(request.url ?? '/', 'http://localhost')

    try {
        if (request.method === 'GET') {
            const uiFile = UI_FILES[url.pathname]

            if (uiFile) {
                sendText(response, uiFile.contentType, uiFile.content)
                return
            }
        }

        if (request.method === 'GET' && url.pathname === '/api/state') {
            sendJson(response, 200, getUiState())
            return
        }

        if (request.method === 'GET' && url.pathname === '/api/scopes') {
            sendJson(response, 200, getScopeOptions(process.cwd()))
            return
        }

        if (request.method === 'GET' && url.pathname === '/api/events') {
            handleSse(request, response)
            return
        }

        if (request.method === 'POST' && url.pathname === '/api/run') {
            await handleRun(request, response)
            return
        }

        if (request.method === 'POST' && url.pathname === '/api/stop') {
            await handleStop(request, response)
            return
        }

        if (request.method === 'POST' && url.pathname === '/api/clear-run') {
            await handleClearRun(request, response)
            return
        }

        if (request.method === 'POST' && url.pathname === '/api/close-run') {
            await handleCloseRun(request, response)
            return
        }

        if (request.method === 'POST' && url.pathname === '/api/stop-all') {
            stopRunningRuns('브라우저 UI에서 전체 중지 요청')
            sendJson(response, 200, getUiState())
            return
        }

        sendJson(response, 404, {
            message: '요청 경로를 찾을 수 없습니다.',
        })
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error)

        sendJson(response, 500, {
            message,
        })
    }
}

async function handleRun(request: IncomingMessage, response: ServerResponse) {
    const body = await readJsonBody(request)
    const scriptId = getStringProperty(body, 'id')
    const confirmationText = getStringProperty(body, 'confirmationText', false)
    const scope = getProperty(body, 'scope')
    const script = SCRIPT_ACTIONS.find((action) => action.id === scriptId)

    if (!script) {
        sendJson(response, 404, {
            message: '등록되지 않은 스크립트입니다.',
        })
        return
    }

    if (script.terminalOnly) {
        sendJson(response, 409, {
            message:
                '이 명령은 대화형 확인이 필요할 수 있어 터미널에서만 실행할 수 있습니다.',
        })
        return
    }

    if (
        script.longRunning &&
        scriptRuns.some(
            (run) => run.script.id === script.id && run.status === 'running',
        )
    ) {
        sendJson(response, 409, {
            message: `${script.title} 작업이 이미 실행 중입니다.`,
        })
        return
    }

    if (
        script.confirmationText &&
        confirmationText !== script.confirmationText
    ) {
        sendJson(response, 400, {
            message: '확인 문구가 일치하지 않습니다.',
        })
        return
    }

    let executableScript: ScriptAction

    try {
        executableScript = createScopedScript(script, scope, process.cwd())
    } catch (error) {
        sendJson(response, 400, {
            message: error instanceof Error ? error.message : String(error),
        })
        return
    }

    startScript(executableScript)
    sendJson(response, 202, getUiState())
}

async function handleStop(request: IncomingMessage, response: ServerResponse) {
    const body = await readJsonBody(request)
    const runId = getStringProperty(body, 'runId')

    stopRun(runId, '브라우저 UI에서 중지 요청')
    sendJson(response, 200, getUiState())
}

async function handleClearRun(
    request: IncomingMessage,
    response: ServerResponse,
) {
    const body = await readJsonBody(request)
    const runId = getStringProperty(body, 'runId')
    const run = findRun(runId)

    if (!run) {
        sendJson(response, 404, {
            message: '실행 탭을 찾을 수 없습니다.',
        })
        return
    }

    run.terminalLog = ''
    broadcast('state', getUiState())
    sendJson(response, 200, getUiState())
}

async function handleCloseRun(
    request: IncomingMessage,
    response: ServerResponse,
) {
    const body = await readJsonBody(request)
    const runId = getStringProperty(body, 'runId')
    const run = findRun(runId)

    if (!run) {
        sendJson(response, 404, {
            message: '실행 탭을 찾을 수 없습니다.',
        })
        return
    }

    if (run.status === 'running') {
        sendJson(response, 409, {
            message: '실행 중인 탭은 닫을 수 없습니다. 먼저 중지해주세요.',
        })
        return
    }

    scriptRuns = scriptRuns.filter((candidate) => candidate.runId !== runId)
    broadcast('state', getUiState())
    sendJson(response, 200, getUiState())
}

function startScript(script: ScriptAction) {
    const runId = randomUUID()
    const startedAt = new Date().toISOString()
    const childEnv: NodeJS.ProcessEnv = {
        ...process.env,
        NO_COLOR: '1',
        ...script.env,
    }

    delete childEnv.FORCE_COLOR

    const child = spawn(script.command, script.args, {
        cwd: process.cwd(),
        env: childEnv,
        stdio: ['ignore', 'pipe', 'pipe'],
    })

    const run: ScriptRun = {
        runId,
        sequence: (runSequence += 1),
        script,
        child,
        startedAt,
        stopping: false,
        status: 'running',
        terminalLog: '',
        openUrlReady: false,
    }

    scriptRuns.push(run)
    broadcast('state', getUiState())

    appendTerminalLine(runId, `🚀 실행 명령: ${script.commandLabel}`)
    appendTerminalLine(runId, `🕒 시작 시각: ${startedAt}`)
    appendTerminalLine(runId, '')

    child.stdout.on('data', (chunk: Buffer) => {
        appendTerminal(runId, chunk.toString('utf8'), 'stdout')
    })

    child.stderr.on('data', (chunk: Buffer) => {
        appendTerminal(runId, chunk.toString('utf8'), 'stderr')
    })

    child.once('error', (error) => {
        appendTerminalLine(runId, `❌ UI 실행 실패: ${error.message}`, 'stderr')
    })

    child.once('close', (code, signal) => {
        const currentRun = findRun(runId)

        if (!currentRun) {
            return
        }

        const finishedAt = new Date().toISOString()
        const runStatus: RunStatus = currentRun.stopping
            ? 'stopped'
            : code === 0
              ? 'completed'
              : 'failed'

        currentRun.child = null
        currentRun.finishedAt = finishedAt
        currentRun.status = runStatus
        currentRun.exitCode = code
        currentRun.signal = signal
        currentRun.stopping = false

        appendTerminalLine(runId, '')
        appendTerminalLine(
            runId,
            `🏁 실행 결과: ${renderRunStatus(currentRun)} / 종료 시각: ${finishedAt}`,
        )
        broadcast('state', getUiState())
    })

    if (script.openUrl) {
        void waitForOpenUrl(
            runId,
            script.readyUrl ?? script.openUrl,
            script.openUrl,
            script.readyStatus,
        )
    }
}

async function waitForOpenUrl(
    runId: string,
    readyUrl: string,
    openUrl: string,
    readyStatus?: number,
) {
    const deadline = Date.now() + OPEN_URL_TIMEOUT_MS

    while (Date.now() < deadline) {
        const run = findRun(runId)

        if (!run || run.status !== 'running') {
            return
        }

        try {
            const response = await fetch(readyUrl, {
                signal: AbortSignal.timeout(1_000),
            })

            await response.body?.cancel()

            const isReady =
                readyStatus === undefined
                    ? response.ok
                    : response.status === readyStatus

            if (isReady) {
                const readyRun = findRun(runId)

                if (!readyRun || readyRun.status !== 'running') {
                    return
                }

                readyRun.openUrlReady = true
                appendTerminalLine(runId, `🌐 화면 준비 완료: ${openUrl}`)
                openBrowser(openUrl)
                broadcast('state', getUiState())
                return
            }
        } catch {
            // 로컬 도구가 listen을 시작할 때까지 다시 확인한다.
        }

        await wait(OPEN_URL_POLL_INTERVAL_MS)
    }

    const run = findRun(runId)

    if (!run || run.status !== 'running') {
        return
    }

    appendTerminalLine(
        runId,
        `⚠️ ${OPEN_URL_TIMEOUT_MS / 1_000}초 안에 화면 준비를 확인하지 못했습니다: ${openUrl}`,
        'stderr',
    )
}

function wait(milliseconds: number) {
    return new Promise<void>((resolvePromise) => {
        setTimeout(resolvePromise, milliseconds)
    })
}

async function shutdownUi(server: ReturnType<typeof createServer>) {
    stopRunningRuns('UI 서버 종료 요청')
    closeSseClients()

    await Promise.all([closeServer(server), waitForRunningRunsToStop()])
    process.exit(0)
}

function closeServer(server: ReturnType<typeof createServer>) {
    return new Promise<void>((resolvePromise, reject) => {
        server.close((error) => {
            if (error) {
                reject(error)
                return
            }

            resolvePromise()
        })
    })
}

async function waitForRunningRunsToStop() {
    const gracefulDeadline = Date.now() + 5_000

    while (hasRunningRuns() && Date.now() < gracefulDeadline) {
        await wait(50)
    }

    for (const run of scriptRuns) {
        if (run.status === 'running' && run.child) {
            run.child.kill('SIGKILL')
        }
    }

    const forcedDeadline = Date.now() + 1_000

    while (hasRunningRuns() && Date.now() < forcedDeadline) {
        await wait(50)
    }
}

function hasRunningRuns() {
    return scriptRuns.some((run) => run.status === 'running')
}

function stopRun(runId: string, reason: string) {
    const run = findRun(runId)

    if (!run || run.status !== 'running' || !run.child) {
        return
    }

    run.stopping = true
    appendTerminalLine(runId, `🛑 ${reason}`)
    run.child.kill('SIGTERM')

    const stoppedRunId = run.runId

    setTimeout(() => {
        const currentRun = findRun(stoppedRunId)

        if (currentRun?.status === 'running' && currentRun.child) {
            appendTerminalLine(
                stoppedRunId,
                '⚠️ SIGTERM 이후 종료되지 않아 SIGKILL을 보냅니다.',
            )
            currentRun.child.kill('SIGKILL')
        }
    }, 5_000).unref()

    broadcast('state', getUiState())
}

function stopRunningRuns(reason: string) {
    for (const run of scriptRuns) {
        if (run.status === 'running') {
            stopRun(run.runId, reason)
        }
    }
}

function findRun(runId: string) {
    return scriptRuns.find((run) => run.runId === runId)
}

function handleSse(request: IncomingMessage, response: ServerResponse) {
    response.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
    })
    response.write('\n')
    sseClients.add(response)

    const pingTimer = setInterval(() => {
        writeSse(response, 'ping', {
            at: new Date().toISOString(),
        })
    }, 15_000)

    request.once('close', () => {
        clearInterval(pingTimer)
        sseClients.delete(response)
    })
}

function closeSseClients() {
    for (const client of sseClients) {
        client.end()
    }

    sseClients.clear()
}

function appendTerminalLine(
    runId: string,
    line: string,
    stream: 'stdout' | 'stderr' = 'stdout',
) {
    appendTerminal(runId, `${line}\n`, stream)
}

function appendTerminal(
    runId: string,
    chunk: string,
    stream: 'stdout' | 'stderr',
) {
    const run = findRun(runId)

    if (!run) {
        return
    }

    run.terminalLog += chunk

    if (run.terminalLog.length > MAX_TERMINAL_LOG_LENGTH) {
        run.terminalLog = run.terminalLog.slice(-MAX_TERMINAL_LOG_LENGTH)
    }

    broadcast('log', {
        runId,
        chunk,
        stream,
    })
}

function broadcast(event: string, payload: unknown) {
    for (const client of sseClients) {
        writeSse(client, event, payload)
    }
}

function writeSse(response: ServerResponse, event: string, payload: unknown) {
    response.write(`event: ${event}\n`)
    response.write(`data: ${JSON.stringify(payload)}\n\n`)
}

function getUiState() {
    return {
        scripts: SCRIPT_ACTIONS.map(toPublicScript),
        runs: scriptRuns.map(toPublicRun),
    }
}

function toPublicRun(run: ScriptRun) {
    return {
        runId: run.runId,
        sequence: run.sequence,
        scriptId: run.script.id,
        title: run.script.title,
        commandLabel: run.script.commandLabel,
        severity: run.script.severity,
        startedAt: run.startedAt,
        finishedAt: run.finishedAt,
        stopping: run.stopping,
        status: run.status,
        exitCode: run.exitCode,
        signal: run.signal,
        terminalLog: run.terminalLog,
        openUrl: run.script.openUrl,
        openUrlReady: run.openUrlReady,
    }
}

function renderRunStatus(run: ScriptRun) {
    if (run.status === 'completed') {
        return '완료'
    }

    if (run.status === 'stopped') {
        return `중지${run.signal ? ` (${run.signal})` : ''}`
    }

    if (run.status === 'failed') {
        return `실패${run.signal ? ` (${run.signal})` : ''} / 종료 코드 ${
            run.exitCode
        }`
    }

    return '실행 중'
}

function toPublicScript(script: ScriptAction) {
    const targetEnvironment = script.env?.APP_ENV

    return {
        id: script.id,
        group: script.group,
        title: script.title,
        description: script.description,
        commandLabel: script.commandLabel,
        severity: script.severity,
        warning: script.warning,
        confirmationText: script.confirmationText,
        longRunning: script.longRunning ?? false,
        terminalOnly: script.terminalOnly ?? false,
        scope: script.scope,
        openUrl: script.openUrl,
        targetEnvironment:
            targetEnvironment === 'development' ||
            targetEnvironment === 'production'
                ? targetEnvironment
                : undefined,
    }
}

async function readJsonBody(request: IncomingMessage): Promise<unknown> {
    const chunks: Buffer[] = []
    let size = 0

    for await (const chunk of request as AsyncIterable<Buffer | string>) {
        const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)

        size += buffer.length

        if (size > 32_000) {
            throw new Error('요청 본문이 너무 큽니다.')
        }

        chunks.push(buffer)
    }

    if (chunks.length === 0) {
        return {}
    }

    return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown
}

function getStringProperty(value: unknown, key: string): string
function getStringProperty(
    value: unknown,
    key: string,
    required: false,
): string | undefined
function getStringProperty(
    value: unknown,
    key: string,
    required = true,
): string | undefined {
    if (!value || typeof value !== 'object') {
        if (required) {
            throw new Error(`${key} 값이 필요합니다.`)
        }

        return undefined
    }

    const property = (value as Record<string, unknown>)[key]

    if (typeof property === 'string') {
        return property
    }

    if (required) {
        throw new Error(`${key} 값이 필요합니다.`)
    }

    return undefined
}

function getProperty(value: unknown, key: string) {
    if (!value || typeof value !== 'object') {
        return undefined
    }

    return (value as Record<string, unknown>)[key]
}

function sendJson(
    response: ServerResponse,
    statusCode: number,
    payload: unknown,
) {
    response.writeHead(statusCode, {
        'Content-Type': 'application/json; charset=utf-8',
    })
    response.end(JSON.stringify(payload))
}

function sendText(
    response: ServerResponse,
    contentType: string,
    content: string,
) {
    response.writeHead(200, {
        'Content-Type': contentType,
    })
    response.end(content)
}

function openBrowser(url: string) {
    const currentPlatform = platform()
    const command =
        currentPlatform === 'darwin'
            ? 'open'
            : currentPlatform === 'win32'
              ? 'cmd'
              : 'xdg-open'
    const args = currentPlatform === 'win32' ? ['/c', 'start', '', url] : [url]

    try {
        const child = spawn(command, args, {
            detached: true,
            stdio: 'ignore',
        })

        child.once('error', () => {
            console.log(`⚠️ 브라우저를 자동으로 열지 못했습니다: ${url}`)
        })
        child.unref()
    } catch {
        console.log(`⚠️ 브라우저를 자동으로 열지 못했습니다: ${url}`)
    }
}

function printHelp() {
    console.log(`📘 사용법
  bun run ui
  bun run ui -- --no-open
  bun run ui -- --port=46290

⚙️ 옵션
      --host <host>   서버 host. 127.0.0.1 또는 localhost. 기본값은 ${DEFAULT_HOST}
      --port <port>   서버 port. 기본값은 ${DEFAULT_PORT}
      --no-open       브라우저 자동 실행 안 함
  -h, --help          도움말 출력
`)
}

main().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error)

    printError(message)
    process.exitCode = 1
})
