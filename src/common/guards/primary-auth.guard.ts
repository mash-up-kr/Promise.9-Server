import { Injectable } from '@nestjs/common'
import { AuthGuard } from '@nestjs/passport'

import { TOKEN_PURPOSE } from '../../modules/auth/auth.constants'
import { AUTH_ERROR } from '../../modules/auth/auth-error.constant'
import { BaseException } from '../exception/base.exception'

import { AuthUser } from './jwt-auth.guard'

// JwtAuthGuard와 달리 MASTER_ACCESS_TOKEN 우회를 상속하지 않는다(canActivate를
// override하지 않음) — 실제 서명된 JWT만 통과한다. purpose가 PRIMARY(소셜
// 로그인으로 직접 발급된 토큰)가 아니면 거부한다. extension-token 발급처럼
// "웹/앱 세션만 호출 가능"해야 하는 엔드포인트에 사용한다.
@Injectable()
export class PrimaryAuthGuard extends AuthGuard('jwt') {
    handleRequest<TUser = AuthUser>(
        error: unknown,
        user: TUser | false | null,
    ): TUser {
        const authUser = user as AuthUser | false | null

        if (error || !authUser || authUser.purpose !== TOKEN_PURPOSE.PRIMARY) {
            throw new BaseException(AUTH_ERROR.INVALID_TOKEN)
        }

        return user as TUser
    }
}
