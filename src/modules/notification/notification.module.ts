import { Module } from '@nestjs/common'

import { PushModule } from '../../infrastructure/push/push.module'
import { UserModule } from '../user/user.module'

import { NotificationPushService } from './notification-push.service'

@Module({
    imports: [PushModule, UserModule],
    providers: [NotificationPushService],
    exports: [NotificationPushService],
})
export class NotificationModule {}
