import { Injectable } from '@nestjs/common'
import {
    and,
    asc,
    eq,
    exists,
    gt,
    inArray,
    isNotNull,
    isNull,
    lte,
    or,
    sql,
} from 'drizzle-orm'

import type { DatabaseService } from '../../../config/database/database.service'
import { folders } from '../../folder/folder.schema'
import {
    emailHistories,
    notificationSettings,
    pushHistories,
    pushTokens,
} from '../../notification/notification.schema'
import { users } from '../../user/schema/user.schema'
import { links } from '../link.schema'

import { RETRYABLE_PUSH_ERRORS } from './reminder.constant'
import type {
    PushHistoryResult,
    PushReceiptTarget,
    ReminderTarget,
} from './reminder.type'

type HistoryOwner = Pick<ReminderTarget, 'userId' | 'linkId' | 'occurrenceId'>
type HistoryTable = typeof emailHistories | typeof pushHistories

// 발송 대상에는 링크의 createdAt 등도 있어 이력 컬럼에 섞이지 않게 고른다.
const pickOwner = ({ userId, linkId, occurrenceId }: HistoryOwner) => ({
    userId,
    linkId,
    occurrenceId,
})

@Injectable()
export class ReminderRepository {
    constructor(private readonly databaseService: DatabaseService) {}

    private get db() {
        return this.databaseService.db
    }

    // 회차는 한 번만 만들어 모든 채널·재시도·중복 실행이 같은 값을 쓴다.
    async assignOccurrences(now: Date): Promise<void> {
        await this.db
            .update(links)
            .set({ reminderOccurrenceId: sql`gen_random_uuid()` })
            .where(
                and(
                    lte(links.reminderAt, now),
                    isNull(links.reminderOccurrenceId),
                    isNull(links.deletedAt),
                ),
            )
    }

    // 지금 회차의 발송 시각이 됐거나, 실패한 채널을 기한 안에 다시 보낼 링크
    async findTargets(now: Date, retrySince: Date): Promise<ReminderTarget[]> {
        const rows = await this.db
            .select({
                linkId: links.id,
                userId: links.userId,
                occurrenceId: links.reminderOccurrenceId,
                reminderAt: links.reminderAt,
                recipientEmail: users.email,
                title: links.title,
                originalUrl: links.originalUrl,
                finalUrl: links.finalUrl,
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
                    isNotNull(links.reminderOccurrenceId),
                    isNull(links.deletedAt),
                    isNull(users.deletedAt),
                    or(
                        lte(links.reminderAt, now),
                        this.hasCurrentHistory(
                            emailHistories,
                            eq(emailHistories.status, 'FAILED'),
                            gt(emailHistories.createdAt, retrySince),
                        ),
                        this.hasCurrentHistory(
                            pushHistories,
                            eq(pushHistories.status, 'FAILED'),
                            gt(pushHistories.createdAt, retrySince),
                            inArray(
                                pushHistories.errorCode,
                                RETRYABLE_PUSH_ERRORS,
                            ),
                        ),
                    ),
                ),
            )
            .orderBy(asc(links.id))

        if (rows.length === 0) return []

        const linkIds = rows.map((row) => row.linkId)
        const occurrenceIds = rows.map((row) => row.occurrenceId as string)
        const emailRows = await this.db
            .select({
                id: emailHistories.id,
                occurrenceId: emailHistories.occurrenceId,
                status: emailHistories.status,
                createdAt: emailHistories.createdAt,
            })
            .from(emailHistories)
            .where(
                and(
                    inArray(emailHistories.linkId, linkIds),
                    inArray(emailHistories.occurrenceId, occurrenceIds),
                ),
            )
        const pushRows = await this.db
            .select({
                id: pushHistories.id,
                occurrenceId: pushHistories.occurrenceId,
                pushTokenId: pushHistories.pushTokenId,
                status: pushHistories.status,
                errorCode: pushHistories.errorCode,
                createdAt: pushHistories.createdAt,
            })
            .from(pushHistories)
            .where(
                and(
                    inArray(pushHistories.linkId, linkIds),
                    inArray(pushHistories.occurrenceId, occurrenceIds),
                ),
            )
        const tokenRows = await this.db
            .select({
                id: pushTokens.id,
                userId: pushTokens.userId,
                token: pushTokens.token,
            })
            .from(pushTokens)
            .where(
                inArray(
                    pushTokens.userId,
                    rows.map((row) => row.userId),
                ),
            )
            .orderBy(asc(pushTokens.id))

        return rows.map((row) => {
            const emailHistory = emailRows.find(
                (history) => history.occurrenceId === row.occurrenceId,
            )

            return {
                ...row,
                occurrenceId: row.occurrenceId as string,
                emailHistory: emailHistory
                    ? { ...emailHistory, errorCode: null }
                    : null,
                // 다른 계정으로 옮겨간 기기는 이전 계정의 알림을 받지 않는다.
                pushTokens: tokenRows
                    .filter((token) => token.userId === row.userId)
                    .map(({ id, token }) => ({ id, token })),
                pushHistories: pushRows.filter(
                    (history) => history.occurrenceId === row.occurrenceId,
                ),
            }
        })
    }

    /** 해당 채널 수신을 끈 사용자 ID를 반환한다. 설정 행이 없으면 수신으로 본다. */
    async findDisabledUserIds(
        userIds: number[],
        channel: 'email' | 'push',
    ): Promise<number[]> {
        const rows = await this.db
            .select({ userId: notificationSettings.userId })
            .from(notificationSettings)
            .where(
                and(
                    inArray(notificationSettings.userId, userIds),
                    eq(notificationSettings.channel, channel),
                    eq(notificationSettings.enabled, false),
                ),
            )

        return rows.map((row) => row.userId)
    }

    // 유니크 제약으로 회차의 첫 발송을 한 번만 선점한다. 이미 있으면 undefined
    async insertEmailHistory(
        owner: HistoryOwner,
        now: Date,
    ): Promise<number | undefined> {
        const [row] = await this.db
            .insert(emailHistories)
            .values({ ...pickOwner(owner), createdAt: now, updatedAt: now })
            .onConflictDoNothing()
            .returning({ id: emailHistories.id })

        return row?.id
    }

    async insertPushHistory(
        owner: HistoryOwner,
        pushTokenId: number,
        now: Date,
    ): Promise<number | undefined> {
        const [row] = await this.db
            .insert(pushHistories)
            .values({
                ...pickOwner(owner),
                pushTokenId,
                createdAt: now,
                updatedAt: now,
            })
            .onConflictDoNothing()
            .returning({ id: pushHistories.id })

        return row?.id
    }

    // 실패 이력을 PENDING으로 바꾼 실행만 다시 보낸다.
    async retryEmailHistory(id: number, now: Date): Promise<boolean> {
        return this.retryHistory(emailHistories, id, now)
    }

    async retryPushHistory(id: number, now: Date): Promise<boolean> {
        return this.retryHistory(pushHistories, id, now)
    }

    async recordEmail(
        id: number,
        sesMessageId: string | null,
        now: Date,
    ): Promise<void> {
        await this.db
            .update(emailHistories)
            .set({
                status: sesMessageId ? 'ACCEPTED' : 'FAILED',
                sesMessageId,
                updatedAt: now,
            })
            .where(eq(emailHistories.id, id))
    }

    async recordPush(
        id: number,
        result: PushHistoryResult,
        now: Date,
    ): Promise<void> {
        await this.db
            .update(pushHistories)
            .set({
                status: result.status,
                // receipt 결과를 기록할 때는 접수 때의 ticket을 유지한다.
                ...(result.ticketId && { ticketId: result.ticketId }),
                errorCode: result.errorCode ?? null,
                updatedAt: now,
            })
            .where(eq(pushHistories.id, id))
    }

    // 발송 당시 소유자를 조건으로 지워, 다른 계정으로 옮겨간 기기는 지우지 않는다.
    async deletePushToken(id: number, userId: number): Promise<void> {
        await this.db
            .delete(pushTokens)
            .where(and(eq(pushTokens.id, id), eq(pushTokens.userId, userId)))
    }

    async findReceiptTargets(
        acceptedBefore: Date,
        acceptedSince: Date,
    ): Promise<PushReceiptTarget[]> {
        const rows = await this.db
            .select({
                id: pushHistories.id,
                userId: pushHistories.userId,
                pushTokenId: pushHistories.pushTokenId,
                ticketId: pushHistories.ticketId,
            })
            .from(pushHistories)
            .where(
                and(
                    eq(pushHistories.status, 'ACCEPTED'),
                    lte(pushHistories.updatedAt, acceptedBefore),
                    gt(pushHistories.updatedAt, acceptedSince),
                ),
            )

        return rows.map((row) => ({ ...row, ticketId: row.ticketId as string }))
    }

    // 회차가 그대로일 때만 일정을 마친다. 그사이 일정을 바꿨으면 새 일정을 남긴다.
    async markSent(
        linkId: number,
        occurrenceId: string,
        sentAt: Date,
    ): Promise<boolean> {
        const rows = await this.db
            .update(links)
            .set({ reminderAt: null, updatedAt: sentAt })
            .where(
                and(
                    eq(links.id, linkId),
                    eq(links.reminderOccurrenceId, occurrenceId),
                    isNotNull(links.reminderAt),
                    isNull(links.deletedAt),
                ),
            )
            .returning({ id: links.id })

        return rows.length > 0
    }

    // 첫 발송을 시도했지만 기한 안에 어느 채널로도 보내지 못한 일정을 마친다.
    async finishExpired(retrySince: Date, now: Date): Promise<number> {
        const rows = await this.db
            .update(links)
            .set({ reminderAt: null, updatedAt: now })
            .where(
                and(
                    lte(links.reminderAt, retrySince),
                    isNotNull(links.reminderOccurrenceId),
                    isNull(links.deletedAt),
                    or(
                        this.hasCurrentHistory(emailHistories),
                        this.hasCurrentHistory(pushHistories),
                    ),
                ),
            )
            .returning({ id: links.id })

        return rows.length
    }

    private hasCurrentHistory(
        table: HistoryTable,
        ...conditions: ReturnType<typeof eq>[]
    ) {
        return exists(
            this.db
                .select({ id: table.id })
                .from(table)
                .where(
                    and(
                        eq(table.linkId, links.id),
                        eq(table.occurrenceId, links.reminderOccurrenceId),
                        ...conditions,
                    ),
                ),
        )
    }

    private async retryHistory(
        table: HistoryTable,
        id: number,
        now: Date,
    ): Promise<boolean> {
        const rows = await this.db
            .update(table)
            .set({ status: 'PENDING', updatedAt: now })
            .where(and(eq(table.id, id), eq(table.status, 'FAILED')))
            .returning({ id: table.id })

        return rows.length > 0
    }
}
