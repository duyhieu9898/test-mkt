import {
  pgTable,
  uuid,
  varchar,
  timestamp,
  jsonb,
  text,
  index,
  integer,
  decimal,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { companies } from './companies';
import { agents } from './agents';
import { tasks } from './tasks';

// Audit logs table
export const auditLogs = pgTable(
  'audit_logs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    companyId: uuid('company_id').references(() => companies.id, { onDelete: 'cascade' }),

    // Actor
    actorType: varchar('actor_type', { length: 20 }).notNull(),
    actorId: uuid('actor_id').notNull(),
    actorName: varchar('actor_name', { length: 100 }),

    // Action
    action: varchar('action', { length: 100 }).notNull(),
    resourceType: varchar('resource_type', { length: 50 }).notNull(),
    resourceId: uuid('resource_id'),

    // Details
    description: text('description'),
    changes: jsonb('changes').$type<{ before?: unknown; after?: unknown }>(),
    metadata: jsonb('metadata'),

    // Context
    ipAddress: varchar('ip_address', { length: 45 }),
    userAgent: text('user_agent'),
    requestId: varchar('request_id', { length: 100 }),

    // Status
    status: varchar('status', { length: 20 }).default('success'),
    errorMessage: text('error_message'),

    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => ({
    companyActionIdx: index('audit_company_action_idx').on(
      table.companyId,
      table.action,
      table.createdAt
    ),
    actorIdx: index('audit_actor_idx').on(table.actorType, table.actorId),
    resourceIdx: index('audit_resource_idx').on(table.resourceType, table.resourceId),
  })
);

// Action logs (agent actions)
export const actionLogs = pgTable(
  'action_logs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    companyId: uuid('company_id')
      .references(() => companies.id, { onDelete: 'cascade' })
      .notNull(),
    agentId: uuid('agent_id')
      .references(() => agents.id, { onDelete: 'cascade' })
      .notNull(),
    taskId: uuid('task_id').references(() => tasks.id, { onDelete: 'set null' }),

    // Action
    toolName: varchar('tool_name', { length: 100 }).notNull(),
    action: varchar('action', { length: 100 }).notNull(),

    // IO
    input: jsonb('input'),
    output: jsonb('output'),

    // Cost
    tokensUsed: integer('tokens_used'),
    promptTokens: integer('prompt_tokens'),
    completionTokens: integer('completion_tokens'),
    cost: decimal('cost', { precision: 10, scale: 6 }),
    latencyMs: integer('latency_ms'),

    // Status
    status: varchar('status', { length: 20 }).notNull(),
    errorType: varchar('error_type', { length: 100 }),
    errorMessage: text('error_message'),

    // Trace
    traceId: varchar('trace_id', { length: 100 }),
    spanId: varchar('span_id', { length: 100 }),

    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => ({
    agentToolIdx: index('action_agent_tool_idx').on(table.agentId, table.toolName),
    traceIdx: index('action_trace_idx').on(table.traceId),
    taskIdx: index('action_task_idx').on(table.taskId),
  })
);

// Relations
export const auditLogsRelations = relations(auditLogs, ({ one }) => ({
  company: one(companies, {
    fields: [auditLogs.companyId],
    references: [companies.id],
  }),
}));

export const actionLogsRelations = relations(actionLogs, ({ one }) => ({
  company: one(companies, {
    fields: [actionLogs.companyId],
    references: [companies.id],
  }),
  agent: one(agents, {
    fields: [actionLogs.agentId],
    references: [agents.id],
  }),
  task: one(tasks, {
    fields: [actionLogs.taskId],
    references: [tasks.id],
  }),
}));
