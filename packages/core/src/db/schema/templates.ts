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

// Enums
export const templateCategoryEnum = pgEnum('template_category', [
  'saas',
  'ecommerce',
  'agency',
  'creator',
  'local_service',
  'marketplace',
]);

export const businessModelEnum = pgEnum('business_model', [
  'subscription',
  'transaction',
  'service',
  'advertising',
  'freemium',
]);

export const audienceTypeEnum = pgEnum('audience_type', [
  'b2b',
  'b2c',
  'creator',
  'smb',
  'enterprise',
]);

// Types
export interface TemplateAgent {
  role: string;
  name: string;
  title: string;
  description: string;
  capabilities: string[];
  isManager: boolean;
  color?: string;
}

export interface TemplateDepartment {
  name: string;
  color: string;
  icon: string;
}

export interface TemplateStrategy {
  vision: string;
  days: Array<{
    day: number | string;
    title: string;
    activities: string[];
  }>;
}

// Templates table - base business templates
export const templates = pgTable(
  'templates',
  {
    id: uuid('id').primaryKey().defaultRandom(),

    // Identification
    slug: varchar('slug', { length: 100 }).notNull().unique(),
    name: varchar('name', { length: 255 }).notNull(),
    description: text('description'),
    icon: varchar('icon', { length: 50 }).default('building'),
    color: varchar('color', { length: 7 }).default('#6366f1'),

    // Categorization
    category: templateCategoryEnum('category').notNull(),
    businessModel: businessModelEnum('business_model'),
    audience: audienceTypeEnum('audience'),

    // Keywords for AI matching
    keywords: jsonb('keywords').$type<string[]>().default([]),

    // Template content
    agents: jsonb('agents').$type<TemplateAgent[]>().notNull(),
    departments: jsonb('departments').$type<TemplateDepartment[]>().default([]),
    defaultStrategy: jsonb('default_strategy').$type<TemplateStrategy>(),

    // Metadata for matching
    detectedInfo: jsonb('detected_info').$type<{
      market: string;
      model: string;
      strategy: string;
    }>(),

    // Configuration
    estimatedSetupMinutes: integer('estimated_setup_minutes').default(5),
    complexity: varchar('complexity', { length: 20 }).default('medium'),

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
    categoryIdx: index('templates_category_idx').on(table.category),
    activeIdx: index('templates_active_idx').on(table.isActive),
    slugIdx: index('templates_slug_idx').on(table.slug),
  })
);

// Relations are defined in playbooks.ts to avoid circular imports
