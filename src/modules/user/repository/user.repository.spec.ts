import { and, eq, isNull } from 'drizzle-orm'

import { DatabaseService } from '../../../config/database/database.service'
import { users } from '../schema/user.schema'

import { SocialAccountRepository } from './social-account.repository'
import { UserRepository } from './user.repository'

describe('UserRepository.upsertWithSocialAccount', () => {
    // 회원 탈퇴(soft delete) 후 같은 이메일로 재로그인하면, deletedAt 필터가
    // 없을 때 탈퇴한 계정과 충돌해 영원히 로그인이 막히는 회귀 버그의 재현 테스트.
    it('이메일로 기존 회원을 찾을 때 소프트 삭제된 회원은 제외한다', async () => {
        const tx = {
            query: {
                users: { findFirst: jest.fn().mockResolvedValue(undefined) },
            },
            insert: jest.fn().mockReturnValue({
                values: jest.fn().mockReturnValue({
                    returning: jest.fn().mockResolvedValue([{ id: 1 }]),
                }),
            }),
        }
        const databaseService = {
            db: {
                transaction: jest.fn((callback: (tx: unknown) => unknown) =>
                    callback(tx),
                ),
            },
        } as unknown as DatabaseService
        const socialAccountRepository = {
            findByProviderUser: jest.fn().mockResolvedValue(undefined),
            insertIgnoreConflict: jest.fn().mockResolvedValue({ userId: 1 }),
        } as unknown as SocialAccountRepository
        const repository = new UserRepository(
            databaseService,
            socialAccountRepository,
        )

        await repository.upsertWithSocialAccount({
            email: 'user@example.com',
            provider: 'google',
            providerUserId: 'provider-id',
        })

        expect(tx.query.users.findFirst).toHaveBeenCalledWith({
            where: and(
                eq(users.email, 'user@example.com'),
                isNull(users.deletedAt),
            ),
        })
    })
})
