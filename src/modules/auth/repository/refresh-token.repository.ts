import { Injectable } from '@nestjs/common'
import { and, eq, isNull } from 'drizzle-orm'

import {
    DatabaseService,
    DbExecutor,
} from '../../../config/database/database.service'
import { refreshTokens } from '../schema/refresh-token.schema'

// 리프레시 토큰 테이블 전용 데이터 접근 계층.
// 모든 메서드는 executor(기본은 일반 커넥션)를 받아 트랜잭션 안에서도 재사용된다.
@Injectable()
export class RefreshTokenRepository {
    constructor(private readonly databaseService: DatabaseService) {}

    private get db() {
        return this.databaseService.db
    }

    findByHash(tokenHash: string, executor: DbExecutor = this.db) {
        return executor.query.refreshTokens.findFirst({
            where: eq(refreshTokens.tokenHash, tokenHash),
        })
    }

    findActiveByHashAndUser(
        tokenHash: string,
        userId: number,
        executor: DbExecutor = this.db,
    ) {
        return executor.query.refreshTokens.findFirst({
            where: and(
                eq(refreshTokens.tokenHash, tokenHash),
                eq(refreshTokens.userId, userId),
                isNull(refreshTokens.revokedAt),
            ),
        })
    }

    async insert(
        values: {
            userId: number
            tokenHash: string
            tokenFamily: string
            expiresAt: Date
        },
        executor: DbExecutor = this.db,
    ) {
        await executor.insert(refreshTokens).values(values)
    }

    async revokeById(id: number, executor: DbExecutor = this.db) {
        await executor
            .update(refreshTokens)
            .set({ revokedAt: new Date() })
            .where(eq(refreshTokens.id, id))
    }

    async deleteByFamily(tokenFamily: string, executor: DbExecutor = this.db) {
        await executor
            .delete(refreshTokens)
            .where(eq(refreshTokens.tokenFamily, tokenFamily))
    }

    async deleteByHashAndUser(
        tokenHash: string,
        userId: number,
        executor: DbExecutor = this.db,
    ) {
        await executor
            .delete(refreshTokens)
            .where(
                and(
                    eq(refreshTokens.tokenHash, tokenHash),
                    eq(refreshTokens.userId, userId),
                ),
            )
    }

    async deleteByUserId(userId: number, executor: DbExecutor = this.db) {
        await executor
            .delete(refreshTokens)
            .where(eq(refreshTokens.userId, userId))
    }
}
