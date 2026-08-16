import { Module } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { JwtModule } from '@nestjs/jwt'
import { PassportModule } from '@nestjs/passport'

import { DatabaseModule } from '../../config/database/database.module'
import { ValidatedEnvironment } from '../../config/environment'
import { UserModule } from '../user/user.module'

import { AppleProvider } from './providers/apple.provider'
import { GoogleProvider } from './providers/google.provider'
import { KakaoProvider } from './providers/kakao.provider'
import { RefreshTokenRepository } from './repository/refresh-token.repository'
import { JwtStrategy } from './strategies/jwt.strategy'
import { AuthController } from './auth.controller'
import { AuthService } from './auth.service'

@Module({
    imports: [
        DatabaseModule,
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
    providers: [
        AuthService,
        RefreshTokenRepository,
        JwtStrategy,
        GoogleProvider,
        KakaoProvider,
        AppleProvider,
    ],
    exports: [JwtStrategy, JwtModule],
})
export class AuthModule {}
