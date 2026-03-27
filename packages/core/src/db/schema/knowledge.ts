/**
 * Knowledge Center Schema
 *
 * Documents: uploaded source material (PDF, URL, text, audio)
 * Knowledge entries stored in existing knowledge_base table (memory.ts)
 */

import {
  pgTable,
  uuid,
  varchar,
  text,
  timestamp,
  integer,
  jsonb,
  pgEnum,
  index,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { companies } from './companies';

export const documentTypeEnum = pgEnum('document_type', [
  'pdf', 'url', 'text', 'image', 'audio', 'doc',
]);

export const documentStatusEnum = pgEnum('document_status', [
  'uploading', 'processing', 'extracted', 'approved', 'rejected', 'failed',
]);

export const documents = pgTable(
  'documents',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    companyId: uuid('company_id')
      .references(() => companies.id, { onDelete: 'cascade' })
      .notNull(),
    name: varchar('name', { length: 255 }).notNull(),
    type: documentTypeEnum('type').notNull(),
    sourceUrl: text('source_url'),
    fileUrl: text('file_url'),
    fileSize: integer('file_size'),
    status: documentStatusEnum('status').default('uploading').notNull(),
    rawContent: text('raw_content'),
    extractedContent: jsonb('extracted_content').$type<Array<{
      category: string;
      title: string;
      content: string;
      tags: string[];
      confidence: number;
    }>>(),
    tags: jsonb('tags').$type<string[]>().default([]),
    errorMessage: text('error_message'),
    approvedAt: timestamp('approved_at'),
    approvedBy: uuid('approved_by'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => ({
    companyIdx: index('documents_company_idx').on(table.companyId),
    statusIdx: index('documents_status_idx').on(table.status),
  })
);

export const documentsRelations = relations(documents, ({ one }) => ({
  company: one(companies, {
    fields: [documents.companyId],
    references: [companies.id],
  }),
}));
