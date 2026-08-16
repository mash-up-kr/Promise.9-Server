import { Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { createRemoteJWKSet, jwtVerify } from 'jose'

import { BaseException } from '../../../common/exception/base.exception'
import { ValidatedEnvironment } from '../../../config/environment'
import { AUTH_ERROR } from '../auth-error.constant'

import { SocialPayload, SocialProvider } from './social-provider.interface'

const KAKAO_ISSUER = 'https://kauth.kakao.com'
const KAKAO_JWKS_URI = 'https://kauth.kakao.com/.well-known/jwks.json'
const KAKAO_TOKEN_URI = 'https://kauth.kakao.com/oauth/token'

@Injectable()
export class KakaoProvider implements SocialProvider {
    private readonly jwks = createRemoteJWKSet(new URL(KAKAO_JWKS_URI))
    private readonly clientId: string
    private readonly clientSecret?: string

    constructor(config: ConfigService<ValidatedEnvironment, true>) {
        this.clientId = config.getOrThrow('KAKAO_CLIENT_ID', { infer: true })
        this.clientSecret = config.get('KAKAO_CLIENT_SECRET', { infer: true })
    }

    // 웹은 카카오 SDK 없이 authorization code만 받을 수 있어, 서버가 대신
    // code→token 교환을 수행해 id_token을 꺼내준다 (client_secret 노출 방지).
    async exchangeCodeForIdToken(
        code: string,
        redirectUri: string,
    ): Promise<string> {
        const params = new URLSearchParams({
            grant_type: 'authorization_code',
            client_id: this.clientId,
            redirect_uri: redirectUri,
            code,
        })
        if (this.clientSecret) {
            params.set('client_secret', this.clientSecret)
        }

        const response = await fetch(KAKAO_TOKEN_URI, {
            method: 'POST',
            headers: {
                'Content-Type':
                    'application/x-www-form-urlencoded;charset=utf-8',
            },
            body: params,
        })

        const data = (await response.json().catch(() => null)) as {
            id_token?: string
        } | null

        if (!response.ok || typeof data?.id_token !== 'string') {
            throw new BaseException(AUTH_ERROR.KAKAO_EXCHANGE_FAILED)
        }

        return data.id_token
    }

    async verify(idToken: string): Promise<SocialPayload> {
        try {
            const { payload } = await jwtVerify(idToken, this.jwks, {
                issuer: KAKAO_ISSUER,
                audience: this.clientId,
            })

            if (!payload.sub || typeof payload.email !== 'string') {
                throw new BaseException(AUTH_ERROR.INVALID_SOCIAL_TOKEN)
            }

            return { providerId: payload.sub, email: payload.email }
        } catch (error) {
            if (error instanceof BaseException) throw error
            throw new BaseException(AUTH_ERROR.INVALID_SOCIAL_TOKEN)
        }
    }
}
