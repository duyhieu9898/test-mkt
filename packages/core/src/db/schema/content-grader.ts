/**
 * Content Grader Schema — Real-time Semantic Content Grading (Block 4).
 *
 * Stores graded content snapshots so the founder can re-review past
 * grades and compare improvements over time.
 */

import {
  pgTable,
  uuid,
  text,
  varchar,
  timestamp,
  jsonb,
  integer,
  index,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { companies } from './companies';

export type GradeSeverity = 'high' | 'medium' | 'low';

export interface GradeBreakdown {
  entity_coverage: number;
  topic_coverage: number;
  brand_voice: number;
  ai_citation_likelihood: number;
  readability: number;
}

export interface GradeSuggestion {
  category: string;
  severity: GradeSeverity;
  text: string;
}

export const contentGrades = pgTable(
  'content_grades',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    companyId: uuid('company_id')
      .references(() => companies.id, { onDelete: 'cascade' })
      .notNull(),

    contentText: text('content_text').notNull(),
    targetKeyword: varchar('target_keyword', { length: 255 }).notNull(),

    score: integer('score').notNull(),
    breakdown: jsonb('breakdown').$type<GradeBreakdown>().notNull(),
    suggestions: jsonb('suggestions').$type<GradeSuggestion[]>().notNull().default([]),

    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => ({
    companyCreatedIdx: index('content_grades_company_created_idx').on(
      table.companyId,
      table.createdAt
    ),
  })
);

export const contentGradesRelations = relations(contentGrades, ({ one }) => ({
  company: one(companies, {
    fields: [contentGrades.companyId],
    references: [companies.id],
  }),
}));
