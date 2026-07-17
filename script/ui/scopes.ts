import { spawnSync } from 'node:child_process'
import { existsSync, readdirSync, realpathSync, statSync } from 'node:fs'
import { relative, resolve, sep } from 'node:path'

import type { ScriptAction } from './actions'

type ScopeRequest =
    | {
          mode: 'changed'
      }
    | {
          mode: 'path'
          path: string
      }

export type ScopeOptions = {
    lintFiles: string[]
    testFiles: string[]
    changedLintFiles: string[]
    changedTestFiles: string[]
}

const LINT_ROOTS = ['src', 'test', 'apps', 'libs']
const MAX_PATH_LENGTH = 500

export function getScopeOptions(rootDirectory: string): ScopeOptions {
    const lintFiles = LINT_ROOTS.flatMap((root) =>
        collectTypeScriptFiles(rootDirectory, root),
    )

    if (existsSync(resolve(rootDirectory, 'drizzle.config.ts'))) {
        lintFiles.push('drizzle.config.ts')
    }

    const sortedLintFiles = [...new Set(lintFiles)].sort()
    const changedFiles = getChangedFiles(rootDirectory)

    return {
        lintFiles: sortedLintFiles,
        testFiles: sortedLintFiles.filter(
            (path) => path.startsWith('src/') && path.endsWith('.spec.ts'),
        ),
        changedLintFiles: changedFiles.filter(isLintFile),
        changedTestFiles: changedFiles.filter(
            (path) => path.startsWith('src/') && path.endsWith('.ts'),
        ),
    }
}

export function createScopedScript(
    script: ScriptAction,
    value: unknown,
    rootDirectory: string,
) {
    if (value === undefined) {
        return script
    }

    if (!script.scope) {
        throw new Error('이 작업은 범위 실행을 지원하지 않습니다.')
    }

    const scope = parseScopeRequest(value)

    if (script.scope === 'lint') {
        return createScopedLintScript(script, scope, rootDirectory)
    }

    return createScopedTestScript(script, scope, rootDirectory)
}

function createScopedLintScript(
    script: ScriptAction,
    scope: ScopeRequest,
    rootDirectory: string,
): ScriptAction {
    const paths =
        scope.mode === 'changed'
            ? getScopeOptions(rootDirectory).changedLintFiles
            : [validateLintPath(scope.path, rootDirectory)]

    if (paths.length === 0) {
        throw new Error('변경된 TypeScript 파일이 없습니다.')
    }

    const label =
        scope.mode === 'changed' ? `변경분 ${paths.length}개` : paths[0]
    const commandParts = ['bunx', 'eslint', ...paths.map(formatCommandArgument)]

    return {
        ...script,
        title: `${script.title} · ${label}`,
        command: 'bunx',
        args: ['eslint', ...paths],
        commandLabel: commandParts.join(' '),
    }
}

function createScopedTestScript(
    script: ScriptAction,
    scope: ScopeRequest,
    rootDirectory: string,
): ScriptAction {
    if (scope.mode === 'changed') {
        const changedFiles = getScopeOptions(rootDirectory).changedTestFiles

        if (changedFiles.length === 0) {
            throw new Error('변경된 테스트 대상 TypeScript 파일이 없습니다.')
        }

        const args = [
            'run',
            'test',
            '--',
            '--findRelatedTests',
            ...changedFiles,
            '--passWithNoTests',
        ]
        const commandParts = [
            'bun',
            'run',
            'test',
            '--',
            '--findRelatedTests',
            ...changedFiles.map(formatCommandArgument),
            '--passWithNoTests',
        ]

        return {
            ...script,
            title: `${script.title} · 변경분 ${changedFiles.length}개`,
            args,
            commandLabel: commandParts.join(' '),
        }
    }

    const path = validateTestPath(scope.path, rootDirectory)
    const testFiles = getScopeOptions(rootDirectory).testFiles.filter(
        (file) => file === path || file.startsWith(`${path}/`),
    )

    if (testFiles.length === 0) {
        throw new Error('선택한 경로 아래에 테스트 파일이 없습니다.')
    }

    const args = ['run', 'test', '--', '--runTestsByPath', ...testFiles]
    const commandParts = [
        'bun',
        'run',
        'test',
        '--',
        '--runTestsByPath',
        ...testFiles.map(formatCommandArgument),
    ]

    return {
        ...script,
        title: `${script.title} · ${path} (${testFiles.length}개)`,
        args,
        commandLabel: commandParts.join(' '),
    }
}

function parseScopeRequest(value: unknown): ScopeRequest {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        throw new Error('범위 실행 값이 올바르지 않습니다.')
    }

    const mode = readRequiredString(value, 'mode')

    if (mode === 'changed') {
        return {
            mode,
        }
    }

    if (mode === 'path') {
        return {
            mode,
            path: readRequiredString(value, 'path'),
        }
    }

    throw new Error('지원하지 않는 범위 실행 방식입니다.')
}

function readRequiredString(value: object, key: string) {
    const property = (value as Record<string, unknown>)[key]

    if (typeof property !== 'string' || !property.trim()) {
        throw new Error(`${key} 값이 필요합니다.`)
    }

    return property.trim()
}

function validateLintPath(value: string, rootDirectory: string) {
    const path = validateRepositoryPath(value, rootDirectory)
    const stats = statSync(resolve(rootDirectory, path))
    const inLintRoot = LINT_ROOTS.some(
        (root) => path === root || path.startsWith(`${root}/`),
    )
    const isConfig = path === 'drizzle.config.ts'

    if (!inLintRoot && !isConfig) {
        throw new Error(
            'Lint 범위는 src, test, apps, libs 내부만 지정할 수 있습니다.',
        )
    }

    if (!stats.isDirectory() && !(stats.isFile() && path.endsWith('.ts'))) {
        throw new Error(
            'Lint 범위는 디렉터리 또는 TypeScript 파일이어야 합니다.',
        )
    }

    return path
}

function validateTestPath(value: string, rootDirectory: string) {
    const path = validateRepositoryPath(value, rootDirectory)
    const stats = statSync(resolve(rootDirectory, path))
    const validFile =
        stats.isFile() && path.startsWith('src/') && path.endsWith('.spec.ts')
    const validDirectory =
        stats.isDirectory() && (path === 'src' || path.startsWith('src/'))

    if (!validFile && !validDirectory) {
        throw new Error(
            '테스트 범위는 src 내부 폴더 또는 *.spec.ts 파일이어야 합니다.',
        )
    }

    return path
}

function validateRepositoryPath(value: string, rootDirectory: string) {
    if (value.length > MAX_PATH_LENGTH || value.includes('\0')) {
        throw new Error('범위 경로가 올바르지 않습니다.')
    }

    const root = realpathSync(rootDirectory)
    const requested = resolve(root, value)

    if (!existsSync(requested)) {
        throw new Error('지정한 경로를 찾을 수 없습니다.')
    }

    const realRequested = realpathSync(requested)

    if (realRequested !== root && !realRequested.startsWith(`${root}${sep}`)) {
        throw new Error('저장소 외부 경로는 지정할 수 없습니다.')
    }

    return relative(root, realRequested).split(sep).join('/')
}

function getChangedFiles(rootDirectory: string) {
    const commands = [
        ['diff', '--name-only', '-z', '--diff-filter=ACMR', '--'],
        ['diff', '--cached', '--name-only', '-z', '--diff-filter=ACMR', '--'],
        ['ls-files', '--others', '--exclude-standard', '-z'],
    ]
    const paths = commands.flatMap((args) => {
        const result = spawnSync('git', args, {
            cwd: rootDirectory,
            encoding: 'utf8',
        })

        if (result.status !== 0) {
            throw new Error(
                result.stderr.trim() || 'Git 변경 파일을 확인하지 못했습니다.',
            )
        }

        return result.stdout.split('\0').filter(Boolean)
    })

    return [...new Set(paths)].sort()
}

function isLintFile(path: string) {
    const inLintRoot = LINT_ROOTS.some((root) => path.startsWith(`${root}/`))

    return (inLintRoot && path.endsWith('.ts')) || path === 'drizzle.config.ts'
}

function collectTypeScriptFiles(rootDirectory: string, relativeRoot: string) {
    const absoluteRoot = resolve(rootDirectory, relativeRoot)

    if (!existsSync(absoluteRoot) || !statSync(absoluteRoot).isDirectory()) {
        return []
    }

    const files: string[] = []

    for (const entry of readdirSync(absoluteRoot, { withFileTypes: true })) {
        const relativePath = `${relativeRoot}/${entry.name}`

        if (entry.isDirectory()) {
            files.push(...collectTypeScriptFiles(rootDirectory, relativePath))
            continue
        }

        if (entry.isFile() && entry.name.endsWith('.ts')) {
            files.push(relativePath)
        }
    }

    return files
}

function formatCommandArgument(value: string) {
    return /^[a-zA-Z0-9_./:@=-]+$/.test(value) ? value : JSON.stringify(value)
}
