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
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { companies } from './companies';
import { agents } from './agents';
import { skills } from './marketplace';
import { assetTypeEnum } from './landing-pages';

// ============================================
// ENUMS
// ============================================

export const agentTypeEnum = pgEnum('agent_type', [
  'ceo',
  'marketing',
  'sales',
  'support',
  'content',
  'landing_page',
  'custom',
]);

export const toolTypeEnum = pgEnum('tool_type', [
  'image_generation',
  'video_generation',
  'text_generation',
  'social_post',
  'email',
  'storage',
  'analytics',
  'calendar',
  'crm',
  'webhook',
  'custom',
]);

export const authMethodEnum = pgEnum('tool_auth_method', [
  'api_key',
  'oauth2',
  'bearer_token',
  'basic_auth',
  'none',
]);

export const executionStatusEnum = pgEnum('execution_status', [
  'pending',
  'queued',
  'processing',
  'completed',
  'failed',
  'cancelled',
  'retrying',
]);

// NOTE: assetTypeEnum is imported from './landing-pages' to avoid duplication

// ============================================
// EXECUTION TOOLS
// ============================================

export interface ToolConfig {
  baseUrl?: string;
  timeout?: number;
  retries?: number;
  rateLimit?: {
    requests: number;
    period: 'second' | 'minute' | 'hour';
  };
  headers?: Record<string, string>;
  customConfig?: Record<string, unknown>;
}

export interface ToolCredentials {
  apiKey?: string;
  clientId?: string;
  clientSecret?: string;
  accessToken?: string;
  refreshToken?: string;
  expiresAt?: string;
}

export const executionTools = pgTable(
  'execution_tools',
  {
    id: uuid('id').primaryKey().defaultRandom(),

    // Tool Identity
    name: varchar('name', { length: 100 }).notNull(),
    slug: varchar('slug', { length: 100 }).notNull().unique(),
    description: text('description'),
    type: toolTypeEnum('type').notNull(),
    provider: varchar('provider', { length: 100 }), // e.g., 'replicate', 'openai', 'facebook'

    // API Configuration
    apiEndpoint: varchar('api_endpoint', { length: 500 }),
    authMethod: authMethodEnum('auth_method').default('api_key'),
    config: jsonb('config').$type<ToolConfig>().default({}),

    // Schema definitions
    inputSchema: jsonb('input_schema').$type<Record<string, unknown>>(),
    outputSchema: jsonb('output_schema').$type<Record<string, unknown>>(),

    // Pricing (for budget tracking)
    costPerCall: decimal('cost_per_call', { precision: 10, scale: 6 }).default('0'),
    costUnit: varchar('cost_unit', { length: 20 }).default('call'), // 'call', 'token', 'second', 'mb'

    // Status
    isActive: boolean('is_active').default(true),
    isBuiltIn: boolean('is_built_in').default(false), // System tools vs user-added

    // Timestamps
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => ({
    slugIdx: uniqueIndex('tools_slug_idx').on(table.slug),
    typeIdx: index('tools_type_idx').on(table.type),
    providerIdx: index('tools_provider_idx').on(table.provider),
  })
);

// Company-specific tool credentials
export const companyToolCredentials = pgTable(
  'company_tool_credentials',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    companyId: uuid('company_id')
      .references(() => companies.id, { onDelete: 'cascade' })
      .notNull(),
    toolId: uuid('tool_id')
      .references(() => executionTools.id, { onDelete: 'cascade' })
      .notNull(),

    // Encrypted credentials
    credentials: jsonb('credentials').$type<ToolCredentials>().notNull(),

    // Override config per company
    configOverride: jsonb('config_override').$type<Partial<ToolConfig>>(),

    // Status
    isEnabled: boolean('is_enabled').default(true),
    lastUsedAt: timestamp('last_used_at'),

    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => ({
    companyToolIdx: uniqueIndex('company_tool_idx').on(table.companyId, table.toolId),
  })
);

// ============================================
// NOTE: Agent Skills are defined in marketplace.ts
// Use the 'skills' table from marketplace for skill definitions
// Use 'agentSkills' table from marketplace for agent-skill assignments
// ============================================

// ============================================
// EXECUTION TASKS
// ============================================

export interface ExecutionResult {
  success: boolean;
  data?: unknown;
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };
  metadata?: {
    executionTimeMs: number;
    toolCalls: number;
    tokensUsed?: number;
    costIncurred?: number;
  };
}

export const executionTasks = pgTable(
  'execution_tasks',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    companyId: uuid('company_id')
      .references(() => companies.id, { onDelete: 'cascade' })
      .notNull(),
    agentId: uuid('agent_id').references(() => agents.id, { onDelete: 'set null' }),

    // Task Identity
    agentType: agentTypeEnum('agent_type').notNull(),
    skillId: uuid('skill_id').references(() => skills.id, { onDelete: 'set null' }),
    skillSlug: varchar('skill_slug', { length: 100 }).notNull(),

    // Task Data
    taskType: varchar('task_type', { length: 100 }).notNull(),
    taskPayload: jsonb('task_payload').$type<Record<string, unknown>>().notNull(),

    // Execution
    status: executionStatusEnum('status').default('pending').notNull(),
    priority: integer('priority').default(5), // 1-10, higher = more priority

    // Queue info
    queuedAt: timestamp('queued_at'),
    startedAt: timestamp('started_at'),
    completedAt: timestamp('completed_at'),

    // Result
    result: jsonb('result').$type<ExecutionResult>(),

    // Retries
    attempts: integer('attempts').default(0),
    maxAttempts: integer('max_attempts').default(3),
    lastError: text('last_error'),

    // Cost tracking
    estimatedCost: decimal('estimated_cost', { precision: 10, scale: 6 }),
    actualCost: decimal('actual_cost', { precision: 10, scale: 6 }),

    // Parent task (for sub-tasks)
    parentTaskId: uuid('parent_task_id'),

    // Timestamps
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => ({
    companyIdx: index('exec_tasks_company_idx').on(table.companyId),
    statusIdx: index('exec_tasks_status_idx').on(table.status),
    agentTypeIdx: index('exec_tasks_agent_type_idx').on(table.agentType),
    createdAtIdx: index('exec_tasks_created_idx').on(table.createdAt),
    parentIdx: index('exec_tasks_parent_idx').on(table.parentTaskId),
  })
);

// ============================================
// BRAND IDENTITY
// ============================================

export interface BrandColors {
  primary: string;
  secondary?: string;
  accent?: string;
  background?: string;
  text?: string;
}

export interface BrandTypography {
  headingFont?: string;
  bodyFont?: string;
  fontSize?: {
    base: number;
    scale: number;
  };
}

export interface BrandVoice {
  tone: string[]; // e.g., ['professional', 'friendly', 'innovative']
  personality: string[];
  keywords: string[];
  avoidWords: string[];
}

export const brandIdentities = pgTable(
  'brand_identities',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    companyId: uuid('company_id')
      .references(() => companies.id, { onDelete: 'cascade' })
      .notNull()
      .unique(),

    // Visual Identity
    logoUrl: varchar('logo_url', { length: 500 }),
    logoLightUrl: varchar('logo_light_url', { length: 500 }), // For dark backgrounds
    faviconUrl: varchar('favicon_url', { length: 500 }),

    // Colors
    colors: jsonb('colors').$type<BrandColors>().default({ primary: '#3B82F6' }),

    // Typography
    typography: jsonb('typography').$type<BrandTypography>().default({}),

    // Brand Voice
    voice: jsonb('voice').$type<BrandVoice>().default({
      tone: ['professional'],
      personality: [],
      keywords: [],
      avoidWords: [],
    }),

    // Style Guide
    styleKeywords: jsonb('style_keywords').$type<string[]>().default([]),
    visualStyle: varchar('visual_style', { length: 50 }).default('modern'), // modern, classic, playful, etc.

    // Extraction source
    extractedFromUrl: varchar('extracted_from_url', { length: 500 }),
    extractedAt: timestamp('extracted_at'),

    // Timestamps
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => ({
    companyIdx: uniqueIndex('brand_company_idx').on(table.companyId),
  })
);

// ============================================
// GENERATED ASSETS
// ============================================

export interface AssetMetadata {
  width?: number;
  height?: number;
  duration?: number; // For video/audio in seconds
  fileSize?: number; // In bytes
  mimeType?: string;
  format?: string;

  // Generation info
  prompt?: string;
  model?: string;
  seed?: number;

  // Usage tracking
  usedInCampaigns?: string[];
  usedInPosts?: string[];
}

export const generatedAssets = pgTable(
  'generated_assets',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    companyId: uuid('company_id')
      .references(() => companies.id, { onDelete: 'cascade' })
      .notNull(),

    // Creator info
    createdByAgentId: uuid('created_by_agent_id').references(() => agents.id, { onDelete: 'set null' }),
    createdByAgentType: agentTypeEnum('created_by_agent_type'),
    createdByTaskId: uuid('created_by_task_id').references(() => executionTasks.id, { onDelete: 'set null' }),

    // Asset info
    name: varchar('name', { length: 255 }),
    assetType: assetTypeEnum('asset_type').notNull(),

    // Storage
    storageProvider: varchar('storage_provider', { length: 50 }).default('r2'), // r2, s3, local
    storageUrl: varchar('storage_url', { length: 1000 }).notNull(),
    publicUrl: varchar('public_url', { length: 1000 }),
    thumbnailUrl: varchar('thumbnail_url', { length: 1000 }),

    // Metadata
    metadata: jsonb('metadata').$type<AssetMetadata>().default({}),

    // Tags for organization
    tags: jsonb('tags').$type<string[]>().default([]),

    // Cost tracking
    generationCost: decimal('generation_cost', { precision: 10, scale: 6 }),

    // Status
    isPublic: boolean('is_public').default(false),
    isArchived: boolean('is_archived').default(false),

    // Timestamps
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => ({
    companyIdx: index('gen_assets_company_idx').on(table.companyId),
    typeIdx: index('gen_assets_type_idx').on(table.assetType),
    agentIdx: index('gen_assets_agent_idx').on(table.createdByAgentId),
    createdAtIdx: index('gen_assets_created_idx').on(table.createdAt),
  })
);

// ============================================
// RELATIONS
// ============================================

export const executionToolsRelations = relations(executionTools, ({ many }) => ({
  credentials: many(companyToolCredentials),
}));

export const companyToolCredentialsRelations = relations(companyToolCredentials, ({ one }) => ({
  company: one(companies, {
    fields: [companyToolCredentials.companyId],
    references: [companies.id],
  }),
  tool: one(executionTools, {
    fields: [companyToolCredentials.toolId],
    references: [executionTools.id],
  }),
}));

export const executionTasksRelations = relations(executionTasks, ({ one, many }) => ({
  company: one(companies, {
    fields: [executionTasks.companyId],
    references: [companies.id],
  }),
  agent: one(agents, {
    fields: [executionTasks.agentId],
    references: [agents.id],
  }),
  skill: one(skills, {
    fields: [executionTasks.skillId],
    references: [skills.id],
  }),
  parentTask: one(executionTasks, {
    fields: [executionTasks.parentTaskId],
    references: [executionTasks.id],
    relationName: 'taskHierarchy',
  }),
  subTasks: many(executionTasks, { relationName: 'taskHierarchy' }),
  assets: many(generatedAssets),
}));

export const brandIdentitiesRelations = relations(brandIdentities, ({ one }) => ({
  company: one(companies, {
    fields: [brandIdentities.companyId],
    references: [companies.id],
  }),
}));

export const generatedAssetsRelations = relations(generatedAssets, ({ one }) => ({
  company: one(companies, {
    fields: [generatedAssets.companyId],
    references: [companies.id],
  }),
  createdByAgent: one(agents, {
    fields: [generatedAssets.createdByAgentId],
    references: [agents.id],
  }),
  createdByTask: one(executionTasks, {
    fields: [generatedAssets.createdByTaskId],
    references: [executionTasks.id],
  }),
}));
