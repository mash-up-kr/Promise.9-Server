import { Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { JwtService } from '@nestjs/jwt'
import { randomUUID } from 'crypto'
import type { StringValue } from 'ms'

import { BaseException } from '../../common/exception/base.exception'
import { ValidatedEnvironment } from '../../config/environment'
import { RefreshTokenRepository } from '../user/repository/refresh-token.repository'
import { UserRepository } from '../user/repository/user.repository'

import { SupportedProvider } from './dto/auth.dto'
import { GoogleProvider } from './providers/google.provider'
import { SocialProvider } from './providers/social-provider.interface'
import { TOKEN_TYPE, TokenType } from './auth.constants'
import { AUTH_ERROR } from './auth-error.constant'
import { hashToken } from './crypto.utils'
import { parseExpiresIn } from './time.utils'

export interface TokenPair {
    accessToken: string
    refreshToken: string
}

export interface SocialLoginResult extends TokenPair {
    isNewUser: boolean
}

interface JwtRefreshPayload {
    sub: number
    type: TokenType
}

@Injectable()
export class AuthService {
    private readonly accessSecret: string
    private readonly refreshSecret: string
    private readonly accessExpiresIn: string
    private readonly refreshExpiresIn: string

    constructor(
        private readonly userRepository: UserRepository,
        private readonly refreshTokenRepository: RefreshTokenRepository,
        private readonly jwtService: JwtService,
        private readonly googleProvider: GoogleProvider,
        config: ConfigService<ValidatedEnvironment, true>,
    ) {
        this.accessSecret = config.getOrThrow('JWT_ACCESS_SECRET', {
            infer: true,
        })
        this.refreshSecret = config.getOrThrow('JWT_REFRESH_SECRET', {
            infer: true,
        })
        this.accessExpiresIn = config.getOrThrow('JWT_ACCESS_EXPIRES_IN', {
            infer: true,
        })
        this.refreshExpiresIn = config.getOrThrow('JWT_REFRESH_EXPIRES_IN', {
            infer: true,
        })
    }

    async socialLogin(
        provider: SupportedProvider,
        idToken: string,
    ): Promise<SocialLoginResult> {
        const socialProvider = this.getProvider(provider)
        const { providerId, email } = await socialProvider.verify(idToken)

        const { userId, isNewUser } =
            await this.userRepository.upsertWithSocialAccount({
                email,
                provider,
                providerUserId: providerId,
            })

        const tokens = await this.issueTokens(userId)
        return { ...tokens, isNewUser }
    }

    async refresh(rawRefreshToken: string): Promise<TokenPair> {
        const payload = this.verifyRefreshToken(rawRefreshToken)
        const tokenHash = hashToken(rawRefreshToken)

        // DB에 저장된 토큰과 대조해 탈취된 토큰으로 재사용하는 경우를 막는다.
        const stored = await this.refreshTokenRepository.findByHash(tokenHash)

        if (!stored) {
            throw new BaseException(AUTH_ERROR.INVALID_TOKEN)
        }

        // 이미 폐기된 토큰이 재사용됨 → 탈취로 간주, 해당 family 전체 폐기
        if (stored.revokedAt) {
            await this.refreshTokenRepository.deleteByFamily(stored.tokenFamily)
            throw new BaseException(AUTH_ERROR.INVALID_TOKEN)
        }

        // Refresh Token Rotation: 기존 토큰을 soft revoke하고 새 토큰 쌍을 발급한다.
        // 동일 family를 이어받아 rotation 체인을 유지한다.
        await this.refreshTokenRepository.revokeById(stored.id)

        return this.issueTokens(payload.sub, stored.tokenFamily)
    }

    async logout(rawRefreshToken: string): Promise<void> {
        const payload = this.verifyRefreshToken(rawRefreshToken)
        const tokenHash = hashToken(rawRefreshToken)

        await this.refreshTokenRepository.deleteByHashAndUser(
            tokenHash,
            payload.sub,
        )
    }

    async withdraw(rawRefreshToken: string): Promise<void> {
        const payload = this.verifyRefreshToken(rawRefreshToken)
        const tokenHash = hashToken(rawRefreshToken)

        const stored =
            await this.refreshTokenRepository.findActiveByHashAndUser(
                tokenHash,
                payload.sub,
            )

        if (!stored) {
            throw new BaseException(AUTH_ERROR.INVALID_TOKEN)
        }

        await this.userRepository.withdraw(payload.sub)
    }

    private getProvider(provider: SupportedProvider): SocialProvider {
        const providerMap: Record<string, SocialProvider> = {
            google: this.googleProvider,
            // TODO: 카카오 provider 추가 필요
            // kakao: this.kakaoProvider,
        }

        const resolved = providerMap[provider]
        if (!resolved) {
            throw new BaseException(AUTH_ERROR.UNSUPPORTED_PROVIDER)
        }

        return resolved
    }

    private async issueTokens(
        userId: number,
        tokenFamily: string = randomUUID(),
    ): Promise<TokenPair> {
        const accessToken = this.jwtService.sign(
            { sub: userId, type: TOKEN_TYPE.ACCESS },
            {
                secret: this.accessSecret,
                expiresIn: this.accessExpiresIn as StringValue,
            },
        )

        const rawRefreshToken = this.jwtService.sign(
            { sub: userId, type: TOKEN_TYPE.REFRESH },
            {
                secret: this.refreshSecret,
                expiresIn: this.refreshExpiresIn as StringValue,
            },
        )

        await this.refreshTokenRepository.insert({
            userId,
            tokenHash: hashToken(rawRefreshToken),
            tokenFamily,
            expiresAt: parseExpiresIn(this.refreshExpiresIn),
        })

        return { accessToken, refreshToken: rawRefreshToken }
    }

    private verifyRefreshToken(token: string): JwtRefreshPayload {
        try {
            const payload = this.jwtService.verify<JwtRefreshPayload>(token, {
                secret: this.refreshSecret,
            })

            if (payload.type !== TOKEN_TYPE.REFRESH) {
                throw new BaseException(AUTH_ERROR.INVALID_TOKEN)
            }

            return payload
        } catch (error) {
            // jsonwebtoken의 TokenExpiredError를 도메인 예외로 변환한다.
            if (error instanceof BaseException) {
                throw error
            }

            const name = (error as Error)?.name
            if (name === 'TokenExpiredError') {
                throw new BaseException(AUTH_ERROR.EXPIRED_TOKEN)
            }

            throw new BaseException(AUTH_ERROR.INVALID_TOKEN)
        }
    }
}
