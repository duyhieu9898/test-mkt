/**
 * CEO Inbox Schema
 *
 * Events requiring CEO/Founder attention:
 * - DECISION_REQUIRED: Needs human approval
 * - SYSTEM_ALERT: Critical system notifications
 * - SUCCESS_EVENT: Positive milestones achieved
 * - INFO: General updates
 */

import { pgTable, uuid, varchar, text, timestamp, jsonb, pgEnum, integer, index } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { companies } from './companies';
import { agents } from './agents';
import { tasks } from './tasks';

// Event types
export const ceoEventTypeEnum = pgEnum('ceo_event_type', [
  'decision_required',  // Needs human approval
  'system_alert',       // Critical system notification
  'success_event',      // Positive milestone
  'budget_alert',       // Budget-related
  'risk_alert',         // Risk monitoring alert
  'agent_escalation',   // Agent escalated issue
  'task_blocked',       // Task needs intervention
  'strategy_update',    // Strategy-related
  'info',               // General information
]);

// Event severity
export const ceoEventSeverityEnum = pgEnum('ceo_event_severity', [
  'critical',
  'high',
  'medium',
  'low',
  'info',
]);

// Event status
export const ceoEventStatusEnum = pgEnum('ceo_event_status', [
  'unread',
  'read',
  'action_taken',
  'dismissed',
  'expired',
]);

// CEO Inbox Events
export const ceoInboxEvents = pgTable('ceo_inbox_events', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id').notNull().references(() => companies.id, { onDelete: 'cascade' }),

  // Event details
  eventType: ceoEventTypeEnum('event_type').notNull(),
  severity: ceoEventSeverityEnum('severity').notNull(),
  status: ceoEventStatusEnum('status').default('unread').notNull(),

  // Content
  title: varchar('title', { length: 255 }).notNull(),
  description: text('description'),
  details: jsonb('details').$type<Record<string, unknown>>(),

  // Source
  sourceType: varchar('source_type', { length: 50 }), // 'agent', 'system', 'trigger', 'task'
  sourceId: uuid('source_id'),
  sourceAgentId: uuid('source_agent_id').references(() => agents.id, { onDelete: 'set null' }),

  // Related entities
  relatedTaskId: uuid('related_task_id').references(() => tasks.id, { onDelete: 'set null' }),
  relatedAgentId: uuid('related_agent_id').references(() => agents.id, { onDelete: 'set null' }),

  // Decision/Action required
  requiresDecision: integer('requires_decision').default(0),
  decisionOptions: jsonb('decision_options').$type<Array<{
    id: string;
    label: string;
    description?: string;
    action: string;
    params?: Record<string, unknown>;
    isRecommended?: boolean;
  }>>(),
  decisionDeadline: timestamp('decision_deadline'),
  decisionMade: varchar('decision_made', { length: 100 }),
  decisionMadeAt: timestamp('decision_made_at'),
  decisionMadeBy: uuid('decision_made_by'),

  // Expiration
  expiresAt: timestamp('expires_at'),

  // Timestamps
  createdAt: timestamp('created_at').defaultNow().notNull(),
  readAt: timestamp('read_at'),
  actionTakenAt: timestamp('action_taken_at'),
}, (table) => ({
  companyStatusIdx: index('ceo_inbox_company_status_idx').on(table.companyId, table.status),
  companySeverityIdx: index('ceo_inbox_company_severity_idx').on(table.companyId, table.severity),
  createdAtIdx: index('ceo_inbox_created_at_idx').on(table.createdAt),
}));

// Relations
export const ceoInboxEventsRelations = relations(ceoInboxEvents, ({ one }) => ({
  company: one(companies, {
    fields: [ceoInboxEvents.companyId],
    references: [companies.id],
  }),
  sourceAgent: one(agents, {
    fields: [ceoInboxEvents.sourceAgentId],
    references: [agents.id],
    relationName: 'sourceAgent',
  }),
  relatedAgent: one(agents, {
    fields: [ceoInboxEvents.relatedAgentId],
    references: [agents.id],
    relationName: 'relatedAgent',
  }),
  relatedTask: one(tasks, {
    fields: [ceoInboxEvents.relatedTaskId],
    references: [tasks.id],
  }),
}));

// Type exports
export type CEOInboxEvent = typeof ceoInboxEvents.$inferSelect;
export type CEOInboxEventInsert = typeof ceoInboxEvents.$inferInsert;
