import {
    BadGatewayException,
    Injectable,
    PayloadTooLargeException,
    UnsupportedMediaTypeException,
} from '@nestjs/common'

import { ReadImageResponseResult } from './image-fetcher.type'

@Injectable()
export class ImageResponseReader {
    async read(
        response: Response,
        maxBytes: number,
        signal: AbortSignal,
    ): Promise<ReadImageResponseResult> {
        const contentType = this.getImageContentType(
            response.headers.get('content-type'),
        )
        this.assertContentLength(
            response.headers.get('content-length'),
            maxBytes,
        )

        const buffer = await this.readLimitedBody(response, maxBytes, signal)

        if (buffer.byteLength === 0) {
            throw new BadGatewayException('이미지 응답이 비어 있습니다.')
        }

        return {
            contentType,
            buffer,
        }
    }

    private getImageContentType(contentTypeHeader: string | null): string {
        const contentType = contentTypeHeader
            ?.split(';')[0]
            ?.trim()
            .toLowerCase()

        if (
            !contentType ||
            !contentType.startsWith('image/') ||
            contentType === 'image/svg+xml'
        ) {
            throw new UnsupportedMediaTypeException(
                '이미지 응답의 Content-Type이 지원되지 않습니다.',
            )
        }

        return contentType
    }

    private assertContentLength(
        contentLengthHeader: string | null,
        maxBytes: number,
    ) {
        if (!contentLengthHeader) {
            return
        }

        const contentLength = Number(contentLengthHeader)

        if (Number.isFinite(contentLength) && contentLength > maxBytes) {
            throw new PayloadTooLargeException(
                `이미지 크기는 ${maxBytes} bytes를 초과할 수 없습니다.`,
            )
        }
    }

    private async readLimitedBody(
        response: Response,
        maxBytes: number,
        signal: AbortSignal,
    ): Promise<Buffer> {
        if (!response.body) {
            return Buffer.alloc(0)
        }

        const reader = response.body.getReader()
        const chunks: Uint8Array[] = []
        let receivedBytes = 0
        const cancelReader = () => {
            void reader.cancel().catch(() => undefined)
        }

        try {
            signal.throwIfAborted()
            signal.addEventListener('abort', cancelReader, { once: true })

            while (true) {
                const { done, value } = await reader.read()

                signal.throwIfAborted()

                if (done) {
                    break
                }

                if (!value) {
                    continue
                }

                receivedBytes += value.byteLength

                if (receivedBytes > maxBytes) {
                    await reader.cancel()
                    throw new PayloadTooLargeException(
                        `이미지 크기는 ${maxBytes} bytes를 초과할 수 없습니다.`,
                    )
                }

                chunks.push(value)
            }
        } finally {
            signal.removeEventListener('abort', cancelReader)
            reader.releaseLock()
        }

        return Buffer.concat(chunks, receivedBytes)
    }
}
