import {
  pgTable,
  uuid,
  varchar,
  timestamp,
  jsonb,
  text,
  pgEnum,
  index,
  integer,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { templates } from './templates';
import { companies } from './companies';

// Enums
export const playbookStageEnum = pgEnum('playbook_stage', [
  'idea',
  'mvp',
  'launch',
  'growth',
  'optimize',
]);

export const playbookStatusEnum = pgEnum('playbook_status', [
  'active',
  'paused',
  'completed',
  'abandoned',
]);

// Types
export interface PlaybookMilestone {
  id: string;
  title: string;
  description?: string;
}

export interface PlaybookTask {
  id: string;
  title: string;
  description: string;
  type: string;
  priority: 'critical' | 'high' | 'medium' | 'low';
  estimatedHours?: number;
  assignedRole?: string;
  dependencies?: string[];
}

export interface PlaybookStage {
  stage: 'idea' | 'mvp' | 'launch' | 'growth' | 'optimize';
  name: string;
  description: string;
  estimatedDays: number;
  milestones: PlaybookMilestone[];
  tasks: PlaybookTask[];
  exitCriteria: string[];
}

export interface StageProgressData {
  startedAt?: string;
  completedAt?: string;
  progress: number;
  tasksCompleted: number;
  tasksTotal: number;
  milestonesAchieved: string[];
}

// Playbooks table - stage-based execution plans
export const playbooks = pgTable(
  'playbooks',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    templateId: uuid('template_id').references(() => templates.id, { onDelete: 'set null' }),

    // Identification
    slug: varchar('slug', { length: 100 }).notNull().unique(),
    name: varchar('name', { length: 255 }).notNull(),
    description: text('description'),

    // Structure - array of stages with tasks
    stages: jsonb('stages').$type<PlaybookStage[]>().notNull(),

    // Target
    targetBusinessType: varchar('target_business_type', { length: 100 }),
    targetIndustry: varchar('target_industry', { length: 100 }),

    // Status
    isActive: integer('is_active').default(1),
    isSystem: integer('is_system').default(1),

    // Usage stats
    usageCount: integer('usage_count').default(0),

    // Timestamps
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => ({
    templateIdx: index('playbooks_template_idx').on(table.templateId),
    activeIdx: index('playbooks_active_idx').on(table.isActive),
    slugIdx: index('playbooks_slug_idx').on(table.slug),
  })
);

// Company Playbook Progress - track company's execution
export const companyPlaybookProgress = pgTable(
  'company_playbook_progress',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    companyId: uuid('company_id')
      .references(() => companies.id, { onDelete: 'cascade' })
      .notNull(),
    playbookId: uuid('playbook_id')
      .references(() => playbooks.id, { onDelete: 'cascade' })
      .notNull(),

    // Current position
    currentStage: playbookStageEnum('current_stage').notNull().default('idea'),
    stageStartedAt: timestamp('stage_started_at').defaultNow().notNull(),

    // Progress tracking per stage
    stageProgress: jsonb('stage_progress').$type<Record<string, StageProgressData>>().default({}),

    // Overall metrics
    overallProgress: integer('overall_progress').default(0),

    // Status
    status: playbookStatusEnum('status').default('active'),

    // Timestamps
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
    completedAt: timestamp('completed_at'),
  },
  (table) => ({
    companyIdx: index('playbook_progress_company_idx').on(table.companyId),
    playbookIdx: index('playbook_progress_playbook_idx').on(table.playbookId),
    statusIdx: index('playbook_progress_status_idx').on(table.status),
    companyPlaybookIdx: index('playbook_progress_company_playbook_idx').on(
      table.companyId,
      table.playbookId
    ),
  })
);

// Relations
export const playbooksRelations = relations(playbooks, ({ one, many }) => ({
  template: one(templates, {
    fields: [playbooks.templateId],
    references: [templates.id],
  }),
  companyProgress: many(companyPlaybookProgress),
}));

export const companyPlaybookProgressRelations = relations(companyPlaybookProgress, ({ one }) => ({
  company: one(companies, {
    fields: [companyPlaybookProgress.companyId],
    references: [companies.id],
  }),
  playbook: one(playbooks, {
    fields: [companyPlaybookProgress.playbookId],
    references: [playbooks.id],
  }),
}));
