import { Module } from '@nestjs/common'

import { DatabaseModule } from '../../config/database/database.module'

import { RefreshTokenRepository } from './repository/refresh-token.repository'
import { SocialAccountRepository } from './repository/social-account.repository'
import { UserRepository } from './repository/user.repository'
import { UserController } from './user.controller'
import { UserService } from './user.service'

// user 도메인 스키마(users, social_accounts, refresh_tokens) 리포지토리를 제공·export한다.
// AuthModule이 이 리포지토리들을 재사용하며, 여기서 AuthModule을 import하지 않아 순환 참조가 없다.
// (JwtAuthGuard는 AppModule에 등록된 JwtStrategy로 전역 동작하므로 AuthModule import가 불필요)
@Module({
    imports: [DatabaseModule],
    controllers: [UserController],
    providers: [
        UserService,
        UserRepository,
        SocialAccountRepository,
        RefreshTokenRepository,
    ],
    exports: [UserRepository, SocialAccountRepository, RefreshTokenRepository],
})
export class UserModule {}
