import { and, eq, isNull } from 'drizzle-orm'

import { BaseException } from '../../../common/exception/base.exception'
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

    // users_email_active_unique는 활성 회원만 유니크하다. 조회 시점엔 없던
    // 이메일이 INSERT 시점엔 동시 요청으로 생겨 있을 수 있는 경합을, 처리되지
    // 않은 DB 오류(23505) 대신 도메인 예외로 변환하는지 확인한다.
    it('INSERT가 unique 제약(23505)에 걸리면 EMAIL_ALREADY_REGISTERED로 변환한다', async () => {
        const conflictError = Object.assign(new Error('duplicate key'), {
            code: '23505',
        })
        const tx = {
            query: {
                users: { findFirst: jest.fn().mockResolvedValue(undefined) },
            },
            insert: jest.fn().mockReturnValue({
                values: jest.fn().mockReturnValue({
                    returning: jest.fn().mockRejectedValue(conflictError),
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
        } as unknown as SocialAccountRepository
        const repository = new UserRepository(
            databaseService,
            socialAccountRepository,
        )

        await expect(
            repository.upsertWithSocialAccount({
                email: 'user@example.com',
                provider: 'google',
                providerUserId: 'provider-id',
            }),
        ).rejects.toThrow(BaseException)
    })
})
