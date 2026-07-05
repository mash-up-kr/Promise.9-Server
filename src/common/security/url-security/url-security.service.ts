import { lookup } from 'node:dns/promises'
import { isIP } from 'node:net'

import { BadRequestException, HttpException, Injectable } from '@nestjs/common'

import { isBlockedHostname, isBlockedIp } from './url-security.checker'

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

        if (isBlockedHostname(hostname)) {
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

            // DNS rebinding과 혼합 응답을 막기 위해 조회된 모든 주소가 공개 IP인지 확인한다.
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

    private assertPublicIp(address: string) {
        if (isBlockedIp(address)) {
            throw new BadRequestException(
                '내부망 또는 로컬 주소는 사용할 수 없습니다.',
            )
        }
    }
}
