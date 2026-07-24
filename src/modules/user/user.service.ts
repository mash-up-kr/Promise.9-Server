import { Injectable } from '@nestjs/common'

import { BaseException } from '../../common/exception/base.exception'

import { SocialAccountRepository } from './repository/social-account.repository'
import { UserRepository } from './repository/user.repository'
import { USER_ERROR } from './user-error.constant'

export interface MeResponse {
    userId: number
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
        }
    }
}
