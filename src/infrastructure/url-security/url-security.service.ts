import { lookup } from 'node:dns/promises'
import { isIP } from 'node:net'

import { BadRequestException, HttpException, Injectable } from '@nestjs/common'

export interface ResolvedPublicUrl {
    address: string
}

@Injectable()
export class UrlSecurityService {
    parseHttpUrl(rawUrl: string, baseUrl?: URL): URL {
        let url: URL

        try {
            url = new URL(rawUrl, baseUrl)
        } catch (_error) {
            throw new BadRequestException('URL 형식이 올바르지 않습니다.')
        }

        if (url.protocol !== 'http:' && url.protocol !== 'https:') {
            throw new BadRequestException(
                'URL은 http 또는 https만 사용할 수 있습니다.',
            )
        }

        return url
    }

    async assertPublicUrl(url: URL) {
        await this.resolvePublicUrl(url)
    }

    async resolvePublicUrl(url: URL): Promise<ResolvedPublicUrl> {
        const hostname = this.normalizeHostname(url.hostname)

        if (this.isBlockedHostname(hostname)) {
            throw new BadRequestException(
                '내부망 또는 로컬 주소는 사용할 수 없습니다.',
            )
        }

        const ipVersion = isIP(hostname)

        if (ipVersion) {
            this.assertPublicIp(hostname)

            return {
                address: hostname,
            }
        }

        try {
            const addresses = await lookup(hostname, {
                all: true,
                verbatim: true,
            })

            if (addresses.length === 0) {
                throw new BadRequestException(
                    'URL의 호스트를 확인할 수 없습니다.',
                )
            }

            for (const { address } of addresses) {
                this.assertPublicIp(address)
            }

            const [resolvedAddress] = addresses

            return {
                address: resolvedAddress.address,
            }
        } catch (error) {
            if (error instanceof HttpException) {
                throw error
            }

            throw new BadRequestException('URL의 호스트를 확인할 수 없습니다.')
        }
    }

    private normalizeHostname(hostname: string): string {
        return hostname
            .trim()
            .replace(/^\[(.*)]$/, '$1')
            .toLowerCase()
    }

    private isBlockedHostname(hostname: string): boolean {
        return (
            hostname.length === 0 ||
            hostname === 'localhost' ||
            hostname.endsWith('.localhost') ||
            hostname.endsWith('.local')
        )
    }

    private assertPublicIp(address: string) {
        if (this.isBlockedIp(address)) {
            throw new BadRequestException(
                '내부망 또는 로컬 주소는 사용할 수 없습니다.',
            )
        }
    }

    private isBlockedIp(address: string): boolean {
        const normalizedAddress = address.toLowerCase()
        const ipv4MappedPrefix = '::ffff:'

        if (normalizedAddress.startsWith(ipv4MappedPrefix)) {
            return this.isBlockedIp(
                normalizedAddress.slice(ipv4MappedPrefix.length),
            )
        }

        const version = isIP(normalizedAddress)

        if (version === 4) {
            return this.isBlockedIpv4(normalizedAddress)
        }

        if (version === 6) {
            return this.isBlockedIpv6(normalizedAddress)
        }

        return true
    }

    private isBlockedIpv4(address: string): boolean {
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

    private isBlockedIpv6(address: string): boolean {
        if (address === '::' || address === '::1') {
            return true
        }

        const firstBlock = address.split(':').find(Boolean)

        if (!firstBlock) {
            return true
        }

        const firstValue = Number.parseInt(firstBlock, 16)

        return (
            (firstValue & 0xfe00) === 0xfc00 || (firstValue & 0xffc0) === 0xfe80
        )
    }
}
