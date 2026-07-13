import { Injectable } from '@nestjs/common'

import { BaseException } from '../../../common/exception/base.exception'

import { ReadImageResponseResult } from './image-fetcher.type'
import { IMAGE_FETCHER_ERROR } from './image-fetcher-error.constant'

@Injectable()
export class ImageResponseReader {
    async read(
        response: Response,
        maxBytes: number,
        signal: AbortSignal,
    ): Promise<ReadImageResponseResult> {
        try {
            const contentType = this.getImageContentType(
                response.headers.get('content-type'),
            )
            this.assertContentLength(
                response.headers.get('content-length'),
                maxBytes,
            )

            const buffer = await this.readLimitedBody(
                response,
                maxBytes,
                signal,
            )

            if (buffer.byteLength === 0) {
                throw new BaseException(IMAGE_FETCHER_ERROR.EMPTY_RESPONSE)
            }

            return {
                contentType,
                buffer,
            }
        } catch (error) {
            await this.cancelResponseBody(response)
            throw error
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
            throw new BaseException(
                IMAGE_FETCHER_ERROR.UNSUPPORTED_CONTENT_TYPE,
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
            throw new BaseException(IMAGE_FETCHER_ERROR.TOO_LARGE)
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
        const cancelOnAbort = () => {
            void reader.cancel().catch(() => undefined)
        }

        try {
            signal.throwIfAborted()
            signal.addEventListener('abort', cancelOnAbort, { once: true })

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
                    throw new BaseException(IMAGE_FETCHER_ERROR.TOO_LARGE)
                }

                chunks.push(value)
            }
        } finally {
            signal.removeEventListener('abort', cancelOnAbort)
            reader.releaseLock()
        }

        return Buffer.concat(chunks, receivedBytes)
    }

    private async cancelResponseBody(response: Response) {
        if (!response.body) {
            return
        }

        try {
            await response.body.cancel()
        } catch (_error) {
            // 이미 reader가 닫았거나 lock이 해제되는 중인 body는 추가 정리가 필요 없다.
        }
    }
}
