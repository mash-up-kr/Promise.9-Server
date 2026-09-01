import { crc32 } from 'node:zlib'

import sharp from 'sharp'

import { BaseException } from '../../common/exception/base.exception'

import { FetchedImage } from './image-fetcher/image-fetcher.type'
import { ImageAnalysisPreprocessor } from './image-analysis-preprocessor.service'
import { IMAGE_COLOR_ANALYSIS_LIMIT } from './image-color.constants'

describe('ImageAnalysisPreprocessor', () => {
    const service = new ImageAnalysisPreprocessor()

    it('분석 입력을 최대 변 512px의 PNG로 정규화한다', async () => {
        const buffer = await sharp({
            create: {
                width: 1200,
                height: 630,
                channels: 3,
                background: '#a0d4fc',
            },
        })
            .jpeg()
            .toBuffer()
        const image = createFetchedImage(buffer)

        const result = await service.prepare(image)
        const metadata = await sharp(result.buffer).metadata()

        expect(metadata.format).toBe('png')
        expect(metadata.width).toBe(IMAGE_COLOR_ANALYSIS_LIMIT.maxDimension)
        expect(metadata.height).toBe(269)
        expect(result).toMatchObject({
            sourceUrl: image.sourceUrl,
            contentType: 'image/png',
            byteLength: result.buffer.byteLength,
        })
    })

    it('20MP를 초과하는 이미지는 전체 픽셀 디코딩 전에 거부한다', async () => {
        const oversizedPng = createPngWithDimensions(5000, 5000)

        await expect(
            service.prepare(createFetchedImage(oversizedPng)),
        ).rejects.toBeInstanceOf(BaseException)
    })
})

function createFetchedImage(buffer: Buffer): FetchedImage {
    return {
        sourceUrl: 'https://example.com/image.png',
        contentType: 'image/png',
        byteLength: buffer.byteLength,
        buffer,
    }
}

// 1x1 PNG의 IHDR만 바꿔 실제 대형 버퍼 할당 없이 픽셀 제한을 검증한다.
function createPngWithDimensions(width: number, height: number): Buffer {
    const png = Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
        'base64',
    )

    png.writeUInt32BE(width, 16)
    png.writeUInt32BE(height, 20)
    png.writeUInt32BE(crc32(png.subarray(12, 29)), 29)

    return png
}
