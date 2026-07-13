import { Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { PassportStrategy } from '@nestjs/passport'
import { ExtractJwt, Strategy } from 'passport-jwt'

import { BaseException } from '../../../common/exception/base.exception'
import { AuthUser } from '../../../common/guards/jwt-auth.guard'
import { ValidatedEnvironment } from '../../../config/environment'
import { TOKEN_TYPE, TokenType } from '../auth.constants'
import { AUTH_ERROR } from '../auth-error.constant'

interface JwtPayload {
    sub: number
    type: TokenType
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
        if (payload.type !== TOKEN_TYPE.ACCESS) {
            throw new BaseException(AUTH_ERROR.INVALID_TOKEN)
        }
        return { userId: payload.sub }
    }
}
