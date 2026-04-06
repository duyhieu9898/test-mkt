import { pgTable, uuid, varchar, timestamp, jsonb, unique } from 'drizzle-orm/pg-core';
import { users } from './users';

export const siteConfig = pgTable(
  'site_config',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    section: varchar('section', { length: 50 }).notNull(),
    locale: varchar('locale', { length: 5 }).notNull(),
    content: jsonb('content').notNull(),
    updatedBy: uuid('updated_by').references(() => users.id),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => ({
    sectionLocaleUnique: unique('site_config_section_locale_unique').on(table.section, table.locale),
  })
);
