import { Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { JwtService } from '@nestjs/jwt'
import { randomUUID } from 'crypto'
import { and, eq, isNull } from 'drizzle-orm'
import type { StringValue } from 'ms'

import { DatabaseService } from '../../config/database/database.service'
import { ValidatedEnvironment } from '../../config/environment'
import { refreshTokens } from '../user/refresh-token.schema'
import { socialAccounts } from '../user/social-account.schema'
import { users } from '../user/user.schema'

import { SupportedProvider } from './dto/auth.dto'
import { GoogleProvider } from './providers/google.provider'
import { SocialProvider } from './providers/social-provider.interface'
import { TOKEN_TYPE, TokenType } from './auth.constants'
import {
    ExpiredTokenException,
    InvalidTokenException,
    UnsupportedProviderException,
} from './auth.exception'
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

    private get db() {
        return this.databaseService.db
    }

    constructor(
        private readonly databaseService: DatabaseService,
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

        const { userId, isNewUser } = await this.db.transaction(async (tx) => {
            // 탈퇴 후 재가입 시 deletedAt을 초기화해 계정을 복구한다.
            const [user] = await tx
                .insert(users)
                .values({ email })
                .onConflictDoUpdate({
                    target: users.email,
                    set: { updatedAt: new Date(), deletedAt: null },
                })
                .returning({ id: users.id })

            // insert 성공(= 신규 소셜 연동)이면 isNewUser: true,
            // (provider, providerUserId) 충돌로 doNothing이 발동되면 기존 row를 조회해 isNewUser: false를 반환한다.
            const [inserted] = await tx
                .insert(socialAccounts)
                .values({
                    userId: user.id,
                    provider,
                    providerUserId: providerId,
                    providerEmail: email,
                })
                .onConflictDoNothing()
                .returning({ userId: socialAccounts.userId })

            if (inserted) {
                return { userId: user.id, isNewUser: true }
            }

            const existing = await tx.query.socialAccounts.findFirst({
                where: and(
                    eq(socialAccounts.provider, provider),
                    eq(socialAccounts.providerUserId, providerId),
                ),
            })

            return { userId: existing!.userId, isNewUser: false }
        })

        const tokens = await this.issueTokens(userId)
        return { ...tokens, isNewUser }
    }

    async refresh(rawRefreshToken: string): Promise<TokenPair> {
        const payload = this.verifyRefreshToken(rawRefreshToken)
        const tokenHash = hashToken(rawRefreshToken)

        // DB에 저장된 토큰과 대조해 탈취된 토큰으로 재사용하는 경우를 막는다.
        const stored = await this.db.query.refreshTokens.findFirst({
            where: eq(refreshTokens.tokenHash, tokenHash),
        })

        if (!stored) {
            throw new InvalidTokenException()
        }

        // 이미 폐기된 토큰이 재사용됨 → 탈취로 간주, 해당 family 전체 폐기
        if (stored.revokedAt) {
            await this.db
                .delete(refreshTokens)
                .where(eq(refreshTokens.tokenFamily, stored.tokenFamily))
            throw new InvalidTokenException()
        }

        // Refresh Token Rotation: 기존 토큰을 soft revoke하고 새 토큰 쌍을 발급한다.
        // 동일 family를 이어받아 rotation 체인을 유지한다.
        await this.db
            .update(refreshTokens)
            .set({ revokedAt: new Date() })
            .where(eq(refreshTokens.id, stored.id))

        return this.issueTokens(payload.sub, stored.tokenFamily)
    }

    async logout(rawRefreshToken: string): Promise<void> {
        const payload = this.verifyRefreshToken(rawRefreshToken)
        const tokenHash = hashToken(rawRefreshToken)

        await this.db
            .delete(refreshTokens)
            .where(
                and(
                    eq(refreshTokens.tokenHash, tokenHash),
                    eq(refreshTokens.userId, payload.sub),
                ),
            )
    }

    async withdraw(rawRefreshToken: string): Promise<void> {
        const payload = this.verifyRefreshToken(rawRefreshToken)
        const tokenHash = hashToken(rawRefreshToken)

        const stored = await this.db.query.refreshTokens.findFirst({
            where: and(
                eq(refreshTokens.tokenHash, tokenHash),
                eq(refreshTokens.userId, payload.sub),
                isNull(refreshTokens.revokedAt),
            ),
        })

        if (!stored) {
            throw new InvalidTokenException()
        }

        const userId = payload.sub

        // 리프레시 토큰·소셜 연동 정보를 먼저 지우고, 유저는 hard delete 대신 soft delete한다.
        await this.db.transaction(async (tx) => {
            await tx
                .delete(refreshTokens)
                .where(eq(refreshTokens.userId, userId))

            await tx
                .delete(socialAccounts)
                .where(eq(socialAccounts.userId, userId))

            await tx
                .update(users)
                .set({ deletedAt: new Date() })
                .where(and(eq(users.id, userId), isNull(users.deletedAt)))
        })
    }

    private getProvider(provider: SupportedProvider): SocialProvider {
        const providerMap: Record<string, SocialProvider> = {
            google: this.googleProvider,
            // TODO: 카카오 provider 추가 필요
            // kakao: this.kakaoProvider,
        }

        const resolved = providerMap[provider]
        if (!resolved) {
            throw new UnsupportedProviderException()
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

        await this.db.insert(refreshTokens).values({
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
                throw new InvalidTokenException()
            }

            return payload
        } catch (error) {
            // jsonwebtoken의 TokenExpiredError를 도메인 예외로 변환한다.
            if (
                error instanceof InvalidTokenException ||
                error instanceof ExpiredTokenException
            ) {
                throw error
            }

            const name = (error as Error)?.name
            if (name === 'TokenExpiredError') {
                throw new ExpiredTokenException()
            }

            throw new InvalidTokenException()
        }
    }
}
