import { Injectable } from '@nestjs/common'

import { BaseException } from '../../common/exception/base.exception'

import { NodeVibrantImageColorAnalyzer } from './analyzers/node-vibrant-image-color.analyzer'
import { SharpImageColorAnalyzer } from './analyzers/sharp-image-color.analyzer'
import { ImageFetcherService } from './image-fetcher/image-fetcher.service'
import {
    FetchedImage,
    ImageFetchOptions,
} from './image-fetcher/image-fetcher.type'
import {
    ImageColorAnalysisResult,
    ImageColorExtractOptions,
    ImageColorValue,
    SelectedImageColor,
    SharpImageColorResult,
} from './types/image-color.type'
import {
    NodeVibrantImageColorResult,
    NodeVibrantPaletteColor,
} from './types/node-vibrant-image-color.type'
import { ImageAnalysisPreprocessor } from './image-analysis-preprocessor.service'
import {
    EMPTY_NODE_VIBRANT_RESULT,
    IMAGE_COLOR_ANALYSIS_LIMIT,
    IMAGE_COLOR_SELECTION_PRIORITY,
    IMAGE_COLOR_SELECTION_SOURCE,
    ImageColorSelectionSource,
    NODE_VIBRANT_COLOR_KEY_BY_SOURCE,
} from './image-color.constants'
import { toImageColorValue } from './image-color.util'

@Injectable()
export class ImageColorService {
    private activeAnalysisCount = 0
    private readonly analysisWaiters: Array<() => void> = []

    constructor(
        private readonly imageFetcher: ImageFetcherService,
        private readonly imagePreprocessor: ImageAnalysisPreprocessor,
        private readonly sharpAnalyzer: SharpImageColorAnalyzer,
        private readonly nodeVibrantAnalyzer: NodeVibrantImageColorAnalyzer,
    ) {}

    async extractFromUrl(
        imageUrl: string,
        options: ImageColorExtractOptions = {},
    ): Promise<SelectedImageColor> {
        return this.withAnalysisSlot(async () => {
            const { preferredColor, ...fetchOptions } = options
            const image = await this.imageFetcher.fetch(imageUrl, fetchOptions)
            const preparedImage = await this.imagePreprocessor.prepare(image)
            // 단일 색상 선택 API는 node-vibrant 실패 시 sharp 결과로 보정한다.
            const sharpPromise = this.sharpAnalyzer.analyze(preparedImage)
            const nodeVibrantPromise =
                this.analyzeNodeVibrantOrEmpty(preparedImage)
            const sharp = await sharpPromise
            const nodeVibrant = await nodeVibrantPromise
            const analysis = this.createAnalysisResult(
                image,
                sharp,
                nodeVibrant,
            )

            return this.selectColor(analysis, preferredColor)
        })
    }

    async extractAllFromUrl(
        imageUrl: string,
        options: ImageFetchOptions = {},
    ): Promise<ImageColorAnalysisResult> {
        return this.withAnalysisSlot(async () => {
            const image = await this.imageFetcher.fetch(imageUrl, options)

            return this.analyzeImage(image)
        })
    }

    private async analyzeImage(
        image: FetchedImage,
    ): Promise<ImageColorAnalysisResult> {
        const preparedImage = await this.imagePreprocessor.prepare(image)
        const [sharp, nodeVibrant] = await Promise.all([
            this.sharpAnalyzer.analyze(preparedImage),
            this.nodeVibrantAnalyzer.analyze(preparedImage),
        ])

        return this.createAnalysisResult(image, sharp, nodeVibrant)
    }

    private createAnalysisResult(
        image: FetchedImage,
        sharp: SharpImageColorResult,
        nodeVibrant: NodeVibrantImageColorResult,
    ): ImageColorAnalysisResult {
        return {
            sourceUrl: image.sourceUrl,
            contentType: image.contentType,
            byteLength: image.byteLength,
            results: {
                sharp,
                nodeVibrant,
            },
        }
    }

    private async analyzeNodeVibrantOrEmpty(
        image: FetchedImage,
    ): Promise<NodeVibrantImageColorResult> {
        try {
            return await this.nodeVibrantAnalyzer.analyze(image)
        } catch (error) {
            if (error instanceof BaseException) {
                return EMPTY_NODE_VIBRANT_RESULT
            }

            throw error
        }
    }

    // 웹 프로세스에서 동시에 디코딩하는 이미지 수를 제한해 메모리 급증을 막는다.
    private async withAnalysisSlot<T>(task: () => Promise<T>): Promise<T> {
        await this.acquireAnalysisSlot()

        try {
            return await task()
        } finally {
            this.releaseAnalysisSlot()
        }
    }

    private acquireAnalysisSlot(): Promise<void> {
        if (
            this.activeAnalysisCount < IMAGE_COLOR_ANALYSIS_LIMIT.maxConcurrency
        ) {
            this.activeAnalysisCount += 1
            return Promise.resolve()
        }

        return new Promise((resolve) => {
            this.analysisWaiters.push(resolve)
        })
    }

    private releaseAnalysisSlot(): void {
        const next = this.analysisWaiters.shift()

        if (next) {
            next()
            return
        }

        this.activeAnalysisCount -= 1
    }

    private selectColor(
        analysis: ImageColorAnalysisResult,
        preferredColor?: ImageColorSelectionSource,
    ): SelectedImageColor {
        if (preferredColor) {
            const color = this.getColorBySource(analysis, preferredColor)

            if (color) {
                return this.toSelectedColor(preferredColor, color)
            }
        }

        // 팔레트 계열 색상을 우선 사용하고, 없으면 sharp 대표색으로 보정한다.
        for (const source of IMAGE_COLOR_SELECTION_PRIORITY) {
            const color = this.getColorBySource(analysis, source)

            if (color) {
                return this.toSelectedColor(source, color)
            }
        }

        return this.toSelectedColor(
            IMAGE_COLOR_SELECTION_SOURCE.SHARP_DOMINANT_COLOR,
            analysis.results.sharp.dominantColor,
        )
    }

    private getColorBySource(
        analysis: ImageColorAnalysisResult,
        source: ImageColorSelectionSource,
    ): ImageColorValue | NodeVibrantPaletteColor | null {
        if (source === IMAGE_COLOR_SELECTION_SOURCE.SHARP_DOMINANT_COLOR) {
            return analysis.results.sharp.dominantColor
        }

        if (source === IMAGE_COLOR_SELECTION_SOURCE.SHARP_AVERAGE_COLOR) {
            return analysis.results.sharp.averageColor
        }

        const nodeVibrantColorKey = NODE_VIBRANT_COLOR_KEY_BY_SOURCE[source]

        return nodeVibrantColorKey
            ? analysis.results.nodeVibrant.colors[nodeVibrantColorKey]
            : null
    }

    private toSelectedColor(
        source: ImageColorSelectionSource,
        color: ImageColorValue | NodeVibrantPaletteColor,
    ): SelectedImageColor {
        const colorValue =
            'luminance' in color ? color : toImageColorValue(color.rgb)

        return {
            ...colorValue,
            source,
        }
    }
}
