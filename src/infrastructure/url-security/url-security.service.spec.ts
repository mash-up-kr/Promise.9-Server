import { lookup } from 'node:dns/promises'

import { BadRequestException } from '@nestjs/common'

import { UrlSecurityService } from './url-security.service'

jest.mock('node:dns/promises', () => ({
    lookup: jest.fn(),
}))

type LookupAll = (
    hostname: string,
    options: { all: true; verbatim: true },
) => Promise<Array<{ address: string; family: number }>>

const lookupMock = lookup as unknown as jest.MockedFunction<LookupAll>

describe('UrlSecurityService', () => {
    let service: UrlSecurityService

    beforeEach(() => {
        service = new UrlSecurityService()
        lookupMock.mockReset()
    })

    describe('parseHttpUrl', () => {
        it('http와 https URL을 파싱한다', () => {
            expect(
                service.parseHttpUrl('https://example.com/image.jpg').href,
            ).toBe('https://example.com/image.jpg')
            expect(service.parseHttpUrl('http://example.com').href).toBe(
                'http://example.com/',
            )
        })

        it('상대 리다이렉트 URL을 base URL 기준으로 파싱한다', () => {
            const url = service.parseHttpUrl(
                '/next-image.jpg',
                new URL('https://example.com/posts/1'),
            )

            expect(url.href).toBe('https://example.com/next-image.jpg')
        })

        it('http/https가 아닌 프로토콜을 거부한다', () => {
            expect(() => service.parseHttpUrl('file:///etc/passwd')).toThrow(
                BadRequestException,
            )
        })

        it('잘못된 URL 형식을 거부한다', () => {
            expect(() => service.parseHttpUrl('not a url')).toThrow(
                BadRequestException,
            )
        })
    })

    describe('assertPublicUrl', () => {
        it('공개 IP 주소를 허용한다', async () => {
            await expect(
                service.assertPublicUrl(new URL('https://8.8.8.8/image.jpg')),
            ).resolves.toBeUndefined()
            expect(lookupMock).not.toHaveBeenCalled()
        })

        it('공개 IP 주소를 연결 대상으로 반환한다', async () => {
            await expect(
                service.resolvePublicUrl(new URL('https://8.8.8.8/image.jpg')),
            ).resolves.toMatchObject({
                address: '8.8.8.8',
            })
            expect(lookupMock).not.toHaveBeenCalled()
        })

        it('localhost 호스트를 거부한다', async () => {
            await expect(
                service.assertPublicUrl(new URL('http://localhost/image.jpg')),
            ).rejects.toBeInstanceOf(BadRequestException)
            expect(lookupMock).not.toHaveBeenCalled()
        })

        it('사설 IPv4 주소를 거부한다', async () => {
            await expect(
                service.assertPublicUrl(new URL('http://10.0.0.1/image.jpg')),
            ).rejects.toBeInstanceOf(BadRequestException)
            expect(lookupMock).not.toHaveBeenCalled()
        })

        it('EC2 metadata 주소를 거부한다', async () => {
            await expect(
                service.assertPublicUrl(
                    new URL('http://169.254.169.254/latest/meta-data'),
                ),
            ).rejects.toBeInstanceOf(BadRequestException)
            expect(lookupMock).not.toHaveBeenCalled()
        })

        it('IPv4-mapped IPv6로 표현된 내부 IPv4 주소를 거부한다', async () => {
            await expect(
                service.assertPublicUrl(
                    new URL('http://[::ffff:c0a8:1]/image.jpg'),
                ),
            ).rejects.toBeInstanceOf(BadRequestException)
            expect(lookupMock).not.toHaveBeenCalled()
        })

        it('DNS 조회 결과가 공개 IP이면 허용한다', async () => {
            lookupMock.mockResolvedValueOnce([
                { address: '93.184.216.34', family: 4 },
            ])

            await expect(
                service.assertPublicUrl(
                    new URL('https://example.com/image.jpg'),
                ),
            ).resolves.toBeUndefined()
        })

        it('DNS 조회 결과의 공개 IP를 연결 대상으로 반환한다', async () => {
            lookupMock.mockResolvedValueOnce([
                { address: '93.184.216.34', family: 4 },
            ])

            await expect(
                service.resolvePublicUrl(
                    new URL('https://example.com/image.jpg'),
                ),
            ).resolves.toMatchObject({
                address: '93.184.216.34',
            })
        })

        it('DNS 조회 결과에 내부 IP가 있으면 거부한다', async () => {
            lookupMock.mockResolvedValueOnce([
                { address: '93.184.216.34', family: 4 },
                { address: '192.168.0.10', family: 4 },
            ])

            await expect(
                service.assertPublicUrl(
                    new URL('https://example.com/image.jpg'),
                ),
            ).rejects.toBeInstanceOf(BadRequestException)
        })

        it('DNS 조회 결과의 IPv4-mapped IPv6가 내부 IPv4이면 거부한다', async () => {
            lookupMock.mockResolvedValueOnce([
                { address: '::ffff:c0a8:1', family: 6 },
            ])

            await expect(
                service.assertPublicUrl(
                    new URL('https://example.com/image.jpg'),
                ),
            ).rejects.toBeInstanceOf(BadRequestException)
        })

        it('DNS 조회 실패를 BadRequestException으로 변환한다', async () => {
            lookupMock.mockRejectedValueOnce(new Error('ENOTFOUND'))

            await expect(
                service.assertPublicUrl(new URL('https://unknown.example')),
            ).rejects.toBeInstanceOf(BadRequestException)
        })
    })
})
