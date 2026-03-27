/**
 * Meeting Intelligence Schema
 *
 * Meetings with audio/transcript, AI-extracted insights.
 */

import {
  pgTable,
  uuid,
  varchar,
  text,
  timestamp,
  jsonb,
  pgEnum,
  index,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { companies } from './companies';

export const meetingStatusEnum = pgEnum('meeting_status', [
  'uploading',
  'transcribing',
  'analyzed',
  'approved',
]);

export interface MeetingInsights {
  summary?: string;
  decisions?: string[];
  tasks?: Array<{ title: string; assignee?: string; dueDate?: string }>;
  strategies?: string[];
  keyTopics?: string[];
}

export const meetings = pgTable(
  'meetings',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    companyId: uuid('company_id')
      .references(() => companies.id, { onDelete: 'cascade' })
      .notNull(),
    title: varchar('title', { length: 255 }).notNull(),
    audioUrl: text('audio_url'),
    transcript: text('transcript'),
    status: meetingStatusEnum('status').default('uploading').notNull(),
    insights: jsonb('insights').$type<MeetingInsights>(),
    approvedAt: timestamp('approved_at'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => ({
    companyIdx: index('meetings_company_idx').on(table.companyId),
    statusIdx: index('meetings_status_idx').on(table.status),
  })
);

export const meetingsRelations = relations(meetings, ({ one }) => ({
  company: one(companies, {
    fields: [meetings.companyId],
    references: [companies.id],
  }),
}));
