import { BaseException } from '../../common/exception/base.exception'

import { NodeVibrantImageColorAnalyzer } from './analyzers/node-vibrant-image-color.analyzer'
import { SharpImageColorAnalyzer } from './analyzers/sharp-image-color.analyzer'
import { ImageFetcherService } from './image-fetcher/image-fetcher.service'
import { FetchedImage } from './image-fetcher/image-fetcher.type'
import {
    ImageColorValue,
    SharpImageColorResult,
} from './types/image-color.type'
import {
    NodeVibrantImageColorResult,
    NodeVibrantPaletteColor,
    NodeVibrantPaletteColors,
} from './types/node-vibrant-image-color.type'
import { ImageAnalysisPreprocessor } from './image-analysis-preprocessor.service'
import { IMAGE_COLOR_SELECTION_SOURCE } from './image-color.constants'
import { ImageColorService } from './image-color.service'
import { IMAGE_COLOR_ERROR } from './image-color-error.constant'

describe('ImageColorService', () => {
    let service: ImageColorService
    let imageFetcher: jest.Mocked<Pick<ImageFetcherService, 'fetch'>>
    let imagePreprocessor: jest.Mocked<
        Pick<ImageAnalysisPreprocessor, 'prepare'>
    >
    let sharpAnalyzer: jest.Mocked<Pick<SharpImageColorAnalyzer, 'analyze'>>
    let nodeVibrantAnalyzer: jest.Mocked<
        Pick<NodeVibrantImageColorAnalyzer, 'analyze'>
    >

    const image: FetchedImage = {
        sourceUrl: 'https://example.com/image.jpg',
        contentType: 'image/jpeg',
        byteLength: 3,
        buffer: Buffer.from([1, 2, 3]),
    }
    const preparedImage: FetchedImage = {
        ...image,
        contentType: 'image/png',
        byteLength: 2,
        buffer: Buffer.from([4, 5]),
    }
    const sharpResult: SharpImageColorResult = {
        averageColor: createImageColor('#111111', [17, 17, 17]),
        dominantColor: createImageColor('#222222', [34, 34, 34]),
    }
    const lightVibrant = createPaletteColor('#ffee66', [255, 238, 102])
    const vibrant = createPaletteColor('#dd3355', [221, 51, 85])

    beforeEach(() => {
        imageFetcher = {
            fetch: jest.fn().mockResolvedValue(image),
        }
        imagePreprocessor = {
            prepare: jest.fn().mockResolvedValue(preparedImage),
        }
        sharpAnalyzer = {
            analyze: jest.fn().mockResolvedValue(sharpResult),
        }
        nodeVibrantAnalyzer = {
            analyze: jest.fn().mockResolvedValue(
                createNodeVibrantResult({
                    lightVibrant,
                    vibrant,
                }),
            ),
        }

        service = new ImageColorService(
            imageFetcher as unknown as ImageFetcherService,
            imagePreprocessor,
            sharpAnalyzer as unknown as SharpImageColorAnalyzer,
            nodeVibrantAnalyzer as unknown as NodeVibrantImageColorAnalyzer,
        )
    })

    it('밝고 선명한 팔레트 색상을 우선 선택한다', async () => {
        const result = await service.extractFromUrl(image.sourceUrl, {
            timeoutMs: 1000,
        })

        expect(result).toMatchObject({
            source: IMAGE_COLOR_SELECTION_SOURCE.NODE_VIBRANT_LIGHT_VIBRANT,
            hex: lightVibrant.hex,
        })
        expect(imageFetcher.fetch).toHaveBeenCalledWith(image.sourceUrl, {
            timeoutMs: 1000,
        })
        expect(imagePreprocessor.prepare).toHaveBeenCalledWith(image)
        expect(sharpAnalyzer.analyze).toHaveBeenCalledWith(preparedImage)
        expect(nodeVibrantAnalyzer.analyze).toHaveBeenCalledWith(preparedImage)
    })

    it('preferredColor가 있으면 해당 색상을 우선 선택한다', async () => {
        const result = await service.extractFromUrl(image.sourceUrl, {
            preferredColor: IMAGE_COLOR_SELECTION_SOURCE.SHARP_AVERAGE_COLOR,
        })

        expect(result).toMatchObject({
            source: IMAGE_COLOR_SELECTION_SOURCE.SHARP_AVERAGE_COLOR,
            hex: sharpResult.averageColor.hex,
        })
    })

    it('node-vibrant 분석 실패 시 sharp 대표색으로 보정한다', async () => {
        nodeVibrantAnalyzer.analyze.mockRejectedValueOnce(
            new BaseException(IMAGE_COLOR_ERROR.PALETTE_ANALYSIS_FAILED),
        )

        const result = await service.extractFromUrl(image.sourceUrl)

        expect(result).toMatchObject({
            source: IMAGE_COLOR_SELECTION_SOURCE.SHARP_DOMINANT_COLOR,
            hex: sharpResult.dominantColor.hex,
        })
    })

    it('node-vibrant의 예상하지 못한 예외는 삼키지 않는다', async () => {
        const unexpectedError = new Error('unexpected')
        nodeVibrantAnalyzer.analyze.mockRejectedValueOnce(unexpectedError)

        await expect(service.extractFromUrl(image.sourceUrl)).rejects.toBe(
            unexpectedError,
        )
    })

    it('전체 추출 API는 두 분석 결과를 모두 반환한다', async () => {
        const result = await service.extractAllFromUrl(image.sourceUrl)

        expect(result).toEqual({
            sourceUrl: image.sourceUrl,
            contentType: image.contentType,
            byteLength: image.byteLength,
            results: {
                sharp: sharpResult,
                nodeVibrant: createNodeVibrantResult({
                    lightVibrant,
                    vibrant,
                }),
            },
        })
    })

    it('동시에 최대 두 개의 이미지만 가져와 분석한다', async () => {
        const fetchResolvers: Array<(value: FetchedImage) => void> = []
        imageFetcher.fetch.mockImplementation(
            () =>
                new Promise((resolve) => {
                    fetchResolvers.push(resolve)
                }),
        )

        const tasks = [
            service.extractFromUrl('https://example.com/1.png'),
            service.extractFromUrl('https://example.com/2.png'),
            service.extractFromUrl('https://example.com/3.png'),
        ]

        await Promise.resolve()
        expect(imageFetcher.fetch).toHaveBeenCalledTimes(2)

        fetchResolvers[0](image)
        await tasks[0]
        await Promise.resolve()
        expect(imageFetcher.fetch).toHaveBeenCalledTimes(3)

        fetchResolvers[1](image)
        fetchResolvers[2](image)
        await Promise.all(tasks)
    })
})

function createImageColor(
    hex: string,
    rgb: [number, number, number],
): ImageColorValue {
    return {
        hex,
        rgb,
        textColor: '#000',
        luminance: 0.5,
        isDark: false,
    }
}

function createPaletteColor(
    hex: string,
    rgb: [number, number, number],
): NodeVibrantPaletteColor {
    return {
        hex,
        rgb,
        hsl: [0, 0, 0],
        population: 10,
        titleTextColor: '#000',
        bodyTextColor: '#000',
    }
}

function createNodeVibrantResult(
    colors: Partial<NodeVibrantPaletteColors>,
): NodeVibrantImageColorResult {
    return {
        colors: {
            vibrant: colors.vibrant ?? null,
            muted: null,
            darkVibrant: null,
            darkMuted: null,
            lightVibrant: colors.lightVibrant ?? null,
            lightMuted: null,
        },
    }
}
