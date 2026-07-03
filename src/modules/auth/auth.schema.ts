import {
    bigint,
    bigserial,
    pgTable,
    timestamp,
    uniqueIndex,
    varchar,
} from 'drizzle-orm/pg-core'

import { users } from '../users/users.schema'

export const socialAccounts = pgTable(
    'social_accounts',
    {
        id: bigserial({ mode: 'number' }).primaryKey(),
        userId: bigint({ mode: 'number' })
            .notNull()
            .references(() => users.id),
        provider: varchar({ length: 50 }).notNull(),
        providerUserId: varchar({ length: 255 }).notNull(),
        providerEmail: varchar({ length: 255 }),
        connectedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
        createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
        updatedAt: timestamp({ withTimezone: true })
            .notNull()
            .defaultNow()
            .$onUpdateFn(() => new Date()),
    },
    (table) => [
        uniqueIndex('uq_social_accounts_provider_user').on(
            table.provider,
            table.providerUserId,
        ),
    ],
)

export const refreshTokens = pgTable('refresh_tokens', {
    id: bigserial({ mode: 'number' }).primaryKey(),
    userId: bigint({ mode: 'number' })
        .notNull()
        .references(() => users.id),
    token: varchar({ length: 512 }).notNull(),
    expiresAt: timestamp({ withTimezone: true }).notNull(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
})

export type SocialAccount = typeof socialAccounts.$inferSelect
export type NewSocialAccount = typeof socialAccounts.$inferInsert

export type RefreshToken = typeof refreshTokens.$inferSelect
export type NewRefreshToken = typeof refreshTokens.$inferInsert
