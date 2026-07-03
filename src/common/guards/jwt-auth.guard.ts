import { Injectable } from '@nestjs/common'
import { AuthGuard } from '@nestjs/passport'

export interface AuthUser {
    userId: number
}

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {}
