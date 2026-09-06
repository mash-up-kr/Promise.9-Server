import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { readdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { AWS_ACCOUNT_ID } from '../../infra/lib/constants'

// Usage: bun run assets:publish --source email/assets/reminder --prefix email/reminder [--apply]
const args = process.argv.slice(2)
const options: Record<string, string> = {}
let apply = false
for (let i = 0; i < args.length; i++) {
    if (args[i] === '--apply') {
        apply = true
        continue
    }
    if (
        !['--source', '--prefix', '--profile'].includes(args[i]) ||
        !args[i + 1] ||
        args[i + 1].startsWith('--')
    )
        throw new Error(`알 수 없는 옵션: ${args[i]}`)
    options[args[i].slice(2)] = args[++i]
}
const source = resolve(options.source ?? 'email/assets/reminder')
const prefix = options.prefix ?? 'email/reminder'
if (
    !/^[a-z0-9][a-z0-9/-]*$/.test(prefix) ||
    prefix.endsWith('/') ||
    prefix.includes('//')
)
    throw new Error(
        'prefix는 소문자·숫자·하이픈·경로 구분자만 사용할 수 있습니다.',
    )
const profile = options.profile ?? 'promise9'
const types: Record<string, string> = {
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.avif': 'image/avif',
}
// SVG 원본은 레포에 보관하고 이메일용 래스터 이미지만 배포한다.
const files = readdirSync(source, { withFileTypes: true })
    .filter(
        (entry) =>
            entry.isFile() &&
            Object.keys(types).some((ext) => entry.name.endsWith(ext)),
    )
    .map((entry) => {
        if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(entry.name))
            throw new Error(`지원하지 않는 파일명: ${entry.name}`)
        const bytes = readFileSync(resolve(source, entry.name))
        if (!bytes.length) throw new Error(`빈 이미지: ${entry.name}`)
        return {
            name: entry.name,
            hash: createHash('sha256').update(bytes).digest('hex'),
            size: bytes.length,
        }
    })
    .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
if (!files.length) throw new Error('배포할 이미지가 없습니다.')
const version = createHash('sha256')
    .update(JSON.stringify(files))
    .digest('hex')
    .slice(0, 32)
const path = `${prefix}/${version}`
console.log(
    JSON.stringify(
        {
            source,
            path,
            fileCount: files.length,
            totalBytes: files.reduce((sum, f) => sum + f.size, 0),
            apply,
        },
        null,
        2,
    ),
)
if (apply) {
    const identity = aws<{ Account: string }>(['sts', 'get-caller-identity'])
    if (identity.Account !== AWS_ACCOUNT_ID)
        throw new Error('Promise9 AWS 계정이 아닙니다.')
    const result = aws<{
        Stacks: Array<{
            Outputs: Array<{ OutputKey: string; OutputValue: string }>
        }>
    }>([
        'cloudformation',
        'describe-stacks',
        '--stack-name',
        'Promise9AssetsStack',
    ])
    const outputs = Object.fromEntries(
        result.Stacks[0].Outputs.map(
            (output: { OutputKey: string; OutputValue: string }) => [
                output.OutputKey,
                output.OutputValue,
            ],
        ),
    )
    if (!outputs.AssetsBucketName || !outputs.AssetsBaseUrl)
        throw new Error('에셋 스택 output이 없습니다.')
    for (const file of files) {
        // 동일 key가 이미 있으면 HEAD의 해시로 확인하며 덮어쓰지 않는다.
        const key = `${path}/${file.name}`
        const head = run([
            's3api',
            'head-object',
            '--bucket',
            outputs.AssetsBucketName,
            '--key',
            key,
        ])
        if (head.status === 0) {
            const metadata = JSON.parse(head.stdout) as {
                Metadata?: { sha256?: string }
            }
            if (metadata.Metadata?.sha256 !== file.hash)
                throw new Error(`기존 파일과 해시가 다릅니다: ${key}`)
            console.log(`유지: ${file.name}`)
            continue
        }
        if (!head.stderr.includes('(404)')) throw new Error(head.stderr)
        const extension = file.name.slice(file.name.lastIndexOf('.'))
        aws([
            's3api',
            'put-object',
            '--bucket',
            outputs.AssetsBucketName,
            '--key',
            key,
            '--body',
            resolve(source, file.name),
            '--content-type',
            types[extension],
            '--cache-control',
            'public,max-age=31536000,immutable',
            '--metadata',
            `sha256=${file.hash}`,
            '--checksum-sha256',
            Buffer.from(file.hash, 'hex').toString('base64'),
            '--if-none-match',
            '*',
        ])
        console.log(`업로드: ${file.name}`)
    }
    console.log(`ASSET_BASE_URL=${outputs.AssetsBaseUrl}/${path}`)
    if (prefix === 'email/reminder')
        console.log(`EMAIL_ASSET_BASE_URL=${outputs.AssetsBaseUrl}/${path}`)
}

function run(parameters: string[]) {
    return spawnSync(
        'aws',
        [
            ...parameters,
            '--profile',
            profile,
            '--region',
            'ap-northeast-2',
            '--output',
            'json',
            '--no-cli-pager',
        ],
        { encoding: 'utf8' },
    )
}
function aws<T = unknown>(parameters: string[]): T {
    const result = run(parameters)
    if (result.error) throw result.error
    if (result.status !== 0) throw new Error(result.stderr)
    return (result.stdout.trim() ? JSON.parse(result.stdout) : {}) as T
}
