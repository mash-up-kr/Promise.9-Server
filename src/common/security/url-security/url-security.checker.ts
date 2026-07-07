import { isIP } from 'node:net'

export function isBlockedHostname(hostname: string): boolean {
    return (
        hostname.length === 0 ||
        hostname === 'localhost' ||
        hostname.endsWith('.localhost') ||
        hostname.endsWith('.local')
    )
}

export function isBlockedIp(address: string): boolean {
    const normalizedAddress = address.toLowerCase()
    const ipv4MappedAddress = getIpv4MappedAddress(normalizedAddress)

    if (ipv4MappedAddress) {
        // IPv4-mapped IPv6는 숨겨진 IPv4 주소일 수 있어 IPv4 규칙으로 다시 검사한다.
        return isBlockedIp(ipv4MappedAddress)
    }

    const version = isIP(normalizedAddress)

    if (version === 4) {
        return isBlockedIpv4(normalizedAddress)
    }

    if (version === 6) {
        return isBlockedIpv6(normalizedAddress)
    }

    return true
}

function getIpv4MappedAddress(address: string): string | null {
    const ipv4MappedPrefix = '::ffff:'

    if (!address.startsWith(ipv4MappedPrefix)) {
        return null
    }

    const mappedAddress = address.slice(ipv4MappedPrefix.length)

    if (isIP(mappedAddress) === 4) {
        return mappedAddress
    }

    const blocks = mappedAddress.split(':')

    if (blocks.length !== 2) {
        return null
    }

    const [firstBlock, secondBlock] = blocks.map((block) =>
        Number.parseInt(block, 16),
    )

    if (
        !Number.isInteger(firstBlock) ||
        !Number.isInteger(secondBlock) ||
        firstBlock < 0 ||
        firstBlock > 0xffff ||
        secondBlock < 0 ||
        secondBlock > 0xffff
    ) {
        return null
    }

    return [
        (firstBlock >> 8) & 0xff,
        firstBlock & 0xff,
        (secondBlock >> 8) & 0xff,
        secondBlock & 0xff,
    ].join('.')
}

function isBlockedIpv4(address: string): boolean {
    const octets = address.split('.').map(Number)
    const [first, second] = octets

    return (
        first === 0 ||
        first === 10 ||
        first === 127 ||
        first >= 224 ||
        (first === 100 && second >= 64 && second <= 127) ||
        (first === 169 && second === 254) ||
        (first === 172 && second >= 16 && second <= 31) ||
        (first === 192 && second === 168)
    )
}

function isBlockedIpv6(address: string): boolean {
    if (address === '::' || address === '::1') {
        return true
    }

    const firstBlock = address.split(':').find(Boolean)

    if (!firstBlock) {
        return true
    }

    const firstValue = Number.parseInt(firstBlock, 16)

    return (firstValue & 0xfe00) === 0xfc00 || (firstValue & 0xffc0) === 0xfe80
}
