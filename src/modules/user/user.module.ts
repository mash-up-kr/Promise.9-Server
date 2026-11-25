import { Module } from '@nestjs/common'

import { DatabaseModule } from '../../config/database/database.module'

import { NotificationSettingController } from './notification-setting/notification-setting.controller'
import { NotificationSettingRepository } from './notification-setting/notification-setting.repository'
import { NotificationSettingService } from './notification-setting/notification-setting.service'
import { PushTokenController } from './push-token/push-token.controller'
import { PushTokenRepository } from './push-token/push-token.repository'
import { PushTokenService } from './push-token/push-token.service'
import { SocialAccountRepository } from './repository/social-account.repository'
import { UserRepository } from './repository/user.repository'
import { UserController } from './user.controller'
import { UserService } from './user.service'

// user 도메인 스키마(users, social_accounts) 리포지토리를 제공·export한다.
// AuthModule이 이 리포지토리들을 재사용하며, 여기서 AuthModule을 import하지 않아 순환 참조가 없다.
// (JwtAuthGuard는 AppModule에 등록된 JwtStrategy로 전역 동작하므로 AuthModule import가 불필요)
@Module({
    imports: [DatabaseModule],
    controllers: [
        UserController,
        PushTokenController,
        NotificationSettingController,
    ],
    providers: [
        UserService,
        UserRepository,
        SocialAccountRepository,
        PushTokenService,
        PushTokenRepository,
        NotificationSettingService,
        NotificationSettingRepository,
    ],
    exports: [UserRepository, SocialAccountRepository, PushTokenRepository],
})
export class UserModule {}
