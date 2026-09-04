import { Injectable } from '@nestjs/common'
import { and, asc, eq, isNotNull, isNull, lte } from 'drizzle-orm'

import { DatabaseService } from '../../../config/database/database.service'
import { users } from '../../user/schema/user.schema'
import { links } from '../link.schema'

import { ReminderEmailTarget } from './reminder.type'

@Injectable()
export class ReminderRepository {
    constructor(private readonly databaseService: DatabaseService) {}

    private get db() {
        return this.databaseService.db
    }

    async findDue(batchStartedAt: Date): Promise<ReminderEmailTarget[]> {
        const rows = await this.db
            .select({
                linkId: links.id,
                recipientEmail: users.email,
                title: links.title,
                originalUrl: links.originalUrl,
                finalUrl: links.finalUrl,
                reminderAt: links.reminderAt,
            })
            .from(links)
            .innerJoin(users, eq(users.id, links.userId))
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
