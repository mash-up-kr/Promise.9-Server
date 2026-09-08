import { ConfigService } from '@nestjs/config'
import { JwtService } from '@nestjs/jwt'

jest.mock('jose', () => ({
    createRemoteJWKSet: jest.fn(() => jest.fn()),
    jwtVerify: jest.fn(),
}))

import { DatabaseService } from '../../config/database/database.service'
import { ValidatedEnvironment } from '../../config/environment'
import { SocialAccountRepository } from '../user/repository/social-account.repository'
import { UserRepository } from '../user/repository/user.repository'

import { AppleProvider } from './providers/apple.provider'
import { GoogleProvider } from './providers/google.provider'
import { KakaoProvider } from './providers/kakao.provider'
import { RefreshTokenRepository } from './repository/refresh-token.repository'
import { TOKEN_TYPE } from './auth.constants'
import { AuthService } from './auth.service'

describe('AuthService Apple account lifecycle', () => {
    function createFixture() {
        const transactionExecutor = {}
        const databaseService = {
            db: {
                transaction: jest.fn(
                    async (callback: (tx: unknown) => Promise<void>) =>
                        callback(transactionExecutor),
                ),
            },
        }
        const userRepository = {
            upsertWithSocialAccount: jest.fn().mockResolvedValue({
                userId: 1,
                isNewUser: true,
            }),
            deleteAccount: jest.fn().mockResolvedValue(undefined),
        }
        const socialAccountRepository = {
            findByUserId: jest.fn().mockResolvedValue({
                provider: 'apple',
                providerRefreshTokenEncrypted: 'encrypted-refresh-token',
                providerClientId: 'com.example.promise9',
            }),
        } as unknown as jest.Mocked<SocialAccountRepository>
        const refreshTokenRepository = {
            findActiveByHashAndUser: jest.fn().mockResolvedValue({ id: 1 }),
            deleteByUserId: jest.fn().mockResolvedValue(undefined),
        }
        const jwtService = {
            verify: jest.fn().mockReturnValue({
                sub: 1,
                type: TOKEN_TYPE.REFRESH,
            }),
        } as unknown as jest.Mocked<JwtService>
        const socialPayload = {
            providerId: 'social-user',
            email: 'user@example.com',
        }
        const googleProvider = {
            verify: jest.fn().mockResolvedValue(socialPayload),
        } as unknown as GoogleProvider
        const kakaoProvider = {
            verify: jest.fn().mockResolvedValue(socialPayload),
        } as unknown as KakaoProvider
        const appleProvider = {
            verify: jest.fn().mockResolvedValue({
                providerId: 'apple-user-id',
                email: 'user@example.com',
                providerRefreshTokenEncrypted: 'encrypted-refresh-token',
                providerClientId: 'com.example.promise9',
            }),
            revoke: jest.fn().mockResolvedValue(undefined),
        }
        const configValues = {
            JWT_ACCESS_SECRET: 'access-secret',
            JWT_REFRESH_SECRET: 'refresh-secret',
            JWT_ACCESS_EXPIRES_IN: '15m',
            JWT_REFRESH_EXPIRES_IN: '30d',
        }
        const config = {
            getOrThrow: jest.fn(
                (key: keyof typeof configValues) => configValues[key],
            ),
        } as unknown as ConfigService<ValidatedEnvironment, true>

        const service = new AuthService(
            databaseService as unknown as DatabaseService,
            userRepository as unknown as UserRepository,
            socialAccountRepository,
            refreshTokenRepository as unknown as RefreshTokenRepository,
            jwtService,
            googleProvider,
            kakaoProvider,
            appleProvider as unknown as AppleProvider,
            config,
        )

        return {
            service,
            databaseService,
            userRepository,
            socialAccountRepository,
            refreshTokenRepository,
            appleProvider,
            transactionExecutor,
        }
    }

    it('Apple 로그인 credential을 소셜 계정에 저장한다', async () => {
        const { service, userRepository, appleProvider } = createFixture()
        jest.spyOn(service, 'issueTokens').mockResolvedValue({
            accessToken: 'access-token',
            refreshToken: 'refresh-token',
        })

        const result = await service.socialLogin(
            'apple',
            'apple-id-token',
            'authorization-code',
        )

        expect(appleProvider.verify).toHaveBeenCalledWith(
            'apple-id-token',
            'authorization-code',
            undefined,
        )
        expect(userRepository.upsertWithSocialAccount).toHaveBeenCalledWith({
            email: 'user@example.com',
            provider: 'apple',
            providerUserId: 'apple-user-id',
            providerRefreshTokenEncrypted: 'encrypted-refresh-token',
            providerClientId: 'com.example.promise9',
        })
        expect(result).toEqual({
            accessToken: 'access-token',
            refreshToken: 'refresh-token',
            isNewUser: true,
        })
    })

    it('Apple revoke가 성공한 뒤 내부 계정을 삭제한다', async () => {
        const {
            service,
            databaseService,
            userRepository,
            refreshTokenRepository,
            appleProvider,
            transactionExecutor,
        } = createFixture()

        await service.withdraw('primary-refresh-token')

        expect(appleProvider.revoke).toHaveBeenCalledWith(
            'encrypted-refresh-token',
            'com.example.promise9',
        )
        expect(databaseService.db.transaction).toHaveBeenCalledTimes(1)
        expect(refreshTokenRepository.deleteByUserId).toHaveBeenCalledWith(
            1,
            transactionExecutor,
        )
        expect(userRepository.deleteAccount).toHaveBeenCalledWith(
            1,
            transactionExecutor,
        )
        expect(appleProvider.revoke.mock.invocationCallOrder[0]).toBeLessThan(
            databaseService.db.transaction.mock.invocationCallOrder[0],
        )
    })

    it('Apple revoke 실패 시 내부 계정을 삭제하지 않는다', async () => {
        const { service, databaseService, appleProvider } = createFixture()
        appleProvider.revoke.mockRejectedValue(new Error('Apple unavailable'))

        await expect(service.withdraw('primary-refresh-token')).rejects.toThrow(
            'Apple unavailable',
        )
        expect(databaseService.db.transaction).not.toHaveBeenCalled()
    })
})
