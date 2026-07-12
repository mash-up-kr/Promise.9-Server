import { HttpStatus } from '@nestjs/common'

export const IMAGE_FETCHER_ERROR = {
    FETCH_FAILED: {
        code: HttpStatus.BAD_GATEWAY,
        errorCode: 402001,
        message: '이미지 URL 요청에 실패했습니다.',
    },
    INVALID_RESPONSE_STATUS: {
        code: HttpStatus.BAD_GATEWAY,
        errorCode: 402001,
        message: '이미지 요청이 정상적으로 처리되지 않았습니다.',
    },
    TOO_MANY_REDIRECTS: {
        code: HttpStatus.BAD_GATEWAY,
        errorCode: 402001,
        message: '이미지 URL 리다이렉트 횟수가 너무 많습니다.',
    },
    REDIRECT_FAILED: {
        code: HttpStatus.BAD_GATEWAY,
        errorCode: 402001,
        message: '이미지 URL 리다이렉트 처리에 실패했습니다.',
    },
    REDIRECT_LOCATION_MISSING: {
        code: HttpStatus.BAD_GATEWAY,
        errorCode: 402001,
        message: '이미지 URL 리다이렉트 위치가 없습니다.',
    },
    EMPTY_RESPONSE: {
        code: HttpStatus.BAD_GATEWAY,
        errorCode: 402001,
        message: '이미지 응답이 비어 있습니다.',
    },
    FETCH_TIMEOUT: {
        code: HttpStatus.GATEWAY_TIMEOUT,
        errorCode: 402002,
        message: '이미지 요청 시간이 초과되었습니다.',
    },
    TOO_LARGE: {
        code: HttpStatus.PAYLOAD_TOO_LARGE,
        errorCode: 402003,
        message: '이미지 크기가 제한을 초과했습니다.',
    },
    UNSUPPORTED_CONTENT_TYPE: {
        code: HttpStatus.UNSUPPORTED_MEDIA_TYPE,
        errorCode: 402004,
        message: '이미지 응답의 Content-Type이 지원되지 않습니다.',
    },
} as const
