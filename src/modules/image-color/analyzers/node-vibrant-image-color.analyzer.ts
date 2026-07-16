import { Injectable } from '@nestjs/common'
import { Vibrant } from 'node-vibrant/node'

import { BaseException } from '../../../common/exception/base.exception'
import { IMAGE_COLOR_ERROR } from '../image-color-error.constant'
import { FetchedImage } from '../image-fetcher/image-fetcher.type'
import {
    NodeVibrantImageColorResult,
    NodeVibrantPaletteColor,
} from '../types/node-vibrant-image-color.type'

type VibrantPalette = Awaited<
    ReturnType<ReturnType<typeof Vibrant.from>['getPalette']>
>
type VibrantSwatch = NonNullable<VibrantPalette['Vibrant']>

@Injectable()
export class NodeVibrantImageColorAnalyzer {
    async analyze(image: FetchedImage): Promise<NodeVibrantImageColorResult> {
        try {
            const builder = Vibrant.from(image.buffer)
            const palette = await builder.getPalette()

            return {
                // node-vibrant는 이미지 분위기를 설명하는 6개 팔레트 색상을 만든다.
                colors: {
                    vibrant: this.toColor(palette.Vibrant),
                    muted: this.toColor(palette.Muted),
                    darkVibrant: this.toColor(palette.DarkVibrant),
                    darkMuted: this.toColor(palette.DarkMuted),
                    lightVibrant: this.toColor(palette.LightVibrant),
                    lightMuted: this.toColor(palette.LightMuted),
                },
            }
        } catch (_error) {
            throw new BaseException(IMAGE_COLOR_ERROR.PALETTE_ANALYSIS_FAILED)
        }
    }

    private toColor(
        swatch: VibrantSwatch | null,
    ): NodeVibrantPaletteColor | null {
        if (!swatch) {
            return null
        }

        return {
            hex: swatch.hex,
            rgb: swatch.rgb,
            hsl: swatch.hsl,
            population: swatch.population,
            titleTextColor: swatch.titleTextColor,
            bodyTextColor: swatch.bodyTextColor,
        }
    }
}
