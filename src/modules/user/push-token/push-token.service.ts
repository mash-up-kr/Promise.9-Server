import { Injectable } from '@nestjs/common'

import { BaseException } from '../../../common/exception/base.exception'
import { USER_ERROR } from '../user-error.constant'

import { PushTokenRepository } from './push-token.repository'
import {
    RegisterPushTokenInput,
    UnregisterPushTokenInput,
} from './push-token.type'

@Injectable()
export class PushTokenService {
    constructor(private readonly repository: PushTokenRepository) {}

    /** 앱에서 받은 토큰을 현재 사용자에게 등록하거나 갱신한다. */
    async register(
        userId: number,
        input: RegisterPushTokenInput,
    ): Promise<void> {
        const registered = await this.repository.register(userId, input)
        if (!registered) throw new BaseException(USER_ERROR.NOT_FOUND)
    }

    /** 현재 사용자와 해당 기기 토큰의 연결을 해제한다. */
    async unregister(
        userId: number,
        input: UnregisterPushTokenInput,
    ): Promise<void> {
        const unregistered = await this.repository.unregister(
            userId,
            input.token,
        )
        if (!unregistered) throw new BaseException(USER_ERROR.NOT_FOUND)
    }
}
