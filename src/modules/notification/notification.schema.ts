import { sql } from 'drizzle-orm'
import {
    bigint,
    boolean,
    check,
    foreignKey,
    index,
    pgTable,
    text,
    timestamp,
    unique,
    uuid,
    varchar,
} from 'drizzle-orm/pg-core'

import { links } from '../link/link.schema'
import { users } from '../user/schema/user.schema'

export const pushTokens = pgTable(
    'push_tokens',
    {
        id: bigint({ mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
        userId: bigint({ mode: 'number' })
            .notNull()
            .references(() => users.id, { onDelete: 'cascade' }),
        token: text().notNull().unique(),
        platform: varchar({ length: 10, enum: ['ios', 'android'] }).notNull(),
        createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
        updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    },
    (table) => [
        unique('push_tokens_id_user_id_unique').on(table.id, table.userId),
        check(
            'push_tokens_platform_check',
            sql`${table.platform} in ('ios', 'android')`,
        ),
        check('push_tokens_token_check', sql`length(trim(${table.token})) > 0`),
        index('push_tokens_user_id_idx').on(table.userId),
    ],
)

export const notificationSettings = pgTable(
    'notification_settings',
    {
        id: bigint({ mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
        userId: bigint({ mode: 'number' })
            .notNull()
            .references(() => users.id, { onDelete: 'cascade' }),
        channel: varchar({ length: 10, enum: ['email', 'push'] }).notNull(),
        enabled: boolean().notNull(),
        createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
        updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    },
    (table) => [
        unique('notification_settings_user_channel_unique').on(
            table.userId,
            table.channel,
        ),
        check(
            'notification_settings_channel_check',
            sql`${table.channel} in ('email', 'push')`,
        ),
    ],
)

export const emailHistories = pgTable(
    'email_histories',
    {
        id: bigint({ mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
        linkId: bigint({ mode: 'number' })
            .notNull()
            .references(() => links.id, { onDelete: 'cascade' }),
        // 회차 UUID는 스케줄러가 한 번 생성하고 모든 채널·재시도에서 재사용한다.
        occurrenceId: uuid().notNull(),
        status: varchar({
            length: 20,
            enum: ['PENDING', 'ACCEPTED', 'FAILED', 'UNKNOWN'],
        })
            .notNull()
            .default('PENDING'),
        sesMessageId: varchar({ length: 255 }),
        createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
        updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    },
    (table) => [
        unique('email_histories_link_occurrence_unique').on(
            table.linkId,
            table.occurrenceId,
        ),
        check(
            'email_histories_status_check',
            sql`${table.status} in ('PENDING', 'ACCEPTED', 'FAILED', 'UNKNOWN')`,
        ),
        check(
            'email_histories_accepted_message_check',
            sql`${table.status} <> 'ACCEPTED' or ${table.sesMessageId} is not null`,
        ),
        index('email_histories_status_updated_at_idx').on(
            table.status,
            table.updatedAt,
        ),
    ],
)

export const pushHistories = pgTable(
    'push_histories',
    {
        id: bigint({ mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
        userId: bigint({ mode: 'number' }).notNull(),
        linkId: bigint({ mode: 'number' }).notNull(),
        occurrenceId: uuid().notNull(),
        pushTokenId: bigint({ mode: 'number' }),
        status: varchar({
            length: 20,
            enum: ['PENDING', 'ACCEPTED', 'RECEIPT_OK', 'FAILED', 'UNKNOWN'],
        })
            .notNull()
            .default('PENDING'),
        ticketId: varchar({ length: 255 }),
        errorCode: varchar({ length: 100 }),
        createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
        updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    },
    (table) => [
        foreignKey({
            name: 'push_histories_link_owner_fk',
            columns: [table.linkId, table.userId],
            foreignColumns: [links.id, links.userId],
        }).onDelete('cascade'),
        // shortcut: Drizzle 미지원 대상 컬럼은 0017 SQL에서 지정, FK 재생성 시 SET NULL (push_token_id) 유지.
        foreignKey({
            name: 'push_histories_token_owner_fk',
            columns: [table.pushTokenId, table.userId],
            foreignColumns: [pushTokens.id, pushTokens.userId],
        }).onDelete('set null'),
        unique('push_histories_link_occurrence_token_unique').on(
            table.linkId,
            table.occurrenceId,
            table.pushTokenId,
        ),
        check(
            'push_histories_status_check',
            sql`${table.status} in ('PENDING', 'ACCEPTED', 'RECEIPT_OK', 'FAILED', 'UNKNOWN')`,
        ),
        check(
            'push_histories_accepted_ticket_check',
            sql`${table.status} not in ('ACCEPTED', 'RECEIPT_OK') or ${table.ticketId} is not null`,
        ),
        index('push_histories_push_token_id_idx').on(table.pushTokenId),
        index('push_histories_status_updated_at_idx').on(
            table.status,
            table.updatedAt,
        ),
    ],
)

export type PushTokenRow = typeof pushTokens.$inferSelect
export type NotificationSettingRow = typeof notificationSettings.$inferSelect
export type EmailHistoryRow = typeof emailHistories.$inferSelect
export type PushHistoryRow = typeof pushHistories.$inferSelect
