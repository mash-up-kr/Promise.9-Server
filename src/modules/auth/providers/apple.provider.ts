import { Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { createRemoteJWKSet, jwtVerify } from 'jose'

import { BaseException } from '../../../common/exception/base.exception'
import { ValidatedEnvironment } from '../../../config/environment'
import { AUTH_ERROR } from '../auth-error.constant'

import { SocialPayload, SocialProvider } from './social-provider.interface'

const APPLE_ISSUER = 'https://appleid.apple.com'
const APPLE_JWKS_URI = 'https://appleid.apple.com/auth/keys'

@Injectable()
export class AppleProvider implements SocialProvider {
    private readonly jwks = createRemoteJWKSet(new URL(APPLE_JWKS_URI))
    // iOS 네이티브(Bundle ID)와 웹 리다이렉트(Services ID) 플로우를 동시에 지원하기 위해
    // APPLE_CLIENT_ID는 콤마로 구분된 복수 audience를 받는다.
    private readonly clientIds: string[]

    constructor(config: ConfigService<ValidatedEnvironment, true>) {
        this.clientIds = config
            .getOrThrow('APPLE_CLIENT_ID', { infer: true })
            .split(',')
            .map((id) => id.trim())
            .filter(Boolean)
    }

    async verify(idToken: string): Promise<SocialPayload> {
        try {
            const { payload } = await jwtVerify(idToken, this.jwks, {
                issuer: APPLE_ISSUER,
                audience: this.clientIds,
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
