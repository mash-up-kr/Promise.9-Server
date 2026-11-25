import { Injectable } from '@nestjs/common'
import { and, asc, eq, isNotNull, isNull, lte } from 'drizzle-orm'

import { DatabaseService } from '../../../config/database/database.service'
import { folders } from '../../folder/folder.schema'
import { notificationSettings } from '../../notification/notification.schema'
import { DEFAULT_NOTIFICATION_SETTINGS } from '../../user/notification-setting/notification-setting.constant'
import { users } from '../../user/schema/user.schema'
import { links } from '../link.schema'

import { ReminderEmailTarget } from './reminder.type'

@Injectable()
export class ReminderRepository {
    constructor(private readonly databaseService: DatabaseService) {}

    private get db() {
        return this.databaseService.db
    }

    async findEmailTargets(
        batchStartedAt: Date,
    ): Promise<ReminderEmailTarget[]> {
        const rows = await this.db
            .select({
                linkId: links.id,
                recipientEmail: users.email,
                title: links.title,
                originalUrl: links.originalUrl,
                finalUrl: links.finalUrl,
                reminderAt: links.reminderAt,
                createdAt: links.createdAt,
                memo: links.memo,
                folderName: folders.name,
                folderColor: folders.color,
                emailEnabled: notificationSettings.enabled,
            })
            .from(links)
            .innerJoin(users, eq(users.id, links.userId))
            .leftJoin(
                folders,
                and(
                    eq(folders.id, links.folderId),
                    eq(folders.userId, links.userId),
                    isNull(folders.deletedAt),
                ),
            )
            .leftJoin(
                notificationSettings,
                and(
                    eq(notificationSettings.userId, links.userId),
                    eq(notificationSettings.channel, 'email'),
                ),
            )
            .where(
                and(
                    isNotNull(links.reminderAt),
                    lte(links.reminderAt, batchStartedAt),
                    isNull(links.deletedAt),
                    isNull(users.deletedAt),
                ),
            )
            .orderBy(asc(links.reminderAt), asc(links.id))

        return rows.map((row) => ({
            ...row,
            reminderAt: row.reminderAt as Date,
            emailEnabled:
                row.emailEnabled ?? DEFAULT_NOTIFICATION_SETTINGS.email,
        }))
    }

    async markSent(
        linkId: number,
        scheduledAt: Date,
        sentAt: Date,
    ): Promise<boolean> {
        const rows = await this.db
            .update(links)
            .set({ reminderAt: null, updatedAt: sentAt })
            .where(
                and(
                    eq(links.id, linkId),
                    eq(links.reminderAt, scheduledAt),
                    isNull(links.deletedAt),
                ),
            )
            .returning({ id: links.id })

        return rows.length > 0
    }
}
