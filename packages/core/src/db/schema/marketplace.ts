import { pgTable, text, timestamp, uuid, jsonb, pgEnum, integer, real, boolean } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { companies } from './companies';
import { agents } from './agents';

// Skill category enum
export const skillCategoryEnum = pgEnum('skill_category', [
  'communication',    // Email, chat, messaging
  'analysis',         // Data analysis, research
  'content',          // Content creation, writing
  'marketing',        // Marketing, ads, SEO
  'sales',            // Sales, outreach, CRM
  'engineering',      // Code, technical tasks
  'design',           // Visual design, UI/UX
  'operations',       // Process automation, admin
  'finance',          // Accounting, budgeting
  'hr',               // Recruitment, people
  'legal',            // Contracts, compliance
  'custom',           // Custom skills
]);

// Skill status enum
export const skillStatusEnum = pgEnum('skill_status', [
  'draft',           // Being developed
  'testing',         // Under testing
  'published',       // Available in marketplace
  'deprecated',      // Old version, still works
  'archived',        // No longer available
]);

// Skills in the marketplace
export const skills = pgTable('skills', {
  id: uuid('id').defaultRandom().primaryKey(),
  companyId: uuid('company_id').references(() => companies.id, { onDelete: 'cascade' }), // null = public/shared skill

  // Skill info
  name: text('name').notNull(),
  slug: text('slug').notNull(),
  description: text('description'),
  shortDescription: text('short_description'),
  category: skillCategoryEnum('category').notNull(),
  status: skillStatusEnum('status').notNull().default('draft'),

  // Version
  version: text('version').default('1.0.0').notNull(),

  // Author
  authorId: text('author_id').notNull(), // user ID or 'system'
  authorName: text('author_name'),

  // Skill definition
  definition: jsonb('definition').$type<{
    triggers: string[];                   // What activates this skill
    prompts: {
      system: string;
      task: string;
    };
    tools: string[];                      // Required tools
    parameters: Array<{
      name: string;
      type: string;
      required: boolean;
      description?: string;
      default?: unknown;
    }>;
    outputFormat?: string;
    examples?: Array<{
      input: string;
      output: string;
    }>;
  }>().notNull(),

  // Requirements
  requiredCapabilities: text('required_capabilities').array(),
  minAgentLevel: integer('min_agent_level').default(0),

  // Metrics
  usageCount: integer('usage_count').default(0).notNull(),
  rating: real('rating'),
  reviewCount: integer('review_count').default(0).notNull(),

  // Tags for searchability
  tags: text('tags').array(),

  // Pricing (for premium skills)
  isPremium: boolean('is_premium').default(false).notNull(),
  creditCost: integer('credit_cost').default(0).notNull(),

  // Metadata
  metadata: jsonb('metadata').$type<Record<string, unknown>>(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// Agent installed skills
export const agentSkills = pgTable('agent_skills', {
  id: uuid('id').defaultRandom().primaryKey(),
  agentId: uuid('agent_id').notNull().references(() => agents.id, { onDelete: 'cascade' }),
  skillId: uuid('skill_id').notNull().references(() => skills.id, { onDelete: 'cascade' }),
  companyId: uuid('company_id').notNull().references(() => companies.id, { onDelete: 'cascade' }),

  // Custom configuration override
  customConfig: jsonb('custom_config').$type<Record<string, unknown>>(),

  // Enabled status
  enabled: boolean('enabled').default(true).notNull(),

  // Usage tracking
  usageCount: integer('usage_count').default(0).notNull(),
  lastUsedAt: timestamp('last_used_at'),

  // Performance metrics for this agent
  successRate: real('success_rate'),
  avgExecutionTime: real('avg_execution_time'),

  // Installed info
  installedAt: timestamp('installed_at').defaultNow().notNull(),
  installedBy: text('installed_by'), // user ID
});

// Skill reviews
export const skillReviews = pgTable('skill_reviews', {
  id: uuid('id').defaultRandom().primaryKey(),
  skillId: uuid('skill_id').notNull().references(() => skills.id, { onDelete: 'cascade' }),
  companyId: uuid('company_id').notNull().references(() => companies.id, { onDelete: 'cascade' }),

  // Review
  rating: integer('rating').notNull(), // 1-5
  title: text('title'),
  content: text('content'),

  // Reviewer
  reviewerId: text('reviewer_id').notNull(),
  reviewerName: text('reviewer_name'),

  // Helpful votes
  helpfulCount: integer('helpful_count').default(0).notNull(),

  // Metadata
  metadata: jsonb('metadata').$type<Record<string, unknown>>(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// Skill usage logs
export const skillUsageLogs = pgTable('skill_usage_logs', {
  id: uuid('id').defaultRandom().primaryKey(),
  skillId: uuid('skill_id').notNull().references(() => skills.id, { onDelete: 'cascade' }),
  agentId: uuid('agent_id').notNull().references(() => agents.id, { onDelete: 'cascade' }),
  companyId: uuid('company_id').notNull().references(() => companies.id, { onDelete: 'cascade' }),

  // Task reference
  taskId: uuid('task_id'),

  // Execution
  input: jsonb('input').$type<Record<string, unknown>>(),
  output: jsonb('output').$type<Record<string, unknown>>(),
  success: boolean('success').notNull(),
  errorMessage: text('error_message'),

  // Timing
  executionTimeMs: integer('execution_time_ms'),

  // Resource usage
  tokensUsed: integer('tokens_used'),
  costUsd: real('cost_usd'),

  // Metadata
  metadata: jsonb('metadata').$type<Record<string, unknown>>(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// Relations
export const skillsRelations = relations(skills, ({ one, many }) => ({
  company: one(companies, {
    fields: [skills.companyId],
    references: [companies.id],
  }),
  agentSkills: many(agentSkills),
  reviews: many(skillReviews),
  usageLogs: many(skillUsageLogs),
}));

export const agentSkillsRelations = relations(agentSkills, ({ one }) => ({
  agent: one(agents, {
    fields: [agentSkills.agentId],
    references: [agents.id],
  }),
  skill: one(skills, {
    fields: [agentSkills.skillId],
    references: [skills.id],
  }),
  company: one(companies, {
    fields: [agentSkills.companyId],
    references: [companies.id],
  }),
}));

export const skillReviewsRelations = relations(skillReviews, ({ one }) => ({
  skill: one(skills, {
    fields: [skillReviews.skillId],
    references: [skills.id],
  }),
  company: one(companies, {
    fields: [skillReviews.companyId],
    references: [companies.id],
  }),
}));

export const skillUsageLogsRelations = relations(skillUsageLogs, ({ one }) => ({
  skill: one(skills, {
    fields: [skillUsageLogs.skillId],
    references: [skills.id],
  }),
  agent: one(agents, {
    fields: [skillUsageLogs.agentId],
    references: [agents.id],
  }),
  company: one(companies, {
    fields: [skillUsageLogs.companyId],
    references: [companies.id],
  }),
}));

// Types
export type Skill = typeof skills.$inferSelect;
export type NewSkill = typeof skills.$inferInsert;
export type AgentSkill = typeof agentSkills.$inferSelect;
export type NewAgentSkill = typeof agentSkills.$inferInsert;
export type SkillReview = typeof skillReviews.$inferSelect;
export type NewSkillReview = typeof skillReviews.$inferInsert;
export type SkillUsageLog = typeof skillUsageLogs.$inferSelect;
export type NewSkillUsageLog = typeof skillUsageLogs.$inferInsert;
