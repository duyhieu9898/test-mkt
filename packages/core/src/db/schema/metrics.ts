import {
  pgTable,
  uuid,
  varchar,
  timestamp,
  jsonb,
  decimal,
  integer,
  index,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { companies } from './companies';
import { agents } from './agents';

// Types
export interface KPIScore {
  name: string;
  targetValue: number;
  actualValue: number;
  score: number;
  trend: 'up' | 'down' | 'stable';
}

export interface EvaluationInsight {
  type: 'strength' | 'weakness' | 'opportunity' | 'threat';
  description: string;
  recommendation?: string;
}

export interface ROIMetrics {
  costTotal: number;           // Total cost (tokens, API calls, etc.)
  revenueGenerated: number;    // Estimated revenue from completed tasks
  valueDelivered: number;      // Value score based on task outcomes
  roi: number;                 // (value - cost) / cost * 100
  costPerTask: number;         // Average cost per task
  valuePerDollar: number;      // Value delivered per dollar spent
  efficiencyScore: number;     // 0-100 efficiency rating
}

export interface QualityMetrics {
  taskSuccessRate: number;     // % of successful tasks
  firstTimeSuccess: number;    // % tasks completed without retry
  errorRecoveryRate: number;   // % of errors successfully recovered
  averageQualityScore: number; // LLM-evaluated quality (0-100)
  customerSatisfaction: number;// Based on feedback (0-100)
}

export interface EfficiencyMetrics {
  averageTaskDuration: number;  // Average time to complete task (ms)
  tasksPerHour: number;         // Task throughput
  tokensPerTask: number;        // Average tokens per task
  contextUtilization: number;   // How well context is used (0-100)
  memoryUtilization: number;    // How often memories help (0-100)
}

// Evaluations table
export const evaluations = pgTable(
  'evaluations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    companyId: uuid('company_id')
      .references(() => companies.id, { onDelete: 'cascade' })
      .notNull(),
    agentId: uuid('agent_id')
      .references(() => agents.id, { onDelete: 'cascade' })
      .notNull(),

    // Period
    periodType: varchar('period_type', { length: 20 }).notNull(),
    periodStart: timestamp('period_start').notNull(),
    periodEnd: timestamp('period_end').notNull(),

    // Scores
    overallScore: decimal('overall_score', { precision: 5, scale: 2 }),
    kpiScores: jsonb('kpi_scores').$type<KPIScore[]>().default([]),

    // Metrics
    tasksCompleted: integer('tasks_completed').default(0),
    tasksFailed: integer('tasks_failed').default(0),
    averageTaskTime: integer('average_task_time'),
    budgetUtilization: decimal('budget_utilization', { precision: 5, scale: 2 }),
    tokensUsed: integer('tokens_used').default(0),
    costIncurred: decimal('cost_incurred', { precision: 10, scale: 4 }),

    // ROI Metrics
    roiMetrics: jsonb('roi_metrics').$type<ROIMetrics>(),
    qualityMetrics: jsonb('quality_metrics').$type<QualityMetrics>(),
    efficiencyMetrics: jsonb('efficiency_metrics').$type<EfficiencyMetrics>(),

    // Value tracking
    revenueGenerated: decimal('revenue_generated', { precision: 15, scale: 2 }).default('0'),
    valueDelivered: decimal('value_delivered', { precision: 15, scale: 2 }).default('0'),
    roi: decimal('roi', { precision: 10, scale: 2 }), // ROI percentage

    // Analysis
    insights: jsonb('insights').$type<EvaluationInsight[]>().default([]),
    recommendations: jsonb('recommendations').$type<string[]>().default([]),

    // Comparison
    rankInCompany: integer('rank_in_company'),
    percentileScore: decimal('percentile_score', { precision: 5, scale: 2 }),

    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => ({
    agentPeriodIdx: index('evaluations_agent_period_idx').on(table.agentId, table.periodStart),
    companyPeriodIdx: index('evaluations_company_period_idx').on(
      table.companyId,
      table.periodStart
    ),
  })
);

// Metrics table (time-series)
export const metrics = pgTable(
  'metrics',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    companyId: uuid('company_id')
      .references(() => companies.id, { onDelete: 'cascade' })
      .notNull(),
    agentId: uuid('agent_id').references(() => agents.id, { onDelete: 'cascade' }),

    // Metric Info
    name: varchar('name', { length: 100 }).notNull(),
    category: varchar('category', { length: 50 }).notNull(),
    value: decimal('value', { precision: 15, scale: 4 }).notNull(),
    unit: varchar('unit', { length: 20 }),

    // Time
    timestamp: timestamp('timestamp').notNull(),
    granularity: varchar('granularity', { length: 20 }).default('hour'),

    // Context
    metadata: jsonb('metadata'),

    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => ({
    companyMetricIdx: index('metrics_company_metric_idx').on(
      table.companyId,
      table.name,
      table.timestamp
    ),
    agentMetricIdx: index('metrics_agent_metric_idx').on(table.agentId, table.name),
  })
);

// Relations
export const evaluationsRelations = relations(evaluations, ({ one }) => ({
  company: one(companies, {
    fields: [evaluations.companyId],
    references: [companies.id],
  }),
  agent: one(agents, {
    fields: [evaluations.agentId],
    references: [agents.id],
  }),
}));

export const metricsRelations = relations(metrics, ({ one }) => ({
  company: one(companies, {
    fields: [metrics.companyId],
    references: [companies.id],
  }),
  agent: one(agents, {
    fields: [metrics.agentId],
    references: [agents.id],
  }),
}));
