import { Injectable } from '@nestjs/common'
import { and, eq, isNull } from 'drizzle-orm'

import {
    DatabaseService,
    DbExecutor,
} from '../../../config/database/database.service'
import { notificationSettings } from '../../notification/notification.schema'
import { users } from '../schema/user.schema'

import { DEFAULT_NOTIFICATION_SETTINGS } from './notification-setting.constant'
import {
    NotificationSettings,
    UpdateNotificationSettingsInput,
} from './notification-setting.type'

@Injectable()
export class NotificationSettingRepository {
    constructor(private readonly databaseService: DatabaseService) {}

    private get db() {
        return this.databaseService.db
    }

    /** 활성 회원의 수신 설정을 반환한다. 계정이 없거나 탈퇴했다면 undefined를 반환한다. */
    find(userId: number): Promise<NotificationSettings | undefined> {
        return this.findActive(userId, this.db)
    }

    /** 보낸 채널만 저장하고 변경 후 전체 설정을 반환한다. 계정이 없거나 탈퇴했다면 undefined를 반환한다. */
    update(
        userId: number,
        input: UpdateNotificationSettingsInput,
    ): Promise<NotificationSettings | undefined> {
        return this.db.transaction(async (tx) => {
            // 탈퇴와 겹친 변경을 막고, 같은 계정의 동시 변경이 서로의 응답을 섞지 않게 한다.
            const [user] = await tx
                .select({ id: users.id })
                .from(users)
                .where(and(eq(users.id, userId), isNull(users.deletedAt)))
                .for('update')
            if (!user) return undefined

            const now = new Date()
            for (const channel of ['email', 'push'] as const) {
                const enabled = input[channel]
                if (enabled === undefined) continue

                await tx
                    .insert(notificationSettings)
                    .values({ userId, channel, enabled })
                    .onConflictDoUpdate({
                        target: [
                            notificationSettings.userId,
                            notificationSettings.channel,
                        ],
                        set: { enabled, updatedAt: now },
                    })
            }

            return this.findActive(userId, tx)
        })
    }

    private async findActive(
        userId: number,
        executor: DbExecutor,
    ): Promise<NotificationSettings | undefined> {
        const rows = await executor
            .select({
                channel: notificationSettings.channel,
                enabled: notificationSettings.enabled,
            })
            .from(users)
            .leftJoin(
                notificationSettings,
                eq(notificationSettings.userId, users.id),
            )
            .where(and(eq(users.id, userId), isNull(users.deletedAt)))
        if (rows.length === 0) return undefined

        const settings: NotificationSettings = {
            ...DEFAULT_NOTIFICATION_SETTINGS,
        }
        for (const { channel, enabled } of rows) {
            if (channel && enabled !== null) settings[channel] = enabled
        }
        return settings
    }
}
