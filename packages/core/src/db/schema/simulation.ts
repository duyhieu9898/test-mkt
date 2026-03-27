import { pgTable, text, timestamp, uuid, jsonb, pgEnum, integer, real, boolean } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { companies } from './companies';

// Simulation status enum
export const simulationStatusEnum = pgEnum('simulation_status', [
  'draft',           // Being configured
  'queued',          // Waiting to run
  'running',         // Currently executing
  'paused',          // Temporarily stopped
  'completed',       // Finished successfully
  'failed',          // Failed with error
  'cancelled',       // Cancelled by user
]);

// Simulation type enum
export const simulationTypeEnum = pgEnum('simulation_type', [
  'scenario',        // What-if scenario
  'stress_test',     // Load/stress testing
  'forecast',        // Future projection
  'optimization',    // Find optimal config
  'training',        // Agent training
]);

// Simulations
export const simulations = pgTable('simulations', {
  id: uuid('id').defaultRandom().primaryKey(),
  companyId: uuid('company_id').notNull().references(() => companies.id, { onDelete: 'cascade' }),

  // Simulation info
  name: text('name').notNull(),
  description: text('description'),
  type: simulationTypeEnum('type').notNull(),
  status: simulationStatusEnum('status').notNull().default('draft'),

  // Configuration
  config: jsonb('config').$type<{
    timeframe: {
      start: string;
      end: string;
      speedMultiplier: number; // 1x, 10x, 100x
    };
    scenario: {
      type: string;
      parameters: Record<string, unknown>;
    };
    agentConfig: {
      includeAgents: string[] | 'all';
      budgetOverrides?: Record<string, number>;
      behaviorOverrides?: Record<string, unknown>;
    };
    marketConditions?: {
      growthRate: number;
      competitionLevel: number;
      marketVolatility: number;
    };
    events?: Array<{
      time: string;
      type: string;
      parameters: Record<string, unknown>;
    }>;
  }>().notNull(),

  // Results
  results: jsonb('results').$type<{
    summary: {
      duration: string;
      totalEvents: number;
      tasksCompleted: number;
      revenue?: number;
      costs?: number;
    };
    metrics: Array<{
      name: string;
      startValue: number;
      endValue: number;
      change: number;
      trend: 'up' | 'down' | 'stable';
    }>;
    insights: Array<{
      type: 'warning' | 'opportunity' | 'risk' | 'recommendation';
      title: string;
      description: string;
      impact?: string;
    }>;
    timeline: Array<{
      timestamp: string;
      event: string;
      details: Record<string, unknown>;
    }>;
    agentPerformance: Array<{
      agentId: string;
      agentName: string;
      tasksCompleted: number;
      efficiency: number;
      resourceUsage: number;
    }>;
  }>(),

  // Progress tracking
  progress: integer('progress').default(0).notNull(), // 0-100
  currentStep: text('current_step'),
  estimatedCompletion: timestamp('estimated_completion'),

  // Execution info
  startedAt: timestamp('started_at'),
  completedAt: timestamp('completed_at'),
  errorMessage: text('error_message'),

  // Creator
  createdBy: text('created_by').notNull(),

  // Metadata
  metadata: jsonb('metadata').$type<Record<string, unknown>>(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// Simulation snapshots (state at points in time)
export const simulationSnapshots = pgTable('simulation_snapshots', {
  id: uuid('id').defaultRandom().primaryKey(),
  simulationId: uuid('simulation_id').notNull().references(() => simulations.id, { onDelete: 'cascade' }),

  // Snapshot time (simulation time)
  simulationTime: timestamp('simulation_time').notNull(),

  // State snapshot
  companyState: jsonb('company_state').$type<Record<string, unknown>>(),
  agentStates: jsonb('agent_states').$type<Array<{
    agentId: string;
    status: string;
    tasksInProgress: number;
    budgetUsed: number;
    metrics: Record<string, number>;
  }>>(),
  metrics: jsonb('metrics').$type<Record<string, number>>(),

  // Events since last snapshot
  events: jsonb('events').$type<Array<{
    timestamp: string;
    type: string;
    description: string;
    data: Record<string, unknown>;
  }>>(),

  // Metadata
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// Simulation templates
export const simulationTemplates = pgTable('simulation_templates', {
  id: uuid('id').defaultRandom().primaryKey(),
  companyId: uuid('company_id').references(() => companies.id, { onDelete: 'cascade' }), // null = public template

  name: text('name').notNull(),
  description: text('description'),
  type: simulationTypeEnum('type').notNull(),

  // Template configuration
  config: jsonb('config').$type<{
    timeframe: {
      duration: string;
      speedMultiplier: number;
    };
    scenario: {
      type: string;
      parameters: Record<string, unknown>;
    };
    defaultEvents?: Array<{
      relativeTime: string;
      type: string;
      parameters: Record<string, unknown>;
    }>;
  }>().notNull(),

  // Usage stats
  usageCount: integer('usage_count').default(0).notNull(),

  // Author
  authorId: text('author_id').notNull(),

  // Is this a system template
  isSystem: boolean('is_system').default(false).notNull(),

  // Metadata
  metadata: jsonb('metadata').$type<Record<string, unknown>>(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// Relations
export const simulationsRelations = relations(simulations, ({ one, many }) => ({
  company: one(companies, {
    fields: [simulations.companyId],
    references: [companies.id],
  }),
  snapshots: many(simulationSnapshots),
}));

export const simulationSnapshotsRelations = relations(simulationSnapshots, ({ one }) => ({
  simulation: one(simulations, {
    fields: [simulationSnapshots.simulationId],
    references: [simulations.id],
  }),
}));

export const simulationTemplatesRelations = relations(simulationTemplates, ({ one }) => ({
  company: one(companies, {
    fields: [simulationTemplates.companyId],
    references: [companies.id],
  }),
}));

// Types
export type Simulation = typeof simulations.$inferSelect;
export type NewSimulation = typeof simulations.$inferInsert;
export type SimulationSnapshot = typeof simulationSnapshots.$inferSelect;
export type NewSimulationSnapshot = typeof simulationSnapshots.$inferInsert;
export type SimulationTemplate = typeof simulationTemplates.$inferSelect;
export type NewSimulationTemplate = typeof simulationTemplates.$inferInsert;
