/**
 * Asset Library Schema
 *
 * Central repository for all company media assets:
 * images, videos, icons, logos — from uploads, stock libraries, or AI generation.
 */

import {
  pgTable, uuid, varchar, text, timestamp, integer, jsonb, pgEnum, index,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { companies } from './companies';

// === ENUMS ===

export const libraryAssetTypeEnum = pgEnum('library_asset_type', [
  'image', 'video', 'icon', 'logo',
]);

export const assetSourceEnum = pgEnum('asset_source', [
  'upload', 'stock', 'ai_generated',
]);

// === ASSETS ===

export const assetLibrary = pgTable(
  'asset_library',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    companyId: uuid('company_id').references(() => companies.id, { onDelete: 'cascade' }).notNull(),
    name: varchar('name', { length: 255 }).notNull(),
    type: libraryAssetTypeEnum('type').notNull(),
    source: assetSourceEnum('source').default('upload').notNull(),
    url: text('url').notNull(),
    thumbnailUrl: text('thumbnail_url'),
    width: integer('width'),
    height: integer('height'),
    fileSize: integer('file_size'), // bytes
    mimeType: varchar('mime_type', { length: 50 }).notNull(),
    tags: jsonb('tags').$type<string[]>().default([]),
    campaignId: uuid('campaign_id'),
    metadata: jsonb('metadata').$type<{
      stockProvider?: string;
      stockPhotoId?: string;
      stockPhotographer?: string;
      stockPhotographerUrl?: string;
      aiPrompt?: string;
      aiModel?: string;
      originalFilename?: string;
      [key: string]: unknown;
    }>().default({}),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => ({
    companyIdx: index('asset_library_company_idx').on(table.companyId),
    typeIdx: index('asset_library_type_idx').on(table.type),
    sourceIdx: index('asset_library_source_idx').on(table.source),
    campaignIdx: index('asset_library_campaign_idx').on(table.campaignId),
  })
);

// === RELATIONS ===

export const assetLibraryRelations = relations(assetLibrary, ({ one }) => ({
  company: one(companies, { fields: [assetLibrary.companyId], references: [companies.id] }),
}));
