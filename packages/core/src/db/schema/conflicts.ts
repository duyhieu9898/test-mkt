import { pgTable, text, timestamp, uuid, jsonb, pgEnum, integer, boolean } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { companies } from './companies';
import { agents } from './agents';

// Conflict type enum
export const conflictTypeEnum = pgEnum('conflict_type', [
  'resource',         // Multiple agents competing for same resource
  'task',             // Conflicting task assignments
  'budget',           // Budget allocation conflicts
  'priority',         // Priority conflicts between agents
  'data',             // Data access/modification conflicts
  'schedule',         // Scheduling conflicts
  'dependency',       // Circular or conflicting dependencies
  'authority',        // Authority/permission conflicts
]);

// Conflict severity enum
export const conflictSeverityEnum = pgEnum('conflict_severity', [
  'critical',    // Blocking operations, immediate attention needed
  'high',        // Significant impact, needs resolution within hours
  'medium',      // Moderate impact, can wait for next planning cycle
  'low',         // Minor issue, informational
]);

// Conflict status enum
export const conflictStatusEnum = pgEnum('conflict_status', [
  'detected',         // Newly detected conflict
  'acknowledged',     // Human has seen it
  'investigating',    // Being analyzed
  'escalated',        // Escalated to higher authority (CEO agent or human)
  'awaiting_input',   // Waiting for human decision
  'resolved',         // Successfully resolved
  'dismissed',        // Marked as non-issue
  'auto_resolved',    // System automatically resolved
]);

// Resolution strategy enum
export const resolutionStrategyEnum = pgEnum('resolution_strategy', [
  'priority_based',   // Higher priority agent wins
  'first_come',       // First agent to request wins
  'round_robin',      // Alternate between agents
  'quota_based',      // Based on budget/resource quotas
  'human_decision',   // Escalate to human
  'ceo_decision',     // CEO agent decides
  'negotiation',      // Agents negotiate
  'merge',            // Combine requests where possible
  'defer',            // Postpone one request
  'cancel',           // Cancel conflicting requests
]);

// Agent conflicts table
export const agentConflicts = pgTable('agent_conflicts', {
  id: uuid('id').defaultRandom().primaryKey(),
  companyId: uuid('company_id').notNull().references(() => companies.id, { onDelete: 'cascade' }),

  // Conflict classification
  conflictType: conflictTypeEnum('conflict_type').notNull(),
  severity: conflictSeverityEnum('severity').notNull().default('medium'),
  status: conflictStatusEnum('status').notNull().default('detected'),

  // Title and description
  title: text('title').notNull(),
  description: text('description'),

  // Parties involved (at least 2 agents)
  involvedAgentIds: uuid('involved_agent_ids').array().notNull(),

  // Resource/task context
  resourceType: text('resource_type'),        // e.g., 'api_key', 'database', 'external_service'
  resourceId: text('resource_id'),            // Identifier of the contested resource
  taskIds: uuid('task_ids').array(),          // Related task IDs if applicable

  // Conflict details
  conflictDetails: jsonb('conflict_details').$type<{
    requests: Array<{
      agentId: string;
      agentName: string;
      action: string;
      requestedAt: string;
      parameters?: Record<string, unknown>;
    }>;
    resourceState?: Record<string, unknown>;
    constraints?: string[];
    impact?: {
      blockedTasks: number;
      affectedAgents: string[];
      estimatedDelay?: string;
    };
  }>(),

  // Resolution tracking
  resolutionStrategy: resolutionStrategyEnum('resolution_strategy'),
  resolvedBy: text('resolved_by'),            // 'system', agent ID, or user ID
  resolution: jsonb('resolution').$type<{
    action: string;
    winner?: string;
    details: string;
    compensations?: Array<{
      agentId: string;
      action: string;
    }>;
  }>(),
  resolvedAt: timestamp('resolved_at'),

  // Escalation tracking
  escalationLevel: integer('escalation_level').default(0),
  escalatedAt: timestamp('escalated_at'),
  escalationReason: text('escalation_reason'),

  // Auto-resolution attempts
  autoResolutionAttempts: integer('auto_resolution_attempts').default(0),
  lastAutoResolutionAt: timestamp('last_auto_resolution_at'),

  // Timeline
  detectedAt: timestamp('detected_at').defaultNow().notNull(),
  acknowledgedAt: timestamp('acknowledged_at'),
  acknowledgedBy: text('acknowledged_by'),

  // Metadata
  metadata: jsonb('metadata').$type<Record<string, unknown>>(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// Conflict resolution rules table
export const conflictResolutionRules = pgTable('conflict_resolution_rules', {
  id: uuid('id').defaultRandom().primaryKey(),
  companyId: uuid('company_id').notNull().references(() => companies.id, { onDelete: 'cascade' }),

  name: text('name').notNull(),
  description: text('description'),
  enabled: boolean('enabled').default(true).notNull(),
  priority: integer('priority').default(50).notNull(), // Higher = checked first

  // Rule conditions
  conflictTypes: conflictTypeEnum('conflict_types').array(), // null = all types
  severities: conflictSeverityEnum('severities').array(),    // null = all severities
  agentRoles: text('agent_roles').array(),                   // null = all roles
  resourceTypes: text('resource_types').array(),             // null = all resources

  // Resolution action
  strategy: resolutionStrategyEnum('strategy').notNull(),
  autoResolve: boolean('auto_resolve').default(false).notNull(),

  // Escalation settings
  escalateAfterMinutes: integer('escalate_after_minutes'),
  escalateTo: text('escalate_to'),  // 'ceo', 'human', specific agent ID

  // Metadata
  metadata: jsonb('metadata').$type<Record<string, unknown>>(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// Conflict history/events table
export const conflictEvents = pgTable('conflict_events', {
  id: uuid('id').defaultRandom().primaryKey(),
  conflictId: uuid('conflict_id').notNull().references(() => agentConflicts.id, { onDelete: 'cascade' }),

  eventType: text('event_type').notNull(), // detected, escalated, resolved, comment, etc.
  actorType: text('actor_type').notNull(), // system, agent, user
  actorId: text('actor_id'),

  description: text('description').notNull(),
  data: jsonb('data').$type<Record<string, unknown>>(),

  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// Relations
export const agentConflictsRelations = relations(agentConflicts, ({ one }) => ({
  company: one(companies, {
    fields: [agentConflicts.companyId],
    references: [companies.id],
  }),
}));

export const conflictResolutionRulesRelations = relations(conflictResolutionRules, ({ one }) => ({
  company: one(companies, {
    fields: [conflictResolutionRules.companyId],
    references: [companies.id],
  }),
}));

export const conflictEventsRelations = relations(conflictEvents, ({ one }) => ({
  conflict: one(agentConflicts, {
    fields: [conflictEvents.conflictId],
    references: [agentConflicts.id],
  }),
}));

// Types
export type AgentConflict = typeof agentConflicts.$inferSelect;
export type NewAgentConflict = typeof agentConflicts.$inferInsert;
export type ConflictResolutionRule = typeof conflictResolutionRules.$inferSelect;
export type NewConflictResolutionRule = typeof conflictResolutionRules.$inferInsert;
export type ConflictEvent = typeof conflictEvents.$inferSelect;
export type NewConflictEvent = typeof conflictEvents.$inferInsert;
