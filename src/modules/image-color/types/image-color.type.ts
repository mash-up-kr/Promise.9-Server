import { ImageColorSelectionSource } from '../image-color.constants'
import { ImageFetchOptions } from '../image-fetcher/image-fetcher.type'

import { NodeVibrantImageColorResult } from './node-vibrant-image-color.type'

export interface ImageColorValue {
    hex: string
    rgb: [number, number, number]
    textColor: '#000' | '#fff'
    luminance: number
    isDark: boolean
}

export interface SharpImageColorResult {
    averageColor: ImageColorValue
    dominantColor: ImageColorValue
}

export interface SelectedImageColor extends ImageColorValue {
    source: ImageColorSelectionSource
}

export interface ImageColorExtractOptions extends ImageFetchOptions {
    preferredColor?: ImageColorSelectionSource
}

export interface ImageColorAnalysisResults {
    sharp: SharpImageColorResult
    nodeVibrant: NodeVibrantImageColorResult
}

export interface ImageColorAnalysisResult {
    sourceUrl: string
    contentType: string
    byteLength: number
    results: ImageColorAnalysisResults
}
