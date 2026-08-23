import { Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { createRemoteJWKSet, jwtVerify } from 'jose'

import { BaseException } from '../../../common/exception/base.exception'
import { ValidatedEnvironment } from '../../../config/environment'
import { AUTH_ERROR } from '../auth-error.constant'

import { SocialPayload, SocialProvider } from './social-provider.interface'

const KAKAO_ISSUER = 'https://kauth.kakao.com'
const KAKAO_JWKS_URI = 'https://kauth.kakao.com/.well-known/jwks.json'

@Injectable()
export class KakaoProvider implements SocialProvider {
    private readonly jwks = createRemoteJWKSet(new URL(KAKAO_JWKS_URI))
    private readonly clientId: string

    constructor(config: ConfigService<ValidatedEnvironment, true>) {
        this.clientId = config.getOrThrow('KAKAO_CLIENT_ID', { infer: true })
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
