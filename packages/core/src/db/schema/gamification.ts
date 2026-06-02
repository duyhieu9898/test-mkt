/**
 * Gamification Schema — CEO Motivation Engine
 *
 * Tables for daily missions and streak tracking.
 * Growth Score is computed on-the-fly from existing data (no table needed).
 */

import {
  pgTable,
  uuid,
  varchar,
  timestamp,
  jsonb,
  integer,
  date,
  index,
  unique,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { companies } from './companies';

// === Types ===

export type MissionCategory = 'growth' | 'automation' | 'content' | 'revenue' | 'optimization';
export type MissionStatus = 'pending' | 'completed' | 'skipped';

export interface Mission {
  id: string;
  title: string;
  why: string;
  impact: string;
  category: MissionCategory;
  link: string;
  status: MissionStatus;
  completedAt: string | null;
}

export interface WeeklyRate {
  week: string; // ISO date of week start
  completed: number;
  total: number;
}

// === CEO Daily Missions ===

export const ceoDailyMissions = pgTable(
  'ceo_daily_missions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    companyId: uuid('company_id')
      .references(() => companies.id, { onDelete: 'cascade' })
      .notNull(),

    date: date('date').notNull(),

    missions: jsonb('missions').$type<Mission[]>().notNull().default([]),

    completedCount: integer('completed_count').default(0).notNull(),
    totalCount: integer('total_count').default(0).notNull(),

    sourceAdvisorBriefId: varchar('source_advisor_brief_id', { length: 255 }),

    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => ({
    companyDateIdx: index('ceo_missions_company_date_idx').on(table.companyId, table.date),
    companyDateUnique: unique('ceo_missions_company_date_uq').on(table.companyId, table.date),
  })
);

// === CEO Streaks ===

export const ceoStreaks = pgTable(
  'ceo_streaks',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    companyId: uuid('company_id')
      .references(() => companies.id, { onDelete: 'cascade' })
      .notNull()
      .unique(),

    currentStreak: integer('current_streak').default(0).notNull(),
    longestStreak: integer('longest_streak').default(0).notNull(),
    lastActiveDate: date('last_active_date'),

    totalMissionsCompleted: integer('total_missions_completed').default(0).notNull(),

    weeklyCompletionRates: jsonb('weekly_completion_rates').$type<WeeklyRate[]>().default([]),

    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => ({
    companyIdx: index('ceo_streaks_company_idx').on(table.companyId),
  })
);

// === Relations ===

export const ceoDailyMissionsRelations = relations(ceoDailyMissions, ({ one }) => ({
  company: one(companies, {
    fields: [ceoDailyMissions.companyId],
    references: [companies.id],
  }),
}));

export const ceoStreaksRelations = relations(ceoStreaks, ({ one }) => ({
  company: one(companies, {
    fields: [ceoStreaks.companyId],
    references: [companies.id],
  }),
}));
