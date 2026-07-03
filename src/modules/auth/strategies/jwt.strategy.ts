import { Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { PassportStrategy } from '@nestjs/passport'
import { ExtractJwt, Strategy } from 'passport-jwt'

import { AuthUser } from '../../../common/guards/jwt-auth.guard'
import { ValidatedEnvironment } from '../../../config/environment'
import { InvalidTokenException } from '../auth.exception'

interface JwtPayload {
    sub: number
    type: string
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
    constructor(config: ConfigService<ValidatedEnvironment, true>) {
        super({
            jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
            ignoreExpiration: false,
            secretOrKey: config.getOrThrow('JWT_ACCESS_SECRET', {
                infer: true,
            }),
        })
    }

    validate(payload: JwtPayload): AuthUser {
        if (payload.type !== 'access') {
            throw new InvalidTokenException()
        }
        return { userId: payload.sub }
    }
}
