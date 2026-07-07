import { ExecutionContext, Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { AuthGuard } from '@nestjs/passport'
import { Request } from 'express'
import { Observable } from 'rxjs'

import { ValidatedEnvironment } from '../../config/environment'

export interface AuthUser {
    userId: number
}

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
    constructor(
        private readonly config: ConfigService<ValidatedEnvironment, true>,
    ) {
        super()
    }

    canActivate(
        context: ExecutionContext,
    ): boolean | Promise<boolean> | Observable<boolean> {
        const masterToken = this.config.get('MASTER_ACCESS_TOKEN', {
            infer: true,
        })

        if (masterToken) {
            const request = context
                .switchToHttp()
                .getRequest<Request & { user: AuthUser }>()
            const token = request.headers.authorization?.split(' ')[1]

            if (token === masterToken) {
                const masterId =
                    this.config.get('MASTER_USER_ID', { infer: true }) ?? 1
                request.user = { userId: masterId }
                return true
            }
        }

        return super.canActivate(context)
    }
}
