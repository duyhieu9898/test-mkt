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
import { companies } from './companies';

// Enums
export const guidanceTypeEnum = pgEnum('guidance_type', [
  'setup_task',
  'milestone',
  'recommendation',
  'tutorial',
  'insight',
]);

export const guidanceStatusEnum = pgEnum('guidance_status', [
  'pending',
  'shown',
  'completed',
  'dismissed',
  'expired',
]);

export const guidancePriorityEnum = pgEnum('guidance_priority', [
  'critical',
  'high',
  'medium',
  'low',
]);

// Types
export interface GuidanceCondition {
  type: 'stage_reached' | 'task_completed' | 'time_elapsed' | 'metric_threshold' | 'always';
  params?: Record<string, unknown>;
}

// Onboarding Guidance table - CEO guidance items
export const onboardingGuidance = pgTable(
  'onboarding_guidance',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    companyId: uuid('company_id')
      .references(() => companies.id, { onDelete: 'cascade' })
      .notNull(),

    // Guidance content
    type: guidanceTypeEnum('type').notNull(),
    title: varchar('title', { length: 255 }).notNull(),
    description: text('description'),

    // Action
    actionUrl: varchar('action_url', { length: 500 }),
    actionLabel: varchar('action_label', { length: 100 }),
    actionType: varchar('action_type', { length: 50 }), // 'link', 'modal', 'task', 'external'

    // Visual
    icon: varchar('icon', { length: 50 }),
    color: varchar('color', { length: 7 }),

    // Ordering
    sequence: integer('sequence').default(0),
    priority: guidancePriorityEnum('priority').default('medium'),

    // Conditions
    showConditions: jsonb('show_conditions').$type<GuidanceCondition[]>(),

    // Status
    status: guidanceStatusEnum('status').default('pending'),
    completedAt: timestamp('completed_at'),
    dismissedAt: timestamp('dismissed_at'),
    shownAt: timestamp('shown_at'),

    // Source tracking
    sourceType: varchar('source_type', { length: 50 }), // 'playbook', 'system', 'ai'
    sourceId: uuid('source_id'),
    stageId: varchar('stage_id', { length: 50 }), // Which playbook stage this belongs to

    // Timestamps
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
    expiresAt: timestamp('expires_at'),
  },
  (table) => ({
    companyIdx: index('guidance_company_idx').on(table.companyId),
    companyStatusIdx: index('guidance_company_status_idx').on(table.companyId, table.status),
    companySequenceIdx: index('guidance_company_sequence_idx').on(table.companyId, table.sequence),
    statusIdx: index('guidance_status_idx').on(table.status),
    typeIdx: index('guidance_type_idx').on(table.type),
  })
);

// Onboarding Progress - overall onboarding state
export const onboardingProgress = pgTable(
  'onboarding_progress',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    companyId: uuid('company_id')
      .references(() => companies.id, { onDelete: 'cascade' })
      .notNull()
      .unique(),

    // Progress tracking
    totalSteps: integer('total_steps').default(0),
    completedSteps: integer('completed_steps').default(0),
    currentStepNumber: integer('current_step_number').default(1),

    // Overall progress
    percentComplete: integer('percent_complete').default(0),
    status: varchar('status', { length: 20 }).default('in_progress'), // 'in_progress', 'completed', 'paused'

    // Timeline
    startedAt: timestamp('started_at').defaultNow(),
    completedAt: timestamp('completed_at'),
    lastActivityAt: timestamp('last_activity_at').defaultNow(),

    // Skipped items
    skippedItems: jsonb('skipped_items').$type<string[]>().default([]),

    // Timestamps
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => ({
    companyIdx: index('onboarding_progress_company_idx').on(table.companyId),
    statusIdx: index('onboarding_progress_status_idx').on(table.status),
  })
);

// Relations
export const onboardingGuidanceRelations = relations(onboardingGuidance, ({ one }) => ({
  company: one(companies, {
    fields: [onboardingGuidance.companyId],
    references: [companies.id],
  }),
}));

export const onboardingProgressRelations = relations(onboardingProgress, ({ one }) => ({
  company: one(companies, {
    fields: [onboardingProgress.companyId],
    references: [companies.id],
  }),
}));
