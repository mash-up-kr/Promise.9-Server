import { Injectable } from '@nestjs/common'

import { BaseException } from '../../../common/exception/base.exception'
import { USER_ERROR } from '../user-error.constant'

import { NotificationSettingRepository } from './notification-setting.repository'
import {
    NotificationSettings,
    UpdateNotificationSettingsInput,
} from './notification-setting.type'

@Injectable()
export class NotificationSettingService {
    constructor(private readonly repository: NotificationSettingRepository) {}

    async find(userId: number): Promise<NotificationSettings> {
        const settings = await this.repository.find(userId)
        if (!settings) throw new BaseException(USER_ERROR.NOT_FOUND)
        return settings
    }

    async update(
        userId: number,
        input: UpdateNotificationSettingsInput,
    ): Promise<NotificationSettings> {
        const settings = await this.repository.update(userId, input)
        if (!settings) throw new BaseException(USER_ERROR.NOT_FOUND)
        return settings
    }
}
