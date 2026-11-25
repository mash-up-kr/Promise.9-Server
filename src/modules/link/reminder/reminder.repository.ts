import { Injectable } from '@nestjs/common'
import { and, asc, eq, inArray, isNotNull, isNull, lte } from 'drizzle-orm'

import { DatabaseService } from '../../../config/database/database.service'
import { folders } from '../../folder/folder.schema'
import { notificationSettings } from '../../notification/notification.schema'
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
                userId: links.userId,
                recipientEmail: users.email,
                title: links.title,
                originalUrl: links.originalUrl,
                finalUrl: links.finalUrl,
                reminderAt: links.reminderAt,
                createdAt: links.createdAt,
                memo: links.memo,
                folderName: folders.name,
                folderColor: folders.color,
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
        }))
    }

    /** 이메일 수신을 끈 사용자 ID를 반환한다. 설정 행이 없으면 수신으로 본다. */
    async findEmailDisabledUserIds(userIds: number[]): Promise<number[]> {
        const rows = await this.db
            .select({ userId: notificationSettings.userId })
            .from(notificationSettings)
            .where(
                and(
                    inArray(notificationSettings.userId, userIds),
                    eq(notificationSettings.channel, 'email'),
                    eq(notificationSettings.enabled, false),
                ),
            )

        return rows.map((row) => row.userId)
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
