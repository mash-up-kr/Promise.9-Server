import { Module } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { JwtModule } from '@nestjs/jwt'
import { PassportModule } from '@nestjs/passport'

import { ValidatedEnvironment } from '../../config/environment'
import { UserModule } from '../user/user.module'

import { GoogleProvider } from './providers/google.provider'
import { JwtStrategy } from './strategies/jwt.strategy'
import { AuthController } from './auth.controller'
import { AuthService } from './auth.service'

@Module({
    imports: [
        UserModule,
        PassportModule,
        JwtModule.registerAsync({
            inject: [ConfigService],
            useFactory: (
                config: ConfigService<ValidatedEnvironment, true>,
            ) => ({
                secret: config.getOrThrow('JWT_ACCESS_SECRET', { infer: true }),
            }),
        }),
    ],
    controllers: [AuthController],
    providers: [AuthService, JwtStrategy, GoogleProvider],
    exports: [JwtStrategy, JwtModule],
})
export class AuthModule {}
