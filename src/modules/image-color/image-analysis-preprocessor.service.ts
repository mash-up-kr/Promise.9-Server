import { Injectable } from '@nestjs/common'
import sharp from 'sharp'

import { BaseException } from '../../common/exception/base.exception'

import { FetchedImage } from './image-fetcher/image-fetcher.type'
import { IMAGE_COLOR_ANALYSIS_LIMIT } from './image-color.constants'
import { IMAGE_COLOR_ERROR } from './image-color-error.constant'

@Injectable()
export class ImageAnalysisPreprocessor {
    // 원본 픽셀 수를 제한한 뒤 두 분석기가 공유할 작은 PNG로 정규화한다.
    async prepare(image: FetchedImage): Promise<FetchedImage> {
        try {
            const buffer = await sharp(image.buffer, {
                failOn: 'error',
                limitInputPixels: IMAGE_COLOR_ANALYSIS_LIMIT.maxInputPixels,
            })
                .rotate()
                .resize({
                    width: IMAGE_COLOR_ANALYSIS_LIMIT.maxDimension,
                    height: IMAGE_COLOR_ANALYSIS_LIMIT.maxDimension,
                    fit: 'inside',
                    withoutEnlargement: true,
                })
                .png()
                .toBuffer()

            return {
                ...image,
                contentType: 'image/png',
                byteLength: buffer.byteLength,
                buffer,
            }
        } catch (_error) {
            throw new BaseException(IMAGE_COLOR_ERROR.ANALYSIS_FAILED)
        }
    }
}
