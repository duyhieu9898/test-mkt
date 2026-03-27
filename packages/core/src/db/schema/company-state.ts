import {
  pgTable,
  uuid,
  varchar,
  timestamp,
  jsonb,
  text,
  decimal,
  pgEnum,
  integer,
  index,
  real,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { companies } from './companies';

// Company State - Real-time snapshot for CEO decision making
export const companyState = pgTable(
  'company_state',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    companyId: uuid('company_id')
      .references(() => companies.id, { onDelete: 'cascade' })
      .notNull()
      .unique(),

    // Strategy & Direction
    currentStrategy: jsonb('current_strategy').$type<{
      vision: string;
      priorities: Array<{
        id: string;
        title: string;
        category: string;
        urgency: string;
        progress: number;
      }>;
      quarterlyGoals: Array<{
        goal: string;
        metric: string;
        target: number;
        current: number;
      }>;
      lastUpdated: string;
    }>(),

    // Budget & Financial State
    budgetState: jsonb('budget_state').$type<{
      totalBudget: number;
      spent: number;
      remaining: number;
      monthlyBurn: number;
      projectedRunway: number; // months
      byDepartment: Record<string, { allocated: number; spent: number }>;
      alerts: Array<{ type: string; message: string; severity: string }>;
    }>(),

    // Agent Workforce State
    agentState: jsonb('agent_state').$type<{
      total: number;
      byStatus: Record<string, number>;
      byRole: Record<string, number>;
      byDepartment: Record<string, number>;
      avgPerformance: number;
      topPerformers: Array<{ id: string; name: string; score: number }>;
      underperformers: Array<{ id: string; name: string; score: number; issues: string[] }>;
      capacityUtilization: number; // percentage
    }>(),

    // Task & Work State
    taskState: jsonb('task_state').$type<{
      total: number;
      byStatus: Record<string, number>;
      byPriority: Record<string, number>;
      avgCompletionTime: number; // minutes
      successRate: number;
      backlogSize: number;
      blockedTasks: Array<{ id: string; title: string; reason: string }>;
      criticalPath: Array<{ id: string; title: string; deadline?: string }>;
    }>(),

    // Department Metrics
    departmentMetrics: jsonb('department_metrics').$type<Record<string, {
      name: string;
      agentCount: number;
      taskCount: number;
      successRate: number;
      avgResponseTime: number;
      kpiProgress: Array<{ kpi: string; target: number; current: number }>;
    }>>(),

    // Health Indicators
    healthScore: real('health_score').default(100), // 0-100
    healthIndicators: jsonb('health_indicators').$type<{
      agentHealth: number;
      budgetHealth: number;
      taskHealth: number;
      communicationHealth: number;
      growthHealth: number;
    }>(),

    // Alerts & Issues
    activeAlerts: jsonb('active_alerts').$type<Array<{
      id: string;
      type: 'critical' | 'warning' | 'info';
      category: 'budget' | 'performance' | 'capacity' | 'task' | 'agent';
      message: string;
      createdAt: string;
      acknowledged: boolean;
    }>>(),

    // Recent Events (for context)
    recentEvents: jsonb('recent_events').$type<Array<{
      id: string;
      type: string;
      description: string;
      timestamp: string;
      impact: 'positive' | 'negative' | 'neutral';
    }>>(),

    // Risk Assessment (from risk monitoring loop)
    riskAssessment: jsonb('risk_assessment').$type<{
      overallRiskLevel: 'critical' | 'high' | 'medium' | 'low';
      risks: Array<{
        category: string;
        name: string;
        severity: 'critical' | 'high' | 'medium' | 'low';
        currentValue: number;
        threshold: number;
        trend: 'improving' | 'stable' | 'worsening';
        description: string;
        recommendedActions: string[];
      }>;
      actionsTaken: Array<{
        action: string;
        reason: string;
        success: boolean;
      }>;
      assessedAt: string;
    }>(),

    // Timestamps
    lastComputedAt: timestamp('last_computed_at').defaultNow().notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => ({
    companyIdx: index('company_state_company_idx').on(table.companyId),
  })
);

// State History for trend analysis
export const companyStateHistory = pgTable(
  'company_state_history',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    companyId: uuid('company_id')
      .references(() => companies.id, { onDelete: 'cascade' })
      .notNull(),

    // Snapshot time
    snapshotAt: timestamp('snapshot_at').notNull(),
    snapshotType: varchar('snapshot_type', { length: 20 }).notNull(), // hourly, daily, weekly

    // Key metrics for trend analysis
    metrics: jsonb('metrics').$type<{
      healthScore: number;
      taskSuccessRate: number;
      avgAgentPerformance: number;
      budgetUtilization: number;
      capacityUtilization: number;
      activeAgents: number;
      completedTasks: number;
      totalCost: number;
    }>(),

    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => ({
    companySnapshotIdx: index('state_history_company_snapshot_idx').on(table.companyId, table.snapshotAt),
  })
);

// Strategic Objectives - Goal layer above tasks
export const strategicObjectives = pgTable(
  'strategic_objectives',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    companyId: uuid('company_id')
      .references(() => companies.id, { onDelete: 'cascade' })
      .notNull(),

    // Objective details
    title: varchar('title', { length: 255 }).notNull(),
    description: text('description'),
    category: varchar('category', { length: 50 }).notNull(), // growth, efficiency, innovation, etc.

    // Hierarchy
    parentObjectiveId: uuid('parent_objective_id'),
    level: integer('level').default(0), // 0 = company-wide, 1 = department, 2 = team

    // Status
    status: varchar('status', { length: 20 }).default('active'), // active, achieved, paused, cancelled
    progress: integer('progress').default(0), // 0-100

    // Success criteria
    keyResults: jsonb('key_results').$type<Array<{
      id: string;
      description: string;
      metric: string;
      targetValue: number;
      currentValue: number;
      unit: string;
    }>>(),

    // Timeline
    startDate: timestamp('start_date'),
    targetDate: timestamp('target_date'),
    achievedDate: timestamp('achieved_date'),

    // Assignment
    ownerAgentId: uuid('owner_agent_id'),
    contributingAgentIds: jsonb('contributing_agent_ids').$type<string[]>(),
    departmentId: uuid('department_id'),

    // Related tasks (task graph root IDs)
    taskGraphIds: jsonb('task_graph_ids').$type<string[]>(),

    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => ({
    companyIdx: index('objectives_company_idx').on(table.companyId),
    statusIdx: index('objectives_status_idx').on(table.status),
    parentIdx: index('objectives_parent_idx').on(table.parentObjectiveId),
  })
);

// Relations
export const companyStateRelations = relations(companyState, ({ one }) => ({
  company: one(companies, {
    fields: [companyState.companyId],
    references: [companies.id],
  }),
}));

export const strategicObjectivesRelations = relations(strategicObjectives, ({ one, many }) => ({
  company: one(companies, {
    fields: [strategicObjectives.companyId],
    references: [companies.id],
  }),
  parentObjective: one(strategicObjectives, {
    fields: [strategicObjectives.parentObjectiveId],
    references: [strategicObjectives.id],
    relationName: 'objectiveHierarchy',
  }),
  childObjectives: many(strategicObjectives, { relationName: 'objectiveHierarchy' }),
}));
