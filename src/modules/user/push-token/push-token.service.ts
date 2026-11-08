import { Injectable } from '@nestjs/common'

import { PushTokenRepository } from './push-token.repository'
import {
    RegisterPushTokenInput,
    UnregisterPushTokenInput,
} from './push-token.type'

@Injectable()
export class PushTokenService {
    constructor(private readonly repository: PushTokenRepository) {}

    /** 앱에서 받은 토큰을 현재 사용자에게 등록하거나 갱신한다. */
    register(userId: number, input: RegisterPushTokenInput): Promise<void> {
        return this.repository.register(userId, input)
    }

    /** 현재 사용자와 해당 기기 토큰의 연결을 해제한다. */
    unregister(userId: number, input: UnregisterPushTokenInput): Promise<void> {
        return this.repository.unregister(userId, input.token)
    }
}
