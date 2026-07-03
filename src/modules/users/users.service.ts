import { Injectable } from '@nestjs/common'
import { and, eq, isNull } from 'drizzle-orm'

import { DatabaseService } from '../../config/database/database.service'
import { UserNotFoundException } from '../auth/auth.exception'
import { socialAccounts } from '../auth/auth.schema'

import { users } from './users.schema'

export interface MeResponse {
    userId: number
    email: string
    provider: string
    createdAt: Date
}

@Injectable()
export class UsersService {
    constructor(private readonly db: DatabaseService) {}

    async getMe(userId: number): Promise<MeResponse> {
        const user = await this.db.db.query.users.findFirst({
            where: and(eq(users.id, userId), isNull(users.deletedAt)),
        })

        if (!user) {
            throw new UserNotFoundException()
        }

        const socialAccount = await this.db.db.query.socialAccounts.findFirst({
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
