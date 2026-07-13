import { Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { OAuth2Client } from 'google-auth-library'

import { ValidatedEnvironment } from '../../../config/environment'
import { InvalidSocialTokenException } from '../auth.exception'

import { SocialPayload, SocialProvider } from './social-provider.interface'

@Injectable()
export class GoogleProvider implements SocialProvider {
    private readonly client = new OAuth2Client()
    private readonly clientId: string

    constructor(config: ConfigService<ValidatedEnvironment, true>) {
        this.clientId = config.getOrThrow('GOOGLE_CLIENT_ID', { infer: true })
    }

    async verify(idToken: string): Promise<SocialPayload> {
        try {
            const ticket = await this.client.verifyIdToken({
                idToken,
                audience: this.clientId,
            })
            const payload = ticket.getPayload()

            if (!payload?.sub || !payload?.email) {
                throw new InvalidSocialTokenException()
            }

            return { providerId: payload.sub, email: payload.email }
        } catch (error) {
            if (error instanceof InvalidSocialTokenException) throw error
            throw new InvalidSocialTokenException()
        }
    }
}
