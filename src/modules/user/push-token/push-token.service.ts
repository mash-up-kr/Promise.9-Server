import { Injectable } from '@nestjs/common'

import { BaseException } from '../../../common/exception/base.exception'
import { USER_ERROR } from '../user-error.constant'

import { PushTokenRepository } from './push-token.repository'
import { RegisterPushTokenInput } from './push-token.type'

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
}
