import {
  index,
  integer,
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
import { agents } from './agents';
import { tasks } from './tasks';
import { users } from './users';

export type DeliverableType =
  | 'decision_memo'
  | 'campaign_brief'
  | 'content_plan'
  | 'market_report'
  | 'executive_report';

export type DeliverableStatus =
  | 'suggested'
  | 'generating'
  | 'ready_for_review'
  | 'approved'
  | 'published'
  | 'archived'
  | 'failed';

export interface DeliverableEvidence {
  id: string;
  sourceType: string;
  sourceId?: string;
  label: string;
  detail: string;
  link?: string;
  occurredAt?: string;
  score?: number;
}

/**
 * Structured content is renderer-independent. The web UI uses it today;
 * PDF/PPTX renderers can consume the same payload later without another LLM call.
 */
export interface DeliverableContent {
  issue: string;
  recommendation: string;
  expectedImpact?: string;
  evidenceSummary?: string;
  todayMove?: string;
  sevenDayMove?: string;
  campaignProposal?: Record<string, unknown>;
  strategicGap?: Record<string, unknown>;
  responsibilities?: Array<Record<string, unknown>>;
  teamTasks?: Array<Record<string, unknown>>;
}

export const deliverables = pgTable(
  'deliverables',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    taskId: uuid('task_id').references(() => tasks.id, { onDelete: 'set null' }),
    ownerAgentId: uuid('owner_agent_id').references(() => agents.id, { onDelete: 'set null' }),
    createdByUserId: uuid('created_by_user_id').references(() => users.id, { onDelete: 'set null' }),
    approvedByUserId: uuid('approved_by_user_id').references(() => users.id, { onDelete: 'set null' }),

    type: varchar('type', { length: 40 }).$type<DeliverableType>().notNull(),
    status: varchar('status', { length: 40 })
      .$type<DeliverableStatus>()
      .notNull()
      .default('ready_for_review'),
    priority: varchar('priority', { length: 20 }).notNull().default('medium'),
    title: varchar('title', { length: 300 }).notNull(),
    summary: text('summary'),
    content: jsonb('content').$type<DeliverableContent>().notNull(),
    evidence: jsonb('evidence').$type<DeliverableEvidence[]>().notNull().default([]),

    ownerDepartment: varchar('owner_department', { length: 120 }),
    language: varchar('language', { length: 10 }).notNull().default('en'),
    sourceType: varchar('source_type', { length: 60 }).notNull(),
    sourceId: varchar('source_id', { length: 255 }).notNull(),
    sourceActionIndex: integer('source_action_index'),
    sourceKey: varchar('source_key', { length: 400 }).notNull(),
    version: integer('version').notNull().default(1),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),

    approvedAt: timestamp('approved_at'),
    publishedAt: timestamp('published_at'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (table) => ({
    companyStatusIdx: index('deliverables_company_status_idx').on(table.companyId, table.status),
    companyTypeIdx: index('deliverables_company_type_idx').on(table.companyId, table.type),
    taskIdx: index('deliverables_task_idx').on(table.taskId),
    ownerAgentIdx: index('deliverables_owner_agent_idx').on(table.ownerAgentId),
    sourceUnique: uniqueIndex('deliverables_company_source_uidx')
      .on(table.companyId, table.sourceKey),
  }),
);

export const deliverablesRelations = relations(deliverables, ({ one }) => ({
  company: one(companies, {
    fields: [deliverables.companyId],
    references: [companies.id],
  }),
  task: one(tasks, {
    fields: [deliverables.taskId],
    references: [tasks.id],
  }),
  ownerAgent: one(agents, {
    fields: [deliverables.ownerAgentId],
    references: [agents.id],
  }),
  createdBy: one(users, {
    fields: [deliverables.createdByUserId],
    references: [users.id],
    relationName: 'deliverableCreator',
  }),
  approvedBy: one(users, {
    fields: [deliverables.approvedByUserId],
    references: [users.id],
    relationName: 'deliverableApprover',
  }),
}));

export type Deliverable = typeof deliverables.$inferSelect;
export type NewDeliverable = typeof deliverables.$inferInsert;
