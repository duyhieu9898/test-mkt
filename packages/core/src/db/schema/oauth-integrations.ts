import {
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { companies } from './companies';
import { users } from './users';

/**
 * User-level OAuth integrations.
 *
 * App credentials such as GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET belong to
 * the SaaS app. Access and refresh tokens belong to the individual user who
 * completed OAuth, scoped to the company context where they connected it.
 */
export const oauthIntegrations = pgTable(
  'oauth_integrations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),

    provider: varchar('provider', { length: 80 }).notNull(),
    status: varchar('status', { length: 30 }).notNull().default('connected'),

    providerAccountId: text('provider_account_id'),
    providerAccountName: text('provider_account_name'),
    providerAccountEmail: text('provider_account_email'),

    accessToken: text('access_token').notNull(),
    refreshToken: text('refresh_token'),
    tokenExpiresAt: timestamp('token_expires_at'),
    scopes: jsonb('scopes').$type<string[]>().default([]).notNull(),

    connectedAt: timestamp('connected_at').notNull().defaultNow(),
    lastUsedAt: timestamp('last_used_at'),
    lastError: text('last_error'),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().default({}).notNull(),

    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (table) => ({
    companyUserProviderUnique: uniqueIndex('oauth_integrations_company_user_provider_uidx')
      .on(table.companyId, table.userId, table.provider),
    companyProviderIdx: index('oauth_integrations_company_provider_idx').on(table.companyId, table.provider),
    userProviderIdx: index('oauth_integrations_user_provider_idx').on(table.userId, table.provider),
    statusIdx: index('oauth_integrations_status_idx').on(table.status),
  }),
);

export const oauthIntegrationsRelations = relations(oauthIntegrations, ({ one }) => ({
  company: one(companies, {
    fields: [oauthIntegrations.companyId],
    references: [companies.id],
  }),
  user: one(users, {
    fields: [oauthIntegrations.userId],
    references: [users.id],
  }),
}));

export type OauthIntegration = typeof oauthIntegrations.$inferSelect;
export type NewOauthIntegration = typeof oauthIntegrations.$inferInsert;
