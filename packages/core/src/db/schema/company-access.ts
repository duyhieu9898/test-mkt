import {
  index,
  pgTable,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { companies } from './companies';
import { users } from './users';

/**
 * Human team access inside a customer company.
 *
 * `companies.ownerId` remains the source of truth for the Owner role so old
 * companies keep working without a data backfill. Rows here represent every
 * additional collaborator invited into the company.
 */
export const companyMembers = pgTable(
  'company_members',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    role: varchar('role', { length: 40 }).notNull().default('viewer'),
    status: varchar('status', { length: 30 }).notNull().default('active'),
    invitedBy: uuid('invited_by').references(() => users.id, { onDelete: 'set null' }),
    invitedAt: timestamp('invited_at').defaultNow(),
    joinedAt: timestamp('joined_at').defaultNow(),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (table) => ({
    companyUserUnique: uniqueIndex('company_members_company_user_uidx')
      .on(table.companyId, table.userId),
    companyIdx: index('company_members_company_idx').on(table.companyId),
    userIdx: index('company_members_user_idx').on(table.userId),
    statusIdx: index('company_members_status_idx').on(table.status),
    roleIdx: index('company_members_role_idx').on(table.role),
  }),
);

export const companyMembersRelations = relations(companyMembers, ({ one }) => ({
  company: one(companies, {
    fields: [companyMembers.companyId],
    references: [companies.id],
  }),
  user: one(users, {
    fields: [companyMembers.userId],
    references: [users.id],
  }),
  inviter: one(users, {
    fields: [companyMembers.invitedBy],
    references: [users.id],
    relationName: 'companyMemberInviter',
  }),
}));

export type CompanyMember = typeof companyMembers.$inferSelect;
export type NewCompanyMember = typeof companyMembers.$inferInsert;
