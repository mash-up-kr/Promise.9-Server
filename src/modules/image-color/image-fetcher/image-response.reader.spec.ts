import {
    ImageTooLargeException,
    UnsupportedImageContentTypeException,
} from './image-fetcher.exception'
import { ImageResponseReader } from './image-response.reader'

describe('ImageResponseReader', () => {
    let reader: ImageResponseReader
    let signal: AbortSignal

    beforeEach(() => {
        reader = new ImageResponseReader()
        signal = new AbortController().signal
    })

    it('이미지 응답 body를 Buffer로 읽는다', async () => {
        const response = new Response(Buffer.from([1, 2, 3]), {
            headers: {
                'content-type': 'image/png; charset=utf-8',
            },
        })

        await expect(reader.read(response, 10, signal)).resolves.toEqual({
            contentType: 'image/png',
            buffer: Buffer.from([1, 2, 3]),
        })
    })

    it('이미지가 아닌 Content-Type은 거부한다', async () => {
        const response = new Response(Buffer.from('html'), {
            headers: {
                'content-type': 'text/html',
            },
        })
        const cancelSpy = jest
            .spyOn(response.body!, 'cancel')
            .mockResolvedValue(undefined)

        await expect(reader.read(response, 10, signal)).rejects.toBeInstanceOf(
            UnsupportedImageContentTypeException,
        )
        expect(cancelSpy).toHaveBeenCalledTimes(1)
    })

    it('Content-Length가 maxBytes보다 크면 body를 읽기 전에 거부한다', async () => {
        const response = new Response(Buffer.from([1, 2, 3]), {
            headers: {
                'content-type': 'image/jpeg',
                'content-length': '3',
            },
        })
        const cancelSpy = jest
            .spyOn(response.body!, 'cancel')
            .mockResolvedValue(undefined)

        await expect(reader.read(response, 2, signal)).rejects.toBeInstanceOf(
            ImageTooLargeException,
        )
        expect(cancelSpy).toHaveBeenCalledTimes(1)
    })

    it('읽는 중 maxBytes를 초과하면 거부한다', async () => {
        const response = new Response(Buffer.from([1, 2, 3]), {
            headers: {
                'content-type': 'image/jpeg',
            },
        })

        await expect(reader.read(response, 2, signal)).rejects.toBeInstanceOf(
            ImageTooLargeException,
        )
    })
})
