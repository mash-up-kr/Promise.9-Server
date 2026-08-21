#!/usr/bin/env bun
import { spawn } from 'node:child_process'
import { chmod, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import {
    printError,
    printKeyValue,
    printSuccess,
    printTitle,
} from './script-log'

type HostKey = {
    algorithm: string
    publicKey: string
}

type InstanceAccessDetails = {
    ipAddress: string
    username: string
    privateKey: string
    certKey: string
    hostKeys: HostKey[]
}

const DEFAULT_AWS_PROFILE = 'promise9'
const DEFAULT_AWS_REGION = 'ap-northeast-2'
const DEFAULT_INSTANCE_NAME = 'Ubuntu-1'
const DEFAULT_LOCAL_PORT = 15432
const REMOTE_DB_HOST = '127.0.0.1'
const REMOTE_DB_PORT = 5432

async function main() {
    const config = resolveConfig()
    let tempDirectory: string | undefined

    printTitle('🔐 Lightsail PostgreSQL SSH 터널')
    printKeyValue('AWS profile', config.awsProfile)
    printKeyValue('AWS region', config.awsRegion)
    printKeyValue('Lightsail instance', config.instanceName)
    printKeyValue(
        '포트 전달',
        `127.0.0.1:${config.localPort} -> ${REMOTE_DB_HOST}:${REMOTE_DB_PORT}`,
    )

    try {
        const accessDetails = await getInstanceAccessDetails(config)
        tempDirectory = await mkdtemp(join(tmpdir(), 'promise9-lightsail-ssh-'))
        await chmod(tempDirectory, 0o700)

        const privateKeyPath = join(tempDirectory, 'tempkey')
        const certificatePath = join(tempDirectory, 'tempkey-cert.pub')
        const knownHostsPath = join(tempDirectory, 'known_hosts')

        await Promise.all([
            writeFile(
                privateKeyPath,
                ensureTrailingNewline(accessDetails.privateKey),
                {
                    mode: 0o600,
                },
            ),
            writeFile(
                certificatePath,
                ensureTrailingNewline(accessDetails.certKey),
                { mode: 0o600 },
            ),
            writeFile(
                knownHostsPath,
                createKnownHosts(
                    accessDetails.ipAddress,
                    accessDetails.hostKeys,
                ),
                { mode: 0o600 },
            ),
        ])

        console.log('\n터널이 열렸습니다. 종료하려면 Ctrl+C를 누르세요.')

        await runSshTunnel({
            accessDetails,
            certificatePath,
            knownHostsPath,
            localPort: config.localPort,
            privateKeyPath,
        })

        printSuccess('SSH 터널을 종료했습니다.')
    } finally {
        if (tempDirectory) {
            await rm(tempDirectory, { force: true, recursive: true })
        }
    }
}

function resolveConfig() {
    return {
        awsProfile: process.env.AWS_PROFILE ?? DEFAULT_AWS_PROFILE,
        awsRegion: process.env.AWS_REGION ?? DEFAULT_AWS_REGION,
        instanceName:
            process.env.LIGHTSAIL_INSTANCE_NAME ?? DEFAULT_INSTANCE_NAME,
        localPort: parsePort(
            process.env.LIGHTSAIL_DB_LOCAL_PORT,
            DEFAULT_LOCAL_PORT,
        ),
    }
}

function parsePort(value: string | undefined, defaultValue: number) {
    if (value === undefined) {
        return defaultValue
    }

    const port = Number(value)

    if (!Number.isInteger(port) || port < 1 || port > 65535) {
        throw new Error(
            `LIGHTSAIL_DB_LOCAL_PORT는 1~65535 사이의 정수여야 합니다. 입력값: ${value}`,
        )
    }

    return port
}

async function getInstanceAccessDetails(config: {
    awsProfile: string
    awsRegion: string
    instanceName: string
}) {
    const { stdout } = await runCapturedCommand(
        'aws',
        [
            'lightsail',
            'get-instance-access-details',
            '--instance-name',
            config.instanceName,
            '--protocol',
            'ssh',
            '--profile',
            config.awsProfile,
            '--region',
            config.awsRegion,
            '--output',
            'json',
        ],
        'Lightsail 임시 SSH 접속 정보 조회',
    )

    let response: unknown

    try {
        response = JSON.parse(stdout)
    } catch {
        throw new Error(
            'AWS CLI가 반환한 Lightsail 접속 정보를 해석할 수 없습니다.',
        )
    }

    return parseInstanceAccessDetails(response)
}

function parseInstanceAccessDetails(response: unknown): InstanceAccessDetails {
    if (!isRecord(response) || !isRecord(response.accessDetails)) {
        throw new Error('Lightsail 접속 정보에 accessDetails가 없습니다.')
    }

    const details = response.accessDetails
    const hostKeys = Array.isArray(details.hostKeys)
        ? details.hostKeys.map(parseHostKey)
        : []

    if (hostKeys.length === 0) {
        throw new Error('Lightsail 접속 정보에 SSH host key가 없습니다.')
    }

    return {
        ipAddress: readRequiredString(details, 'ipAddress'),
        username: readRequiredString(details, 'username'),
        privateKey: readRequiredString(details, 'privateKey'),
        certKey: readRequiredString(details, 'certKey'),
        hostKeys,
    }
}

function parseHostKey(value: unknown): HostKey {
    if (!isRecord(value)) {
        throw new Error('Lightsail SSH host key 형식이 올바르지 않습니다.')
    }

    return {
        algorithm: readRequiredString(value, 'algorithm'),
        publicKey: readRequiredString(value, 'publicKey'),
    }
}

function createKnownHosts(ipAddress: string, hostKeys: HostKey[]) {
    return ensureTrailingNewline(
        hostKeys
            .map(({ algorithm, publicKey }) => {
                const normalizedPublicKey = publicKey.startsWith(
                    `${algorithm} `,
                )
                    ? publicKey
                    : `${algorithm} ${publicKey}`

                return `${ipAddress} ${normalizedPublicKey}`
            })
            .join('\n'),
    )
}

async function runSshTunnel({
    accessDetails,
    certificatePath,
    knownHostsPath,
    localPort,
    privateKeyPath,
}: {
    accessDetails: InstanceAccessDetails
    certificatePath: string
    knownHostsPath: string
    localPort: number
    privateKeyPath: string
}) {
    const child = spawn(
        'ssh',
        [
            '-N',
            '-T',
            '-i',
            privateKeyPath,
            '-o',
            `CertificateFile=${certificatePath}`,
            '-o',
            'IdentitiesOnly=yes',
            '-o',
            `UserKnownHostsFile=${knownHostsPath}`,
            '-o',
            'GlobalKnownHostsFile=/dev/null',
            '-o',
            'StrictHostKeyChecking=yes',
            '-o',
            'ExitOnForwardFailure=yes',
            '-o',
            'ServerAliveInterval=30',
            '-o',
            'ServerAliveCountMax=3',
            '-L',
            `${localPort}:${REMOTE_DB_HOST}:${REMOTE_DB_PORT}`,
            `${accessDetails.username}@${accessDetails.ipAddress}`,
        ],
        { stdio: 'inherit' },
    )
    let requestedSignal: NodeJS.Signals | undefined

    const forwardSignal = (signal: NodeJS.Signals) => {
        requestedSignal = signal
        child.kill(signal)
    }
    const handleSigint = () => forwardSignal('SIGINT')
    const handleSigterm = () => forwardSignal('SIGTERM')

    process.once('SIGINT', handleSigint)
    process.once('SIGTERM', handleSigterm)

    try {
        await new Promise<void>((resolve, reject) => {
            child.once('error', (error) => {
                reject(
                    new Error(
                        `ssh 실행에 실패했습니다. OpenSSH client 설치 여부를 확인해주세요: ${error.message}`,
                    ),
                )
            })

            child.once('close', (code, signal) => {
                if (code === 0 || requestedSignal || signal === 'SIGINT') {
                    resolve()
                    return
                }

                reject(
                    new Error(
                        `SSH 터널이 비정상 종료되었습니다. 종료 코드: ${code ?? '없음'}, signal: ${signal ?? '없음'}`,
                    ),
                )
            })
        })
    } finally {
        process.off('SIGINT', handleSigint)
        process.off('SIGTERM', handleSigterm)
    }
}

async function runCapturedCommand(
    command: string,
    args: string[],
    errorLabel: string,
) {
    const child = spawn(command, args, {
        stdio: ['ignore', 'pipe', 'pipe'],
    })
    let stdout = ''
    let stderr = ''

    child.stdout.on('data', (chunk: Buffer) => {
        stdout += chunk.toString('utf8')
    })
    child.stderr.on('data', (chunk: Buffer) => {
        stderr += chunk.toString('utf8')
    })

    await new Promise<void>((resolve, reject) => {
        child.once('error', (error) => {
            reject(
                new Error(
                    `${errorLabel}에 실패했습니다. AWS CLI 설치 여부를 확인해주세요: ${error.message}`,
                ),
            )
        })

        child.once('close', (code) => {
            if (code === 0) {
                resolve()
                return
            }

            const detail = stderr.trim() ? `\n${stderr.trim()}` : ''
            reject(
                new Error(
                    `${errorLabel}에 실패했습니다. 종료 코드: ${code}${detail}`,
                ),
            )
        })
    })

    return { stdout }
}

function readRequiredString(record: Record<string, unknown>, key: string) {
    const value = record[key]

    if (typeof value !== 'string' || value.trim() === '') {
        throw new Error(`Lightsail 접속 정보에 ${key} 값이 없습니다.`)
    }

    return value
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null
}

function ensureTrailingNewline(value: string) {
    return value.endsWith('\n') ? value : `${value}\n`
}

main().catch((error: unknown) => {
    printError(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
})
