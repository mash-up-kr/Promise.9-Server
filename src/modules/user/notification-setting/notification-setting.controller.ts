import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger'

import { CurrentUser } from '../../../common/decorators/current-user.decorator'
import { AuthUser, JwtAuthGuard } from '../../../common/guards/jwt-auth.guard'
import { ZodValidationPipe } from '../../../common/pipe/zod-validation.pipe'

import { NotificationSettingService } from './notification-setting.service'
import {
    ApiGetNotificationSettings,
    ApiUpdateNotificationSettings,
} from './notification-setting.swagger'
import {
    UpdateNotificationSettingsInput,
    updateNotificationSettingsSchema,
} from './notification-setting.type'

@ApiTags('Notification Setting')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('users/me/notification-settings')
export class NotificationSettingController {
    constructor(
        private readonly notificationSettingService: NotificationSettingService,
    ) {}

    @Get()
    @ApiGetNotificationSettings()
    find(@CurrentUser() user: AuthUser) {
        return this.notificationSettingService.find(user.userId)
    }

    @Patch()
    @ApiUpdateNotificationSettings()
    update(
        @CurrentUser() user: AuthUser,
        @Body(new ZodValidationPipe(updateNotificationSettingsSchema))
        input: UpdateNotificationSettingsInput,
    ) {
        return this.notificationSettingService.update(user.userId, input)
    }
}
