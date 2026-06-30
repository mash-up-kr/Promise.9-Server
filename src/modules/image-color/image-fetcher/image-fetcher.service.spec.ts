import { BadGatewayException, BadRequestException } from '@nestjs/common'

import {
    ResolvedPublicUrl,
    UrlSecurityService,
} from '../../../infrastructure/url-security/url-security.service'

import { MAX_IMAGE_FETCH_OPTIONS } from './image-fetcher.constants'
import { ImageFetcherService } from './image-fetcher.service'
import { ImageResponseReader } from './image-response.reader'

describe('ImageFetcherService', () => {
    let service: ImageFetcherService
    let urlSecurity: jest.Mocked<
        Pick<UrlSecurityService, 'parseHttpUrl' | 'resolvePublicUrl'>
    >
    let responseReader: jest.Mocked<Pick<ImageResponseReader, 'read'>>

    beforeEach(() => {
        urlSecurity = {
            parseHttpUrl: jest.fn((rawUrl: string, baseUrl?: URL) => {
                return new URL(rawUrl, baseUrl)
            }),
            resolvePublicUrl: jest.fn(),
        }
        responseReader = {
            read: jest.fn().mockResolvedValue({
                contentType: 'image/png',
                buffer: Buffer.from([1, 2, 3]),
            }),
        }

        service = new ImageFetcherService(
            urlSecurity as unknown as UrlSecurityService,
            responseReader as unknown as ImageResponseReader,
        )
    })

    it('검증된 public IP로 이미지 요청을 수행한다', async () => {
        const imageUrl = 'https://example.com/image.png'
        const resolvedUrl = createResolvedPublicUrl('93.184.216.34')
        const requestMock = mockRequest(service, createImageResponse())

        urlSecurity.resolvePublicUrl.mockResolvedValueOnce(resolvedUrl)

        const result = await service.fetch(imageUrl)

        expect(requestMock).toHaveBeenCalledWith(
            new URL(imageUrl),
            resolvedUrl.address,
            expect.any(AbortSignal),
        )
        expect(result).toEqual({
            sourceUrl: imageUrl,
            contentType: 'image/png',
            byteLength: 3,
            buffer: Buffer.from([1, 2, 3]),
        })
    })

    it('리다이렉트 URL도 다시 검증하고 검증된 IP로 요청한다', async () => {
        const imageUrl = 'https://example.com/image.png'
        const redirectedUrl = 'https://example.com/next.png'
        const requestMock = mockRequest(
            service,
            new Response(null, {
                status: 302,
                headers: {
                    location: '/next.png',
                },
            }),
            createImageResponse(),
        )

        urlSecurity.resolvePublicUrl
            .mockResolvedValueOnce(createResolvedPublicUrl('93.184.216.34'))
            .mockResolvedValueOnce(createResolvedPublicUrl('93.184.216.35'))

        const result = await service.fetch(imageUrl)

        expect(urlSecurity.resolvePublicUrl).toHaveBeenNthCalledWith(
            1,
            new URL(imageUrl),
        )
        expect(urlSecurity.resolvePublicUrl).toHaveBeenNthCalledWith(
            2,
            new URL(redirectedUrl),
        )
        expect(requestMock).toHaveBeenNthCalledWith(
            1,
            new URL(imageUrl),
            '93.184.216.34',
            expect.any(AbortSignal),
        )
        expect(requestMock).toHaveBeenNthCalledWith(
            2,
            new URL(redirectedUrl),
            '93.184.216.35',
            expect.any(AbortSignal),
        )
        expect(result.sourceUrl).toBe(redirectedUrl)
    })

    it('리다이렉트 처리 중 예외가 나도 응답 body를 정리한다', async () => {
        const imageUrl = 'https://example.com/image.png'
        const redirectResponse = createRedirectResponse()
        const cancelSpy = jest
            .spyOn(redirectResponse.body!, 'cancel')
            .mockResolvedValue(undefined)
        const requestMock = mockRequest(service, redirectResponse)

        urlSecurity.resolvePublicUrl.mockResolvedValueOnce(
            createResolvedPublicUrl('93.184.216.34'),
        )

        await expect(service.fetch(imageUrl)).rejects.toBeInstanceOf(
            BadGatewayException,
        )
        expect(requestMock).toHaveBeenCalledTimes(1)
        expect(cancelSpy).toHaveBeenCalledTimes(1)
    })

    it.each([
        ['timeoutMs', MAX_IMAGE_FETCH_OPTIONS.timeoutMs + 1],
        ['maxBytes', MAX_IMAGE_FETCH_OPTIONS.maxBytes + 1],
        ['maxRedirects', MAX_IMAGE_FETCH_OPTIONS.maxRedirects + 1],
    ] as const)(
        '%s 옵션 상한을 초과하면 요청하지 않는다',
        async (key, value) => {
            const requestMock = mockRequest(service, createImageResponse())

            await expect(
                service.fetch('https://example.com/image.png', {
                    [key]: value,
                }),
            ).rejects.toBeInstanceOf(BadRequestException)
            expect(requestMock).not.toHaveBeenCalled()
            expect(urlSecurity.resolvePublicUrl).not.toHaveBeenCalled()
        },
    )
})

function mockRequest(
    service: ImageFetcherService,
    ...responses: Response[]
): jest.SpyInstance {
    return jest
        .spyOn(
            service as unknown as {
                request: (
                    url: URL,
                    address: string,
                    signal: AbortSignal,
                ) => Promise<Response>
            },
            'request',
        )
        .mockImplementation(() => {
            const response = responses.shift()

            if (!response) {
                return Promise.reject(new Error('mock response is empty'))
            }

            return Promise.resolve(response)
        })
}

function createImageResponse(): Response {
    return new Response(null, {
        status: 200,
        headers: {
            'content-type': 'image/png',
        },
    })
}

function createRedirectResponse(): Response {
    return new Response(
        new ReadableStream({
            start(controller) {
                controller.enqueue(new Uint8Array([1]))
            },
        }),
        {
            status: 302,
        },
    )
}

function createResolvedPublicUrl(address: string): ResolvedPublicUrl {
    return {
        address,
    }
}
