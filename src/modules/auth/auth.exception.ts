import { HttpStatus } from '@nestjs/common'

import { BaseException } from '../../common/exception/base.exception'

export class InvalidTokenException extends BaseException {
    constructor() {
        super(
            HttpStatus.UNAUTHORIZED,
            'INVALID_TOKEN',
            '유효하지 않은 토큰입니다.',
        )
    }
}

export class ExpiredTokenException extends BaseException {
    constructor() {
        super(HttpStatus.UNAUTHORIZED, 'EXPIRED_TOKEN', '만료된 토큰입니다.')
    }
}

export class InvalidSocialTokenException extends BaseException {
    constructor() {
        super(
            HttpStatus.UNAUTHORIZED,
            'INVALID_SOCIAL_TOKEN',
            '소셜 ID 토큰 검증에 실패했습니다.',
        )
    }
}

export class UnsupportedProviderException extends BaseException {
    constructor() {
        super(
            HttpStatus.BAD_REQUEST,
            'UNSUPPORTED_PROVIDER',
            '지원하지 않는 소셜 로그인 제공자입니다.',
        )
    }
}

export class UserNotFoundException extends BaseException {
    constructor() {
        super(
            HttpStatus.NOT_FOUND,
            'USER_NOT_FOUND',
            '유저를 찾을 수 없습니다.',
        )
    }
}
