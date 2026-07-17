import { HttpStatus } from '@nestjs/common'

export const LINK_ERROR = {
    NOT_FOUND: {
        code: HttpStatus.NOT_FOUND,
        errorCode: 930001,
        message: '링크를 찾을 수 없습니다.',
    },
    NOT_DELETED: {
        code: HttpStatus.CONFLICT,
        errorCode: 930002,
        message: '삭제된 링크가 아니므로 복구할 수 없습니다.',
    },
    ALREADY_EXISTS: {
        code: HttpStatus.CONFLICT,
        errorCode: 930003,
        message: '이미 저장한 링크입니다.',
    },
    // 네트워크·연결 오류 등 원문 요청 자체가 실패한 경우
    PREVIEW_FETCH_FAILED: {
        code: HttpStatus.BAD_GATEWAY,
        errorCode: 930004,
        message: '링크 미리보기 요청에 실패했습니다.',
    },
    // 제한 시간 안에 응답을 받지 못한 경우
    PREVIEW_TIMEOUT: {
        code: HttpStatus.GATEWAY_TIMEOUT,
        errorCode: 930005,
        message: '링크 미리보기 요청 시간이 초과되었습니다.',
    },
    // 원문 서버가 2xx가 아닌 상태(403·404·5xx 등)로 응답한 경우.
    // 실제 상태 코드는 message에 동적으로 덧붙인다.
    PREVIEW_BAD_STATUS: {
        code: HttpStatus.BAD_GATEWAY,
        errorCode: 930006,
        message: '링크 미리보기 대상 페이지가 정상적으로 응답하지 않았습니다.',
    },
    // 리다이렉트가 너무 많거나 Location이 없어 최종 페이지에 도달하지 못한 경우
    PREVIEW_REDIRECT_FAILED: {
        code: HttpStatus.BAD_GATEWAY,
        errorCode: 930007,
        message: '링크 미리보기 리다이렉트 처리에 실패했습니다.',
    },
} as const
