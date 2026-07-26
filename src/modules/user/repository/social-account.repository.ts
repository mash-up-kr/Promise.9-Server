import { Injectable } from '@nestjs/common'
import { and, eq } from 'drizzle-orm'

import {
    DatabaseService,
    DbExecutor,
} from '../../../config/database/database.service'
import { socialAccounts } from '../schema/social-account.schema'

// 소셜 연동 계정 테이블 전용 데이터 접근 계층.
@Injectable()
export class SocialAccountRepository {
    constructor(private readonly databaseService: DatabaseService) {}

    private get db() {
        return this.databaseService.db
    }

    findByUserId(userId: number, executor: DbExecutor = this.db) {
        return executor.query.socialAccounts.findFirst({
            where: eq(socialAccounts.userId, userId),
        })
    }

    findByProviderUser(
        provider: string,
        providerUserId: string,
        executor: DbExecutor = this.db,
    ) {
        return executor.query.socialAccounts.findFirst({
            where: and(
                eq(socialAccounts.provider, provider),
                eq(socialAccounts.providerUserId, providerUserId),
            ),
        })
    }

    // 이미 연동된 계정((provider, providerUserId) 충돌)이면 doNothing 후 undefined를 반환한다.
    async insertIgnoreConflict(
        values: {
            userId: number
            provider: string
            providerUserId: string
            providerEmail: string | null
        },
        executor: DbExecutor = this.db,
    ) {
        const [row] = await executor
            .insert(socialAccounts)
            .values(values)
            .onConflictDoNothing()
            .returning({ userId: socialAccounts.userId })

        return row
    }

    async deleteByUserId(userId: number, executor: DbExecutor = this.db) {
        await executor
            .delete(socialAccounts)
            .where(eq(socialAccounts.userId, userId))
    }
}
