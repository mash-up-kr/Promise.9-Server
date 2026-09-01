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
const KAKAO_TOKEN_REQUEST_TIMEOUT_MS = 5_000

@Injectable()
export class KakaoProvider implements SocialProvider {
    private readonly jwks = createRemoteJWKSet(new URL(KAKAO_JWKS_URI))
    private readonly clientId: string
    private readonly clientSecret?: string
    // 네이티브 SDK가 발급하는 id_token의 aud는 REST API 키가 아니라 네이티브
    // 앱 키라서, 검증 시에는 두 값을 모두 허용해야 한다.
    private readonly verifyAudiences: string[]

    constructor(config: ConfigService<ValidatedEnvironment, true>) {
        this.clientId = config.getOrThrow('KAKAO_CLIENT_ID', { infer: true })
        this.clientSecret = config.get('KAKAO_CLIENT_SECRET', { infer: true })
        const nativeAppKey = config.getOrThrow('KAKAO_NATIVE_APP_KEY', {
            infer: true,
        })
        this.verifyAudiences = [this.clientId, nativeAppKey]
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

        try {
            const response = await fetch(KAKAO_TOKEN_URI, {
                method: 'POST',
                headers: {
                    'Content-Type':
                        'application/x-www-form-urlencoded;charset=utf-8',
                },
                body: params,
                // 인증 없이 호출 가능한 엔드포인트라, Kakao 쪽이 응답을 지연시키면
                // outbound 연결이 쌓여 서버 자원을 소진할 수 있어 타임아웃을 건다.
                signal: AbortSignal.timeout(KAKAO_TOKEN_REQUEST_TIMEOUT_MS),
            })

            if (!response.ok) {
                // rate limit(429)·Kakao 장애(5xx)는 우리 요청이 아니라 Kakao
                // 쪽 문제이므로, 클라이언트에게 code/redirectUri를 의심하게
                // 만드는 400 대신 502로 구분해서 알린다.
                if (response.status === 429 || response.status >= 500) {
                    throw new BaseException(
                        AUTH_ERROR.KAKAO_UPSTREAM_UNAVAILABLE,
                    )
                }
                throw new BaseException(AUTH_ERROR.KAKAO_EXCHANGE_FAILED)
            }

            const data = (await response.json().catch(() => null)) as {
                id_token?: string
            } | null

            if (typeof data?.id_token !== 'string') {
                throw new BaseException(AUTH_ERROR.KAKAO_EXCHANGE_FAILED)
            }

            return data.id_token
        } catch (error) {
            if (error instanceof BaseException) throw error
            // fetch 자체가 실패한 경우(네트워크 오류, 타임아웃 등)도 우리가
            // 아니라 Kakao 쪽 문제이므로 동일하게 502로 다룬다.
            throw new BaseException(AUTH_ERROR.KAKAO_UPSTREAM_UNAVAILABLE)
        }
    }

    async verify(idToken: string): Promise<SocialPayload> {
        try {
            const { payload } = await jwtVerify(idToken, this.jwks, {
                issuer: KAKAO_ISSUER,
                audience: this.verifyAudiences,
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
