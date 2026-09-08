import { createPrivateKey } from 'node:crypto'

import { Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import {
    createRemoteJWKSet,
    EncryptJWT,
    jwtDecrypt,
    jwtVerify,
    SignJWT,
} from 'jose'

import { BaseException } from '../../../common/exception/base.exception'
import { ValidatedEnvironment } from '../../../config/environment'
import { AUTH_ERROR } from '../auth-error.constant'

import { SocialPayload, SocialProvider } from './social-provider.interface'

const APPLE_ISSUER = 'https://appleid.apple.com'
const APPLE_JWKS_URI = 'https://appleid.apple.com/auth/keys'
const APPLE_REQUEST_TIMEOUT_MS = 5_000

@Injectable()
export class AppleProvider implements SocialProvider {
    private readonly jwks = createRemoteJWKSet(new URL(APPLE_JWKS_URI))
    private readonly clientIds: string[]
    private readonly teamId: string
    private readonly keyId: string
    private readonly privateKey: ReturnType<typeof createPrivateKey>
    private readonly encryptionKey: Buffer

    constructor(config: ConfigService<ValidatedEnvironment, true>) {
        this.clientIds = config
            .getOrThrow('APPLE_CLIENT_ID', { infer: true })
            .split(',')
            .map((id) => id.trim())
            .filter(Boolean)
        this.teamId = config.getOrThrow('APPLE_TEAM_ID', { infer: true })
        this.keyId = config.getOrThrow('APPLE_KEY_ID', { infer: true })
        this.privateKey = createPrivateKey(
            config
                .getOrThrow('APPLE_PRIVATE_KEY', { infer: true })
                .replace(/\\n/g, '\n'),
        )
        const encryptionKey = config.getOrThrow('APPLE_TOKEN_ENCRYPTION_KEY', {
            infer: true,
        })
        this.encryptionKey = Buffer.from(encryptionKey, 'hex')
    }

    async verify(
        idToken: string,
        authorizationCode?: string,
        redirectUri?: string,
    ): Promise<SocialPayload> {
        if (!authorizationCode) {
            throw new BaseException(AUTH_ERROR.APPLE_EXCHANGE_FAILED)
        }
        const payload = await this.verifyPayload(idToken)
        const params = new URLSearchParams({
            grant_type: 'authorization_code',
            code: authorizationCode,
        })
        if (redirectUri) params.set('redirect_uri', redirectUri)

        const response = await this.post('token', payload.aud, params)
        const data = (await response.json().catch(() => null)) as {
            id_token?: string
            refresh_token?: string
        } | null
        if (
            !data?.id_token ||
            typeof data.id_token !== 'string' ||
            !data.refresh_token ||
            typeof data.refresh_token !== 'string'
        ) {
            throw new BaseException(AUTH_ERROR.APPLE_EXCHANGE_FAILED)
        }
        const exchanged = await this.verifyPayload(data.id_token)
        if (exchanged.sub !== payload.sub || exchanged.aud !== payload.aud) {
            throw new BaseException(AUTH_ERROR.INVALID_SOCIAL_TOKEN)
        }
        const encryptedToken = await new EncryptJWT({
            token: data.refresh_token,
        })
            .setSubject(payload.aud)
            .setProtectedHeader({ alg: 'dir', enc: 'A256GCM' })
            .encrypt(this.encryptionKey)

        return {
            providerId: payload.sub,
            email: payload.email,
            providerClientId: payload.aud,
            providerRefreshTokenEncrypted: encryptedToken,
        }
    }

    async revoke(encryptedToken: string, clientId: string): Promise<void> {
        try {
            const { payload } = await jwtDecrypt(
                encryptedToken,
                this.encryptionKey,
                {
                    subject: clientId,
                    keyManagementAlgorithms: ['dir'],
                    contentEncryptionAlgorithms: ['A256GCM'],
                },
            )
            if (typeof payload.token !== 'string' || !payload.token) {
                throw new BaseException(AUTH_ERROR.APPLE_REVOKE_FAILED)
            }
            await this.post(
                'revoke',
                clientId,
                new URLSearchParams({
                    token: payload.token,
                    token_type_hint: 'refresh_token',
                }),
            )
        } catch (error) {
            if (error instanceof BaseException) throw error
            throw new BaseException(AUTH_ERROR.APPLE_REVOKE_FAILED)
        }
    }

    private async verifyPayload(idToken: string) {
        try {
            const { payload } = await jwtVerify(idToken, this.jwks, {
                issuer: APPLE_ISSUER,
                audience: this.clientIds,
            })
            if (
                !payload.sub ||
                typeof payload.email !== 'string' ||
                typeof payload.aud !== 'string'
            ) {
                throw new BaseException(AUTH_ERROR.INVALID_SOCIAL_TOKEN)
            }
            return { sub: payload.sub, email: payload.email, aud: payload.aud }
        } catch {
            throw new BaseException(AUTH_ERROR.INVALID_SOCIAL_TOKEN)
        }
    }

    private async post(
        endpoint: 'token' | 'revoke',
        clientId: string,
        params: URLSearchParams,
    ): Promise<Response> {
        try {
            const clientSecret = await new SignJWT()
                .setProtectedHeader({ alg: 'ES256', kid: this.keyId })
                .setIssuer(this.teamId)
                .setAudience(APPLE_ISSUER)
                .setSubject(clientId)
                .setIssuedAt()
                .setExpirationTime('5m')
                .sign(this.privateKey)
            params.set('client_id', clientId)
            params.set('client_secret', clientSecret)

            const response = await fetch(`${APPLE_ISSUER}/auth/${endpoint}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                },
                body: params,
                signal: AbortSignal.timeout(APPLE_REQUEST_TIMEOUT_MS),
            })
            if (!response.ok) {
                if (response.status === 429 || response.status >= 500) {
                    throw new BaseException(
                        AUTH_ERROR.APPLE_UPSTREAM_UNAVAILABLE,
                    )
                }
                throw new BaseException(
                    endpoint === 'token'
                        ? AUTH_ERROR.APPLE_EXCHANGE_FAILED
                        : AUTH_ERROR.APPLE_REVOKE_FAILED,
                )
            }
            return response
        } catch (error) {
            if (error instanceof BaseException) throw error
            throw new BaseException(AUTH_ERROR.APPLE_UPSTREAM_UNAVAILABLE)
        }
    }
}
