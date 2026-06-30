import { Injectable, UnprocessableEntityException } from '@nestjs/common'
import sharp, { type Stats } from 'sharp'

import { toImageColorValue } from '../image-color.util'
import { FetchedImage } from '../image-fetcher/image-fetcher.type'
import { SharpImageColorResult } from '../types/image-color.type'

@Injectable()
export class SharpImageColorAnalyzer {
    async analyze(image: FetchedImage): Promise<SharpImageColorResult> {
        try {
            const { channels, dominant } = await sharp(image.buffer).stats()

            return {
                // sharp는 전체 평균색과 히스토그램 기반 대표색을 빠르게 계산한다.
                averageColor: toImageColorValue(this.getAverageRgb(channels)),
                dominantColor: toImageColorValue([
                    dominant.r,
                    dominant.g,
                    dominant.b,
                ]),
            }
        } catch (_error) {
            throw new UnprocessableEntityException(
                'sharp로 이미지 색상을 추출할 수 없습니다.',
            )
        }
    }

    private getAverageRgb(
        channels: Stats['channels'],
    ): [number, number, number] {
        const red = channels[0]?.mean ?? 0
        const green = channels[1]?.mean ?? red
        const blue = channels[2]?.mean ?? red

        return [red, green, blue]
    }
}
