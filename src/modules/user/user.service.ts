import { Injectable } from '@nestjs/common'
import { and, eq, isNull } from 'drizzle-orm'

import { BaseException } from '../../common/exception/base.exception'
import { DatabaseService } from '../../config/database/database.service'

import { socialAccounts } from './social-account.schema'
import { users } from './user.schema'
import { USER_ERROR } from './user-error.constant'

export interface MeResponse {
    userId: number
    email: string
    provider: string
    createdAt: Date
}

@Injectable()
export class UserService {
    private get db() {
        return this.databaseService.db
    }

    constructor(private readonly databaseService: DatabaseService) {}

    async getMe(userId: number): Promise<MeResponse> {
        const user = await this.db.query.users.findFirst({
            where: and(eq(users.id, userId), isNull(users.deletedAt)),
        })

        if (!user) {
            throw new BaseException(USER_ERROR.NOT_FOUND)
        }

        const socialAccount = await this.db.query.socialAccounts.findFirst({
            where: eq(socialAccounts.userId, userId),
        })

        return {
            userId: user.id,
            email: user.email,
            provider: socialAccount?.provider ?? 'unknown',
            createdAt: user.createdAt,
        }
    }
}
