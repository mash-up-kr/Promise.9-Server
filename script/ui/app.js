const scriptListEl = document.getElementById('scriptList')
const noResultsEl = document.getElementById('noResults')
const searchInputEl = document.getElementById('searchInput')
const filterButtonEls = Array.from(document.querySelectorAll('.filter-button'))
const groupButtonEls = Array.from(document.querySelectorAll('.group-button'))
const groupCountEls = Array.from(
    document.querySelectorAll('[data-group-count]'),
)
const environmentButtonEls = Array.from(
    document.querySelectorAll('.environment-button'),
)
const visibleCountEl = document.getElementById('visibleCount')
const terminalTabsEl = document.getElementById('terminalTabs')
const terminalEl = document.getElementById('terminal')
const statusPillEl = document.getElementById('statusPill')
const statusTextEl = document.getElementById('statusText')
const terminalTitleEl = document.getElementById('terminalTitle')
const terminalSubtitleEl = document.getElementById('terminalSubtitle')
const terminalStatusEl = document.getElementById('terminalStatus')
const runTimerEl = document.getElementById('runTimer')
const openRunLinkEl = document.getElementById('openRunLink')
const stopButtonEl = document.getElementById('stopButton')
const stopAllButtonEl = document.getElementById('stopAllButton')
const clearButtonEl = document.getElementById('clearButton')
const confirmDialogEl = document.getElementById('confirmDialog')
const dialogTitleEl = document.getElementById('dialogTitle')
const dialogDescriptionEl = document.getElementById('dialogDescription')
const dialogWarningEl = document.getElementById('dialogWarning')
const dialogCommandEl = document.getElementById('dialogCommand')
const requiredPhraseEl = document.getElementById('requiredPhrase')
const confirmInputEl = document.getElementById('confirmInput')
const confirmRunButtonEl = document.getElementById('confirmRunButton')
const cancelDialogButtonEl = document.getElementById('cancelDialogButton')
const scopeDialogEl = document.getElementById('scopeDialog')
const scopeFormEl = document.getElementById('scopeForm')
const scopeTitleEl = document.getElementById('scopeTitle')
const changedScopeButtonEl = document.getElementById('changedScopeButton')
const changedScopeMetaEl = document.getElementById('changedScopeMeta')
const scopeBreadcrumbsEl = document.getElementById('scopeBreadcrumbs')
const scopeBrowserListEl = document.getElementById('scopeBrowserList')
const scopeSelectionEl = document.getElementById('scopeSelection')
const scopeSelectionPathEl = document.getElementById('scopeSelectionPath')
const scopeSelectionCountEl = document.getElementById('scopeSelectionCount')
const scopeCommandPreviewEl = document.getElementById('scopeCommandPreview')
const cancelScopeButtonEl = document.getElementById('cancelScopeButton')
const runScopeButtonEl = document.getElementById('runScopeButton')

let scripts = []
let runs = []
let scopeOptions = {
    lintFiles: [],
    testFiles: [],
    changedLintFiles: [],
    changedTestFiles: [],
}
let selectedRunId = null
let pendingScript = null
let pendingScopeScript = null
let currentScopeDirectory = ''
let selectedScopePath = null
let groupFilter = window.localStorage.getItem('script-ui-group') || '검증'
let environmentFilter =
    window.localStorage.getItem('script-ui-environment') || 'development'
let severityFilter = 'all'
let searchQuery = ''

const severityLabels = {
    safe: '안전',
    warning: '주의',
    danger: '위험',
}

async function boot() {
    const state = await fetchJson('/api/state')
    applyState(state)
    connectEvents()
    window.setInterval(updateElapsed, 1000)
}

async function fetchJson(url, options) {
    const response = await fetch(url, options)
    const payload = await response.json()

    if (!response.ok) {
        throw new Error(payload.message || '요청에 실패했습니다.')
    }

    return payload
}

function connectEvents() {
    const events = new EventSource('/api/events')

    events.addEventListener('log', (event) => {
        const payload = JSON.parse(event.data)
        appendRunLog(payload.runId, payload.chunk)
    })

    events.addEventListener('state', (event) => {
        const state = JSON.parse(event.data)
        applyState(state)
    })
}

function applyState(state, options = {}) {
    scripts = state.scripts
    runs = state.runs || []

    if (!scripts.some((script) => script.group === groupFilter)) {
        groupFilter = scripts[0]?.group || '검증'
    }

    if (
        environmentFilter !== 'development' &&
        environmentFilter !== 'production'
    ) {
        environmentFilter = 'development'
    }

    if (
        options.preferLatest ||
        !runs.some((run) => run.runId === selectedRunId)
    ) {
        selectedRunId = getLatestRun()?.runId || null
    }

    syncGroupButtons()
    syncEnvironmentButtons()
    renderScripts()
    renderTerminalTabs()
    renderStatus()
    renderSelectedTerminal()
    updateElapsed()
}

function renderScripts() {
    const visibleScripts = scripts.filter(matchesCurrentFilters)
    const groups = visibleScripts.reduce((acc, script) => {
        if (!acc.has(script.group)) {
            acc.set(script.group, [])
        }

        acc.get(script.group).push(script)
        return acc
    }, new Map())

    renderOverview(visibleScripts)
    noResultsEl.hidden = visibleScripts.length > 0

    scriptListEl.replaceChildren(
        ...Array.from(groups.entries()).map(([group, groupScripts]) => {
            const section = document.createElement('section')
            section.className = 'script-section'

            const heading = document.createElement('div')
            heading.className = 'section-heading'

            const title = document.createElement('h2')
            title.textContent = group

            const count = document.createElement('span')
            count.className = 'section-count'
            count.textContent = String(groupScripts.length)

            const grid = document.createElement('div')
            grid.className = 'script-grid'

            heading.append(title, count)
            section.append(heading)

            for (const script of groupScripts) {
                grid.append(renderScript(script))
            }

            section.append(grid)

            return section
        }),
    )
}

function matchesCurrentFilters(script) {
    const normalizedQuery = searchQuery.trim().toLowerCase()
    const groupMatched = normalizedQuery || script.group === groupFilter
    const environmentMatched =
        !script.targetEnvironment ||
        script.targetEnvironment === environmentFilter
    const severityMatched =
        severityFilter === 'all' || script.severity === severityFilter

    if (!groupMatched || !environmentMatched || !severityMatched) {
        return false
    }

    if (!normalizedQuery) {
        return true
    }

    return [
        script.group,
        script.title,
        script.description,
        script.commandLabel,
        script.warning || '',
    ]
        .join(' ')
        .toLowerCase()
        .includes(normalizedQuery)
}

function renderOverview(visibleScripts) {
    visibleCountEl.textContent = String(visibleScripts.length)
    const normalizedQuery = searchQuery.trim().toLowerCase()

    for (const countEl of groupCountEls) {
        countEl.textContent = String(
            (normalizedQuery ? visibleScripts : scripts).filter((script) => {
                const environmentMatched =
                    !script.targetEnvironment ||
                    script.targetEnvironment === environmentFilter

                return (
                    script.group === countEl.dataset.groupCount &&
                    environmentMatched
                )
            }).length,
        )
    }
}

function syncGroupButtons() {
    const searching = Boolean(searchQuery.trim())

    for (const button of groupButtonEls) {
        const isActive = !searching && button.dataset.group === groupFilter
        button.classList.toggle('active', isActive)
        button.setAttribute('aria-pressed', String(isActive))
    }
}

function syncEnvironmentButtons() {
    document.body.dataset.environment = environmentFilter

    for (const button of environmentButtonEls) {
        const isActive = button.dataset.environment === environmentFilter
        button.classList.toggle('active', isActive)
        button.setAttribute('aria-pressed', String(isActive))
    }
}

function renderScript(script) {
    const item = document.createElement('article')
    item.className = 'script-item ' + script.severity

    const top = document.createElement('div')
    top.className = 'script-top'

    const identity = document.createElement('div')
    identity.className = 'script-identity'

    const icon = document.createElement('span')
    icon.className = 'script-icon'
    icon.setAttribute('aria-hidden', 'true')
    icon.textContent = getScriptIcon(script.id)

    const titleBlock = document.createElement('div')
    titleBlock.style.minWidth = '0'

    const title = document.createElement('div')
    title.className = 'script-title'
    title.textContent = script.title

    const badges = document.createElement('div')
    badges.className = 'script-badges'
    badges.append(createBadge(severityLabels[script.severity], script.severity))

    if (script.longRunning) {
        badges.append(createBadge('장기 실행', 'warning'))
    }

    if (script.terminalOnly) {
        badges.append(createBadge('터미널 전용', 'warning'))
    }

    if (script.confirmationText) {
        badges.append(createBadge('확인 필요', script.severity))
    }

    titleBlock.append(title, badges)
    identity.append(icon, titleBlock)

    const actionButtons = document.createElement('div')
    actionButtons.className = 'script-actions'

    if (script.scope) {
        const scopeButton = document.createElement('button')
        scopeButton.className = 'scope-button'
        scopeButton.type = 'button'
        scopeButton.textContent = '⚙'
        scopeButton.setAttribute('aria-label', script.title + ' 범위 설정')
        scopeButton.title = '범위 설정'
        scopeButton.addEventListener('click', () => openScopeDialog(script))
        actionButtons.append(scopeButton)
    }

    const runButton = document.createElement('button')
    const runningCount = getRunningCountForScript(script.id)
    const alreadyRunning = script.longRunning && runningCount > 0

    runButton.className = 'run-button ' + script.severity
    runButton.type = 'button'
    runButton.textContent = '▶'
    runButton.dataset.running = String(runningCount)
    runButton.disabled = script.terminalOnly || alreadyRunning
    runButton.setAttribute(
        'aria-label',
        script.terminalOnly
            ? script.title + ' 터미널 전용'
            : alreadyRunning
              ? script.title + ' 이미 실행 중'
              : script.title + ' 실행',
    )
    runButton.title = script.terminalOnly
        ? '명령어를 복사해서 터미널에서 실행해주세요.'
        : alreadyRunning
          ? '이미 실행 중'
          : '실행'
    runButton.addEventListener('click', () => requestRun(script))
    actionButtons.append(runButton)

    top.append(identity, actionButtons)

    const description = document.createElement('p')
    description.className = 'script-description'
    description.textContent = script.description

    const commandRow = document.createElement('div')
    commandRow.className = 'command-row'

    const command = document.createElement('code')
    command.className = 'command'
    command.textContent = script.commandLabel
    command.title = script.commandLabel

    const copyButton = document.createElement('button')
    copyButton.className = 'copy-button'
    copyButton.type = 'button'
    copyButton.textContent = '⧉'
    copyButton.setAttribute('aria-label', script.title + ' 명령어 복사')
    copyButton.title = '명령어 복사'
    copyButton.addEventListener('click', async () => {
        try {
            await navigator.clipboard.writeText(script.commandLabel)
            copyButton.textContent = '✓'
            copyButton.title = '복사됨'
            window.setTimeout(() => {
                copyButton.textContent = '⧉'
                copyButton.title = '명령어 복사'
            }, 1200)
        } catch (error) {
            appendUiMessage(
                '\n[ui] 명령어를 복사하지 못했습니다: ' + error.message + '\n',
            )
        }
    })

    commandRow.append(command, copyButton)

    item.append(top, description)

    if (script.warning) {
        const warning = document.createElement('div')
        warning.className = 'script-warning'
        warning.textContent = '주의: ' + script.warning
        item.append(warning)
    }

    item.append(commandRow)

    return item
}

function getScriptIcon(scriptId) {
    if (scriptId === 'lint') return 'L'
    if (scriptId === 'test') return 'T'
    if (scriptId === 'build') return 'B'
    if (scriptId.includes('swagger')) return 'API'
    if (scriptId.includes('backup')) return '↓'
    if (scriptId.includes('visualize')) return '◇'
    if (scriptId.includes('generate')) return '+'
    if (scriptId.includes('migrate')) return '↑'
    if (scriptId.includes('push')) return '↗'
    if (scriptId.includes('studio')) return '▣'
    return '›'
}

function createBadge(label, severity) {
    const badge = document.createElement('span')
    badge.className = 'badge ' + severity
    badge.textContent = label
    return badge
}

function getRunningCountForScript(scriptId) {
    return runs.filter(
        (run) => run.scriptId === scriptId && run.status === 'running',
    ).length
}

function getSelectedRun() {
    return runs.find((run) => run.runId === selectedRunId) || null
}

function getLatestRun() {
    return [...runs].sort((left, right) => right.sequence - left.sequence)[0]
}

function getRunningRuns() {
    return runs.filter((run) => run.status === 'running')
}

function renderTerminalTabs() {
    if (runs.length === 0) {
        const empty = document.createElement('div')
        empty.className = 'tab-empty'
        empty.textContent = '실행 탭 없음'
        terminalTabsEl.replaceChildren(empty)
        return
    }

    terminalTabsEl.replaceChildren(
        ...runs
            .slice()
            .sort((left, right) => left.sequence - right.sequence)
            .map(renderTerminalTab),
    )
}

function renderTerminalTab(run) {
    const tab = document.createElement('button')
    tab.className = [
        'terminal-tab',
        run.status,
        run.runId === selectedRunId ? 'active' : '',
    ]
        .filter(Boolean)
        .join(' ')
    tab.type = 'button'
    tab.setAttribute('role', 'tab')
    tab.setAttribute('aria-selected', String(run.runId === selectedRunId))
    tab.addEventListener('click', () => {
        selectedRunId = run.runId
        renderTerminalTabs()
        renderStatus()
        renderSelectedTerminal()
        updateElapsed()
    })

    const main = document.createElement('span')
    main.className = 'tab-main'

    const title = document.createElement('span')
    title.className = 'tab-title'
    title.textContent = '#' + run.sequence + ' ' + run.title

    const subtitle = document.createElement('span')
    subtitle.className = 'tab-subtitle'
    subtitle.textContent = run.status

    main.append(title, subtitle)
    tab.append(main)

    if (run.status !== 'running') {
        const close = document.createElement('span')
        close.className = 'tab-close'
        close.textContent = 'x'
        close.addEventListener('click', (event) => {
            event.stopPropagation()
            closeRun(run.runId)
        })
        tab.append(close)
    }

    return tab
}

function renderStatus() {
    const selectedRun = getSelectedRun()
    const runningRuns = getRunningRuns()

    statusPillEl.classList.toggle('running', runningRuns.length > 0)
    statusTextEl.textContent =
        runningRuns.length > 0 ? runningRuns.length + ' 실행 중' : '대기'
    stopButtonEl.disabled =
        !selectedRun || selectedRun.status !== 'running' || selectedRun.stopping
    stopAllButtonEl.disabled = runningRuns.length === 0
    clearButtonEl.disabled = !selectedRun
    openRunLinkEl.hidden =
        !selectedRun?.openUrl ||
        !selectedRun.openUrlReady ||
        selectedRun.status !== 'running'
    openRunLinkEl.href = selectedRun?.openUrl || '#'
    terminalStatusEl.textContent = selectedRun
        ? selectedRun.stopping
            ? 'stopping'
            : selectedRun.status
        : 'idle'
    terminalStatusEl.className =
        'terminal-chip' +
        (selectedRun && selectedRun.status === 'running' ? ' running' : '')

    if (selectedRun) {
        terminalTitleEl.textContent =
            '#' + selectedRun.sequence + ' ' + selectedRun.title
        terminalSubtitleEl.textContent = selectedRun.commandLabel
    } else {
        terminalTitleEl.textContent = 'Terminal'
        terminalSubtitleEl.textContent =
            '스크립트를 실행하면 새 터미널 탭이 생성됩니다.'
    }
}

function updateElapsed() {
    const selectedRun = getSelectedRun()

    if (!selectedRun) {
        runTimerEl.textContent = '00:00'
        return
    }

    const endTime = selectedRun.finishedAt
        ? new Date(selectedRun.finishedAt).getTime()
        : Date.now()
    const elapsedMs = Math.max(
        0,
        endTime - new Date(selectedRun.startedAt).getTime(),
    )
    const totalSeconds = Math.floor(elapsedMs / 1000)
    const minutes = Math.floor(totalSeconds / 60)
    const seconds = totalSeconds % 60

    runTimerEl.textContent =
        String(minutes).padStart(2, '0') +
        ':' +
        String(seconds).padStart(2, '0')
}

async function openScopeDialog(script) {
    pendingScopeScript = script
    currentScopeDirectory = ''
    selectedScopePath = null
    scopeTitleEl.textContent = script.title + ' 범위 실행'
    changedScopeButtonEl.disabled = true
    changedScopeMetaEl.textContent = '확인 중'
    scopeBrowserListEl.replaceChildren(createScopeEmpty('경로 확인 중'))
    scopeBreadcrumbsEl.replaceChildren()
    updateScopeSelection()
    scopeDialogEl.showModal()

    try {
        scopeOptions = await fetchJson('/api/scopes')
        const changedFiles = getChangedScopeFiles()

        changedScopeButtonEl.disabled = changedFiles.length === 0
        changedScopeMetaEl.textContent =
            changedFiles.length > 0
                ? `${changedFiles.length}개 파일`
                : '변경된 대상 파일 없음'
        renderScopeBrowser()
    } catch (error) {
        changedScopeMetaEl.textContent = '변경 파일 확인 실패'
        scopeBrowserListEl.replaceChildren(
            createScopeEmpty('범위 목록을 불러오지 못했습니다.'),
        )
        appendUiMessage('\n[ui] ' + error.message + '\n')
    }
}

function renderScopeBrowser() {
    const files = getScopeFiles()
    const entries = getScopeEntries(files, currentScopeDirectory)

    renderScopeBreadcrumbs()

    if (entries.length === 0) {
        scopeBrowserListEl.replaceChildren(
            createScopeEmpty('선택할 범위가 없습니다.'),
        )
        return
    }

    scopeBrowserListEl.replaceChildren(...entries.map(renderScopeEntry))
}

function renderScopeBreadcrumbs() {
    const segments = currentScopeDirectory
        ? currentScopeDirectory.split('/')
        : []
    const crumbs = [createScopeCrumb('전체', '', segments.length === 0)]

    segments.forEach((segment, index) => {
        const separator = document.createElement('span')
        separator.className = 'scope-crumb-separator'
        separator.textContent = '>'

        const path = segments.slice(0, index + 1).join('/')
        crumbs.push(
            separator,
            createScopeCrumb(segment, path, index === segments.length - 1),
        )
    })

    scopeBreadcrumbsEl.replaceChildren(...crumbs)
}

function createScopeCrumb(label, path, current) {
    const button = document.createElement('button')
    button.className = 'scope-crumb' + (current ? ' current' : '')
    button.type = 'button'
    button.textContent = label
    button.addEventListener('click', () => {
        currentScopeDirectory = path
        renderScopeBrowser()
    })
    return button
}

function renderScopeEntry(entry) {
    const row = document.createElement('div')
    row.className =
        'scope-entry ' +
        (entry.directory ? 'directory' : 'file') +
        (selectedScopePath === entry.path ? ' selected' : '')

    const selectButton = document.createElement('button')
    selectButton.className = 'scope-entry-select'
    selectButton.type = 'button'
    selectButton.setAttribute('aria-label', `${entry.path} 범위 선택`)

    const icon = document.createElement('span')
    icon.textContent = entry.directory ? '▣' : 'TS'
    icon.setAttribute('aria-hidden', 'true')

    const name = document.createElement('strong')
    name.textContent = formatScopeName(entry.name)

    const count = document.createElement('small')
    count.textContent = `${entry.count}개`

    selectButton.append(icon, name, count)
    selectButton.addEventListener('click', () => {
        selectedScopePath = entry.path
        updateScopeSelection()
        renderScopeBrowser()
    })
    row.append(selectButton)

    if (entry.directory) {
        const openButton = document.createElement('button')
        openButton.className = 'scope-entry-open'
        openButton.type = 'button'
        openButton.textContent = '›'
        openButton.setAttribute('aria-label', `${entry.path} 폴더 열기`)
        openButton.addEventListener('click', () => {
            currentScopeDirectory = entry.path
            renderScopeBrowser()
        })
        row.append(openButton)
    }

    return row
}

function getScopeEntries(files, directory) {
    const prefix = directory ? `${directory}/` : ''
    const entries = new Map()

    for (const file of files) {
        if (!file.startsWith(prefix)) {
            continue
        }

        const rest = file.slice(prefix.length)
        const [name, ...remainingSegments] = rest.split('/')
        const path = prefix + name
        const directoryEntry = remainingSegments.length > 0
        const existing = entries.get(path)

        if (existing) {
            existing.count += 1
            continue
        }

        entries.set(path, {
            path,
            name,
            directory: directoryEntry,
            count: 1,
        })
    }

    return [...entries.values()].sort((left, right) => {
        if (left.directory !== right.directory) {
            return left.directory ? -1 : 1
        }

        return left.name.localeCompare(right.name)
    })
}

function updateScopeSelection() {
    const selectedFiles = selectedScopePath
        ? getScopeFiles().filter(
              (file) =>
                  file === selectedScopePath ||
                  file.startsWith(`${selectedScopePath}/`),
          )
        : []

    scopeSelectionEl.hidden = !selectedScopePath
    scopeSelectionPathEl.textContent = selectedScopePath || ''
    scopeSelectionCountEl.textContent = `${selectedFiles.length}개 파일`
    runScopeButtonEl.disabled = !selectedScopePath || selectedFiles.length === 0
    scopeCommandPreviewEl.textContent = createScopeCommandPreview(selectedFiles)
}

function createScopeCommandPreview(selectedFiles) {
    if (!pendingScopeScript || !selectedScopePath) {
        return '범위를 선택하면 실행 명령이 표시됩니다.'
    }

    if (pendingScopeScript.scope === 'lint') {
        return `bunx eslint ${formatPreviewArgument(selectedScopePath)}`
    }

    return [
        'bun',
        'run',
        'test',
        '--',
        '--runTestsByPath',
        ...selectedFiles.map(formatPreviewArgument),
    ].join(' ')
}

function getScopeFiles() {
    if (!pendingScopeScript) {
        return []
    }

    return pendingScopeScript.scope === 'lint'
        ? scopeOptions.lintFiles
        : scopeOptions.testFiles
}

function getChangedScopeFiles() {
    if (!pendingScopeScript) {
        return []
    }

    return pendingScopeScript.scope === 'lint'
        ? scopeOptions.changedLintFiles
        : scopeOptions.changedTestFiles
}

function createScopeEmpty(message) {
    const empty = document.createElement('div')
    empty.className = 'scope-empty'
    empty.textContent = message
    return empty
}

function formatScopeName(value) {
    return value
        .replace(/\.spec\.ts$/, '')
        .replace(/\.ts$/, '')
        .split('-')
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(' ')
}

function formatPreviewArgument(value) {
    return /^[a-zA-Z0-9_./:@=<>*-]+$/.test(value)
        ? value
        : JSON.stringify(value)
}

function requestRun(script) {
    if (script.terminalOnly) {
        return
    }

    if (script.confirmationText) {
        pendingScript = script
        confirmDialogEl.dataset.severity = script.severity
        dialogTitleEl.textContent = script.title
        dialogDescriptionEl.textContent = script.description
        dialogWarningEl.textContent =
            script.warning || '실행 전 영향을 확인해주세요.'
        dialogCommandEl.textContent = script.commandLabel
        requiredPhraseEl.textContent = script.confirmationText
        confirmInputEl.value = ''
        confirmInputEl.placeholder = script.confirmationText
        confirmRunButtonEl.disabled = true
        confirmDialogEl.showModal()
        confirmInputEl.focus()
        return
    }

    runScript(script)
}

async function runScript(script, options = {}) {
    try {
        const state = await fetchJson('/api/run', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                id: script.id,
                confirmationText: options.confirmationText,
                scope: options.scope,
            }),
        })
        applyState(state, { preferLatest: true })
    } catch (error) {
        appendUiMessage('\n[ui] ' + error.message + '\n')
    }
}

function appendRunLog(runId, chunk) {
    const run = runs.find((candidate) => candidate.runId === runId)

    if (!run) {
        return
    }

    run.terminalLog += chunk

    if (!selectedRunId) {
        selectedRunId = runId
        renderTerminalTabs()
        renderStatus()
    }

    if (selectedRunId === runId) {
        appendTerminal(chunk)
    }
}

function appendTerminal(chunk) {
    if (terminalEl.classList.contains('empty')) {
        terminalEl.textContent = ''
        terminalEl.classList.remove('empty')
    }

    const shouldScroll =
        terminalEl.scrollTop + terminalEl.clientHeight >=
        terminalEl.scrollHeight - 24

    terminalEl.textContent += chunk

    if (shouldScroll) {
        terminalEl.scrollTop = terminalEl.scrollHeight
    }
}

function appendUiMessage(message) {
    if (!selectedRunId) {
        setTerminalText(message)
        return
    }

    appendTerminal(message)
}

function renderSelectedTerminal() {
    const selectedRun = getSelectedRun()

    if (selectedRun) {
        setTerminalText(selectedRun.terminalLog)
    } else {
        setTerminalText('')
    }
}

function setTerminalText(text) {
    if (text) {
        terminalEl.textContent = text
        terminalEl.classList.remove('empty')
    } else {
        terminalEl.textContent =
            '왼쪽에서 스크립트를 실행하면 출력이 여기에 표시됩니다.'
        terminalEl.classList.add('empty')
    }
}

searchInputEl.addEventListener('input', () => {
    searchQuery = searchInputEl.value
    syncGroupButtons()
    renderScripts()
})

for (const button of groupButtonEls) {
    button.addEventListener('click', () => {
        searchQuery = ''
        searchInputEl.value = ''
        groupFilter = button.dataset.group || '검증'
        window.localStorage.setItem('script-ui-group', groupFilter)
        syncGroupButtons()
        renderScripts()
    })
}

for (const button of environmentButtonEls) {
    button.addEventListener('click', () => {
        environmentFilter = button.dataset.environment || 'development'
        window.localStorage.setItem('script-ui-environment', environmentFilter)
        syncEnvironmentButtons()
        renderScripts()
    })
}

for (const button of filterButtonEls) {
    button.addEventListener('click', () => {
        severityFilter = button.dataset.filter || 'all'

        for (const filterButton of filterButtonEls) {
            const isActive = filterButton === button
            filterButton.classList.toggle('active', isActive)
            filterButton.setAttribute('aria-selected', String(isActive))
        }

        renderScripts()
    })
}

confirmInputEl.addEventListener('input', () => {
    confirmRunButtonEl.disabled =
        confirmInputEl.value !== pendingScript?.confirmationText
})

confirmDialogEl.addEventListener('submit', (event) => {
    event.preventDefault()

    if (!pendingScript) {
        return
    }

    const script = pendingScript
    const confirmationText = confirmInputEl.value

    pendingScript = null
    confirmDialogEl.close()
    runScript(script, { confirmationText })
})

cancelDialogButtonEl.addEventListener('click', () => {
    pendingScript = null
    confirmDialogEl.close()
})

changedScopeButtonEl.addEventListener('click', () => {
    if (!pendingScopeScript || changedScopeButtonEl.disabled) {
        return
    }

    const script = pendingScopeScript

    pendingScopeScript = null
    scopeDialogEl.close()
    runScript(script, {
        scope: {
            mode: 'changed',
        },
    })
})

scopeFormEl.addEventListener('submit', (event) => {
    event.preventDefault()

    if (
        !pendingScopeScript ||
        !selectedScopePath ||
        runScopeButtonEl.disabled
    ) {
        return
    }

    const script = pendingScopeScript
    const scope = {
        mode: 'path',
        path: selectedScopePath,
    }

    pendingScopeScript = null
    scopeDialogEl.close()
    runScript(script, { scope })
})

cancelScopeButtonEl.addEventListener('click', () => {
    pendingScopeScript = null
    scopeDialogEl.close()
})

scopeDialogEl.addEventListener('close', () => {
    pendingScopeScript = null
})

async function closeRun(runId) {
    try {
        const state = await fetchJson('/api/close-run', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                runId,
            }),
        })
        applyState(state)
    } catch (error) {
        appendUiMessage('\n[ui] ' + error.message + '\n')
    }
}

stopButtonEl.addEventListener('click', async () => {
    const selectedRun = getSelectedRun()

    if (!selectedRun) {
        return
    }

    try {
        const state = await fetchJson('/api/stop', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                runId: selectedRun.runId,
            }),
        })
        applyState(state)
    } catch (error) {
        appendUiMessage('\n[ui] ' + error.message + '\n')
    }
})

stopAllButtonEl.addEventListener('click', async () => {
    try {
        const state = await fetchJson('/api/stop-all', {
            method: 'POST',
        })
        applyState(state)
    } catch (error) {
        appendUiMessage('\n[ui] ' + error.message + '\n')
    }
})

clearButtonEl.addEventListener('click', async () => {
    const selectedRun = getSelectedRun()

    if (!selectedRun) {
        setTerminalText('')
        return
    }

    try {
        const state = await fetchJson('/api/clear-run', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                runId: selectedRun.runId,
            }),
        })
        applyState(state)
    } catch (error) {
        appendUiMessage('\n[ui] ' + error.message + '\n')
    }
})

boot().catch((error) => {
    appendUiMessage('\n[ui] ' + error.message + '\n')
})
