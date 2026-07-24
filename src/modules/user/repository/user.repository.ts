import { Injectable } from '@nestjs/common'
import { and, eq, isNull } from 'drizzle-orm'

import { DatabaseService } from '../../../config/database/database.service'
import { users } from '../schema/user.schema'

import { RefreshTokenRepository } from './refresh-token.repository'
import { SocialAccountRepository } from './social-account.repository'

// 회원(users) 테이블 접근과, users를 포함하는 다중 테이블 트랜잭션을 담당한다.
// social/refresh 리포지토리를 주입받아 트랜잭션을 이 계층 안에서 완결한다.
@Injectable()
export class UserRepository {
    constructor(
        private readonly databaseService: DatabaseService,
        private readonly socialAccountRepository: SocialAccountRepository,
        private readonly refreshTokenRepository: RefreshTokenRepository,
    ) {}

    private get db() {
        return this.databaseService.db
    }

    findActiveById(userId: number) {
        return this.db.query.users.findFirst({
            where: and(eq(users.id, userId), isNull(users.deletedAt)),
        })
    }

    // 소셜 로그인 시 회원을 upsert하고 소셜 계정을 연결한다.
    // 탈퇴 후 재가입이면 deletedAt을 초기화해 계정을 복구하고, 신규 연동 여부를 함께 반환한다.
    async upsertWithSocialAccount(input: {
        email: string
        provider: string
        providerUserId: string
    }): Promise<{ userId: number; isNewUser: boolean }> {
        return this.db.transaction(async (tx) => {
            const [user] = await tx
                .insert(users)
                .values({ email: input.email })
                .onConflictDoUpdate({
                    target: users.email,
                    set: { updatedAt: new Date(), deletedAt: null },
                })
                .returning({ id: users.id })

            // insert 성공(= 신규 소셜 연동)이면 isNewUser: true,
            // (provider, providerUserId) 충돌로 doNothing이 발동되면 기존 row를 조회해 false를 반환한다.
            const inserted =
                await this.socialAccountRepository.insertIgnoreConflict(
                    {
                        userId: user.id,
                        provider: input.provider,
                        providerUserId: input.providerUserId,
                        providerEmail: input.email,
                    },
                    tx,
                )

            if (inserted) {
                return { userId: user.id, isNewUser: true }
            }

            const existing =
                await this.socialAccountRepository.findByProviderUser(
                    input.provider,
                    input.providerUserId,
                    tx,
                )

            return { userId: existing!.userId, isNewUser: false }
        })
    }

    // 리프레시 토큰·소셜 연동 정보를 먼저 지우고, 유저는 hard delete 대신 soft delete한다.
    async withdraw(userId: number) {
        await this.db.transaction(async (tx) => {
            await this.refreshTokenRepository.deleteByUserId(userId, tx)
            await this.socialAccountRepository.deleteByUserId(userId, tx)

            await tx
                .update(users)
                .set({ deletedAt: new Date() })
                .where(and(eq(users.id, userId), isNull(users.deletedAt)))
        })
    }
}
