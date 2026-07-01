import { HttpStatus } from '@nestjs/common'

import { BaseException } from '../../common/exception/base.exception'

export class ImageColorAnalysisFailedException extends BaseException {
    constructor(message = '이미지 색상을 추출할 수 없습니다.') {
        super(
            HttpStatus.UNPROCESSABLE_ENTITY,
            'IMAGE_COLOR_ANALYSIS_FAILED',
            message,
        )
    }
}
