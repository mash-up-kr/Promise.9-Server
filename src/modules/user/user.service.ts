import { Injectable } from '@nestjs/common'

import { BaseException } from '../../common/exception/base.exception'

import { SocialAccountRepository } from './repository/social-account.repository'
import { UserRepository } from './repository/user.repository'
import { MarketingTouch } from './user-attribution'
import { USER_ERROR } from './user-error.constant'

export interface UserAttributionResponse {
    userId: number
    utm: MarketingTouch | null
}

export interface MeResponse extends UserAttributionResponse {
    email: string
    provider: string
    createdAt: Date
}

@Injectable()
export class UserService {
    constructor(
        private readonly userRepository: UserRepository,
        private readonly socialAccountRepository: SocialAccountRepository,
    ) {}

    async getMe(userId: number): Promise<MeResponse> {
        const user = await this.userRepository.findActiveById(userId)

        if (!user) {
            throw new BaseException(USER_ERROR.NOT_FOUND)
        }

        const socialAccount =
            await this.socialAccountRepository.findByUserId(userId)

        return {
            userId: user.id,
            email: user.email,
            provider: socialAccount?.provider ?? 'unknown',
            createdAt: user.createdAt,
            utm: user.lastMarketingTouch,
        }
    }

    async syncAttribution(
        userId: number,
        touch: MarketingTouch,
    ): Promise<UserAttributionResponse> {
        const attribution = await this.userRepository.syncAttribution(
            userId,
            touch,
        )
        if (!attribution) throw new BaseException(USER_ERROR.NOT_FOUND)
        return {
            userId: attribution.userId,
            utm: attribution.lastMarketingTouch,
        }
    }
}
