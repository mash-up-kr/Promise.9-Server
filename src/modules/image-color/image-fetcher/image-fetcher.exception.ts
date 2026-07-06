import { HttpStatus } from '@nestjs/common'

import { BaseException } from '../../../common/exception/base.exception'

export class ImageFetchFailedException extends BaseException {
    constructor(message = '이미지 URL 요청에 실패했습니다.') {
        super(HttpStatus.BAD_GATEWAY, 'IMAGE_FETCH_FAILED', message)
    }
}

export class ImageFetchTimeoutException extends BaseException {
    constructor() {
        super(
            HttpStatus.GATEWAY_TIMEOUT,
            'IMAGE_FETCH_TIMEOUT',
            '이미지 요청 시간이 초과되었습니다.',
        )
    }
}

export class ImageTooLargeException extends BaseException {
    constructor(maxBytes: number) {
        super(
            HttpStatus.PAYLOAD_TOO_LARGE,
            'IMAGE_TOO_LARGE',
            `이미지 크기는 ${maxBytes} bytes를 초과할 수 없습니다.`,
        )
    }
}

export class UnsupportedImageContentTypeException extends BaseException {
    constructor() {
        super(
            HttpStatus.UNSUPPORTED_MEDIA_TYPE,
            'IMAGE_UNSUPPORTED_CONTENT_TYPE',
            '이미지 응답의 Content-Type이 지원되지 않습니다.',
        )
    }
}
