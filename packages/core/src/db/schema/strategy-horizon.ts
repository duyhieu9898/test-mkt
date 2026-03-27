/**
 * Strategy Horizon Schema
 *
 * Implements multi-level strategic planning:
 * - Quarterly Vision (Long-term)
 * - Weekly Goals (Mid-term)
 * - Daily Strategy (Short-term)
 *
 * CEO Planning Loop respects this hierarchy:
 * - Daily updates respect weekly goals
 * - Weekly reviews align with quarterly vision
 * - Quarterly planning sets long-term direction
 */

import { pgTable, uuid, varchar, text, timestamp, integer, real, jsonb, pgEnum } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { companies } from './companies';
import { agents } from './agents';

// Strategy horizon levels
export const strategyHorizonEnum = pgEnum('strategy_horizon', [
  'quarterly',  // 90 days - Long-term vision
  'weekly',     // 7 days - Mid-term goals
  'daily',      // 1 day - Short-term priorities
]);

// Strategy status
export const strategyStatusEnum = pgEnum('strategy_status', [
  'draft',      // Being created
  'active',     // Currently in effect
  'completed',  // Successfully finished
  'revised',    // Replaced by new strategy
  'cancelled',  // Abandoned
]);

// Event trigger types
export const eventTriggerTypeEnum = pgEnum('event_trigger_type', [
  'health_threshold',     // Health score crosses threshold
  'budget_threshold',     // Budget utilization threshold
  'task_failure_rate',    // Task failure rate threshold
  'agent_performance',    // Agent performance threshold
  'milestone_achieved',   // Strategic milestone completed
  'deadline_approaching', // Deadline within X hours
  'external_event',       // External API/webhook trigger
  'schedule',             // Time-based trigger
  'state_change',         // Any significant state change
]);

// Strategy Horizons - Multi-level strategic planning
export const strategyHorizons = pgTable('strategy_horizons', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id').notNull().references(() => companies.id, { onDelete: 'cascade' }),

  // Horizon level
  horizon: strategyHorizonEnum('horizon').notNull(),
  status: strategyStatusEnum('status').default('draft').notNull(),

  // Time boundaries
  periodStart: timestamp('period_start').notNull(),
  periodEnd: timestamp('period_end').notNull(),

  // Vision & Mission (mainly for quarterly)
  vision: text('vision'),
  mission: text('mission'),
  theme: varchar('theme', { length: 255 }), // e.g., "Growth Quarter", "Efficiency Sprint"

  // Objectives (OKRs)
  objectives: jsonb('objectives').$type<Array<{
    id: string;
    title: string;
    description: string;
    keyResults: Array<{
      id: string;
      metric: string;
      target: number;
      current: number;
      unit: string;
    }>;
    progress: number; // 0-100
    status: 'on_track' | 'at_risk' | 'behind' | 'completed';
  }>>(),

  // Priorities (ranked)
  priorities: jsonb('priorities').$type<Array<{
    rank: number;
    title: string;
    description: string;
    category: 'growth' | 'efficiency' | 'innovation' | 'risk' | 'quality';
    effort: 'low' | 'medium' | 'high';
    impact: 'low' | 'medium' | 'high';
  }>>(),

  // Resource allocation
  resourceAllocation: jsonb('resource_allocation').$type<{
    budget: {
      total: number;
      allocated: number;
      byCategory: Record<string, number>;
    };
    agents: {
      total: number;
      byDepartment: Record<string, number>;
      byRole: Record<string, number>;
    };
    focus: Record<string, number>; // percentage by area
  }>(),

  // Constraints & Guidelines
  constraints: jsonb('constraints').$type<{
    budgetLimit: number;
    maxAgents: number;
    mustComplete: string[];   // Non-negotiable items
    mustAvoid: string[];      // Things to avoid
    dependencies: string[];   // External dependencies
  }>(),

  // Success metrics
  successMetrics: jsonb('success_metrics').$type<Array<{
    metric: string;
    baseline: number;
    target: number;
    current: number;
    trend: 'up' | 'down' | 'stable';
  }>>(),

  // Progress tracking
  overallProgress: integer('overall_progress').default(0), // 0-100
  healthScore: real('health_score').default(100),          // 0-100

  // Parent horizon (daily → weekly → quarterly)
  parentHorizonId: uuid('parent_horizon_id'),

  // Metadata
  createdBy: varchar('created_by', { length: 50 }).default('system'), // 'system' | 'ceo_agent' | 'user'
  approvedBy: uuid('approved_by'),
  approvedAt: timestamp('approved_at'),
  notes: text('notes'),
  metadata: jsonb('metadata'),

  // Timestamps
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// Event Triggers - CEO activation triggers
export const eventTriggers = pgTable('event_triggers', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id').notNull().references(() => companies.id, { onDelete: 'cascade' }),

  // Trigger configuration
  name: varchar('name', { length: 255 }).notNull(),
  description: text('description'),
  triggerType: eventTriggerTypeEnum('trigger_type').notNull(),
  enabled: integer('enabled').default(1),

  // Conditions
  conditions: jsonb('conditions').$type<{
    // Threshold conditions
    metric?: string;
    operator?: 'gt' | 'gte' | 'lt' | 'lte' | 'eq' | 'neq';
    threshold?: number;

    // Time-based conditions
    schedule?: string; // cron expression
    timeWindow?: number; // in minutes

    // State conditions
    stateField?: string;
    stateValue?: unknown;

    // Compound conditions
    and?: Array<unknown>;
    or?: Array<unknown>;
  }>().notNull(),

  // Actions when triggered
  actions: jsonb('actions').$type<Array<{
    type: 'ceo_reasoning_loop' | 'notify_user' | 'create_task' | 'send_message' | 'adjust_priority' | 'pause_operations';
    params: Record<string, unknown>;
    priority: 'critical' | 'high' | 'normal' | 'low';
  }>>().notNull(),

  // Rate limiting
  cooldownMinutes: integer('cooldown_minutes').default(60), // Don't re-trigger within this period
  maxTriggersPerDay: integer('max_triggers_per_day').default(10),

  // Statistics
  triggerCount: integer('trigger_count').default(0),
  lastTriggeredAt: timestamp('last_triggered_at'),
  lastTriggeredValue: real('last_triggered_value'),

  // Metadata
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// Event Trigger History - Log of trigger activations
export const eventTriggerHistory = pgTable('event_trigger_history', {
  id: uuid('id').primaryKey().defaultRandom(),
  triggerId: uuid('trigger_id').notNull().references(() => eventTriggers.id, { onDelete: 'cascade' }),
  companyId: uuid('company_id').notNull().references(() => companies.id, { onDelete: 'cascade' }),

  // Trigger details
  triggerType: eventTriggerTypeEnum('trigger_type').notNull(),
  triggeredValue: real('triggered_value'),
  thresholdValue: real('threshold_value'),
  triggerReason: text('trigger_reason'),

  // Actions taken
  actionsExecuted: jsonb('actions_executed').$type<Array<{
    action: string;
    result: 'success' | 'failed' | 'skipped';
    details: string;
    duration: number;
  }>>(),

  // Result
  resultSummary: text('result_summary'),
  success: integer('success').default(1),

  // CEO Reasoning Loop result (if triggered)
  reasoningCycleId: varchar('reasoning_cycle_id', { length: 100 }),

  // Timestamps
  triggeredAt: timestamp('triggered_at').defaultNow().notNull(),
  completedAt: timestamp('completed_at'),
});

// Strategy Alignment - Track alignment between horizons
export const strategyAlignment = pgTable('strategy_alignment', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id').notNull().references(() => companies.id, { onDelete: 'cascade' }),

  // Horizons being aligned
  quarterlyHorizonId: uuid('quarterly_horizon_id').references(() => strategyHorizons.id),
  weeklyHorizonId: uuid('weekly_horizon_id').references(() => strategyHorizons.id),
  dailyHorizonId: uuid('daily_horizon_id').references(() => strategyHorizons.id),

  // Alignment scores
  quarterlyToWeeklyScore: real('quarterly_to_weekly_score'), // 0-100
  weeklyToDailyScore: real('weekly_to_daily_score'),         // 0-100
  overallAlignmentScore: real('overall_alignment_score'),    // 0-100

  // Analysis
  alignmentIssues: jsonb('alignment_issues').$type<Array<{
    issue: string;
    severity: 'critical' | 'warning' | 'info';
    affectedHorizons: string[];
    recommendation: string;
  }>>(),

  // Timestamps
  computedAt: timestamp('computed_at').defaultNow().notNull(),
});

// Relations
export const strategyHorizonsRelations = relations(strategyHorizons, ({ one, many }) => ({
  company: one(companies, {
    fields: [strategyHorizons.companyId],
    references: [companies.id],
  }),
  parentHorizon: one(strategyHorizons, {
    fields: [strategyHorizons.parentHorizonId],
    references: [strategyHorizons.id],
  }),
  approver: one(agents, {
    fields: [strategyHorizons.approvedBy],
    references: [agents.id],
  }),
}));

export const eventTriggersRelations = relations(eventTriggers, ({ one, many }) => ({
  company: one(companies, {
    fields: [eventTriggers.companyId],
    references: [companies.id],
  }),
  history: many(eventTriggerHistory),
}));

export const eventTriggerHistoryRelations = relations(eventTriggerHistory, ({ one }) => ({
  trigger: one(eventTriggers, {
    fields: [eventTriggerHistory.triggerId],
    references: [eventTriggers.id],
  }),
  company: one(companies, {
    fields: [eventTriggerHistory.companyId],
    references: [companies.id],
  }),
}));

// Indexes are defined inline with the tables
