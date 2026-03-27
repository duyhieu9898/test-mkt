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
  boolean,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { companies, departments } from './companies';

// Enums
export const agentRoleEnum = pgEnum('agent_role', [
  'ceo',
  'marketing_manager',
  'sales_manager',
  'content_creator',
  'ads_specialist',
  'analyst',
  'support',
  'developer',
  'custom',
]);

export const agentStatusEnum = pgEnum('agent_status', [
  'created',
  'active',
  'ready',
  'running',
  'idle',
  'paused',
  'waiting',
  'error',
  'archived',
  'terminated',
]);

// Types
export interface AgentCapability {
  name: string;
  level: 'basic' | 'intermediate' | 'advanced';
  description: string;
}

export interface KPITarget {
  name: string;
  target: number;
  unit: string;
  weight: number;
  currentValue?: number;
}

export interface AgentConfig {
  model: string;
  temperature: number;
  maxTokens: number;
  tools: string[];
}

// Agents table
export const agents = pgTable(
  'agents',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    companyId: uuid('company_id')
      .references(() => companies.id, { onDelete: 'cascade' })
      .notNull(),
    departmentId: uuid('department_id').references(() => departments.id, {
      onDelete: 'set null',
    }),

    // Identity
    name: varchar('name', { length: 100 }).notNull(),
    role: agentRoleEnum('role').notNull(),
    title: varchar('title', { length: 100 }),
    description: text('description'),
    avatarUrl: varchar('avatar_url', { length: 500 }),
    color: varchar('color', { length: 7 }).default('#6366f1'),

    // Hierarchy
    supervisorId: uuid('supervisor_id'),
    level: integer('level').default(0),

    // Status
    status: agentStatusEnum('status').default('created').notNull(),
    statusMessage: text('status_message'),

    // Configuration
    capabilities: jsonb('capabilities').$type<AgentCapability[]>().default([]),
    tools: jsonb('tools').$type<string[]>().default([]),
    kpiTargets: jsonb('kpi_targets').$type<KPITarget[]>().default([]),
    config: jsonb('config').$type<AgentConfig>().default({
      model: 'claude-3-5-sonnet-20241022',
      temperature: 0.7,
      maxTokens: 4096,
      tools: [],
    }),

    // Prompt
    systemPrompt: text('system_prompt'),

    // Budget
    budgetLimit: decimal('budget_limit', { precision: 12, scale: 2 }),
    budgetSpent: decimal('budget_spent', { precision: 12, scale: 2 }).default('0'),

    // Performance
    performanceScore: decimal('performance_score', { precision: 5, scale: 2 }),
    tasksCompleted: integer('tasks_completed').default(0),
    tasksFailed: integer('tasks_failed').default(0),

    // Auto-spawn tracking
    isAutoSpawned: integer('is_auto_spawned').default(0), // 0 = false, 1 = true

    // Metadata for A/B testing, etc.
    metadata: jsonb('metadata').$type<Record<string, unknown>>(),

    // Timestamps
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
    lastActiveAt: timestamp('last_active_at'),
  },
  (table) => ({
    companyIdx: index('agents_company_idx').on(table.companyId),
    statusIdx: index('agents_status_idx').on(table.status),
    supervisorIdx: index('agents_supervisor_idx').on(table.supervisorId),
    roleIdx: index('agents_role_idx').on(table.role),
  })
);

// Agent prompt templates
export const promptTemplates = pgTable('prompt_templates', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id').references(() => companies.id, { onDelete: 'cascade' }),

  name: varchar('name', { length: 100 }).notNull(),
  role: agentRoleEnum('role'),
  version: integer('version').default(1).notNull(),

  systemPrompt: text('system_prompt').notNull(),
  contextTemplate: text('context_template'),
  examples: jsonb('examples').$type<Array<{ input: string; output: string }>>(),

  isDefault: boolean('is_default').default(false),
  isActive: boolean('is_active').default(true),

  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// Relations
export const agentsRelations = relations(agents, ({ one, many }) => ({
  company: one(companies, {
    fields: [agents.companyId],
    references: [companies.id],
  }),
  department: one(departments, {
    fields: [agents.departmentId],
    references: [departments.id],
  }),
  supervisor: one(agents, {
    fields: [agents.supervisorId],
    references: [agents.id],
    relationName: 'agentHierarchy',
  }),
  subordinates: many(agents, { relationName: 'agentHierarchy' }),
}));
