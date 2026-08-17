import { Injectable } from '@nestjs/common'
import { and, eq, isNull } from 'drizzle-orm'

import { BaseException } from '../../../common/exception/base.exception'
import {
    DatabaseService,
    DbExecutor,
} from '../../../config/database/database.service'
import { users } from '../schema/user.schema'
import { USER_ERROR } from '../user-error.constant'

import { SocialAccountRepository } from './social-account.repository'

// 회원(users) 테이블 접근과, users·social을 아우르는 user 도메인 트랜잭션을 담당한다.
@Injectable()
export class UserRepository {
    constructor(
        private readonly databaseService: DatabaseService,
        private readonly socialAccountRepository: SocialAccountRepository,
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
    // 이미 이 provider로 연동된 적이 있으면 그 회원으로 바로 로그인시킨다.
    // 처음 연동하는 provider인데 이메일이 기존 회원과 겹치면, provider 간 계정을
    // 자동으로 병합하지 않고 거부한다 — 이메일 소유를 검증해주지 않는 provider(Kakao
    // 등)가 있어, 병합을 허용하면 남의 이메일을 자칭해 계정을 탈취할 수 있기 때문이다.
    async upsertWithSocialAccount(input: {
        email: string
        provider: string
        providerUserId: string
    }): Promise<{ userId: number; isNewUser: boolean }> {
        return this.db.transaction(async (tx) => {
            const existingLink =
                await this.socialAccountRepository.findByProviderUser(
                    input.provider,
                    input.providerUserId,
                    tx,
                )

            if (existingLink) {
                return { userId: existingLink.userId, isNewUser: false }
            }

            const existingUser = await tx.query.users.findFirst({
                where: eq(users.email, input.email),
            })

            if (existingUser) {
                const existingSocial =
                    await this.socialAccountRepository.findByUserId(
                        existingUser.id,
                        tx,
                    )

                throw new BaseException({
                    ...USER_ERROR.EMAIL_ALREADY_REGISTERED,
                    message: existingSocial
                        ? `이미 ${existingSocial.provider} 계정으로 가입된 이메일입니다. ${existingSocial.provider}로 로그인해주세요.`
                        : USER_ERROR.EMAIL_ALREADY_REGISTERED.message,
                })
            }

            const [user] = await tx
                .insert(users)
                .values({ email: input.email })
                .returning({ id: users.id })

            await this.socialAccountRepository.insertIgnoreConflict(
                {
                    userId: user.id,
                    provider: input.provider,
                    providerUserId: input.providerUserId,
                    providerEmail: input.email,
                },
                tx,
            )

            return { userId: user.id, isNewUser: true }
        })
    }

    // 회원 탈퇴 시 user 도메인 정리: 소셜 연동을 지우고 유저는 hard delete 대신 soft delete한다.
    // (리프레시 토큰 삭제는 auth 도메인 소관이라 호출부인 AuthService가 같은 트랜잭션에서 함께 처리한다.)
    async deleteAccount(userId: number, executor: DbExecutor = this.db) {
        await this.socialAccountRepository.deleteByUserId(userId, executor)

        await executor
            .update(users)
            .set({ deletedAt: new Date() })
            .where(and(eq(users.id, userId), isNull(users.deletedAt)))
    }
}
