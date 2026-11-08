import { Injectable } from '@nestjs/common'

import { BaseException } from '../../../common/exception/base.exception'

import { PUSH_TOKEN_NOT_IMPLEMENTED_ERROR } from './push-token.constant'
import { RegisterPushTokenInput } from './push-token.type'

@Injectable()
export class PushTokenRepository {
    /** 스키마 PR #150 반영 후 token 기준 upsert 쿼리를 연결한다. */
    register(_userId: number, _input: RegisterPushTokenInput): Promise<void> {
        // TODO: 활성 회원 확인 후 전역 유니크 token의 userId·platform·updatedAt을 갱신한다.
        // 동일 토큰 재등록은 멱등하게 처리하고, 계정 전환 시 새 소유자에게 연결한다.
        throw new BaseException(PUSH_TOKEN_NOT_IMPLEMENTED_ERROR)
    }

    /** 인증된 사용자에게 연결된 토큰만 해제한다. 이미 없으면 성공으로 처리한다. */
    unregister(_userId: number, _token: string): Promise<void> {
        // TODO: userId와 token을 함께 WHERE 조건으로 사용해 원자적으로 삭제한다.
        // #150의 ON DELETE SET NULL에 따라 발송 이력은 유지한다.
        throw new BaseException(PUSH_TOKEN_NOT_IMPLEMENTED_ERROR)
    }
}
