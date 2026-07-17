import {
  pgTable,
  uuid,
  varchar,
  timestamp,
  jsonb,
  text,
  decimal,
  pgEnum,
  index,
  integer,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { users } from './users';

// Enums
export const companyStatusEnum = pgEnum('company_status', [
  'setup',
  'active',
  'paused',
  'archived',
]);

// Types
export interface CompanySettings {
  timezone: string;
  currency: string;
  language: string;
  /** Optional website supplied during company onboarding. */
  websiteUrl?: string;
  /** Onboarding path used to tailor the first-run guidance. */
  websiteOption?: 'has_website' | 'new_business' | 'skip';
  approvalThresholds: {
    spending: number;
    majorDecision: boolean;
  };
}

export interface CompanyGoals {
  primary: string;
  secondary: string[];
  kpis: Array<{
    name: string;
    target: number;
    unit: string;
  }>;
}

export interface GrowthPlanItem {
  action: string;
  timeline: string;
  expectedImpact: string;
  priority: 'high' | 'medium' | 'low';
  keyword?: string;
  platform?: string;
}

export interface GrowthPlanBlock {
  title: string;
  description: string;
  items: GrowthPlanItem[];
}

export interface GrowthMasterPlan {
  seoGrowthPlan: GrowthPlanBlock;
  contentPlan: GrowthPlanBlock;
  socialMediaPlan: GrowthPlanBlock;
}

export interface GrowthPlanHistoryEntry {
  version: number;
  plan: GrowthMasterPlan;
  generatedAt?: string;
  approvedAt?: string;
  updateReasons?: string[];
}

export interface GrowthPlanDraft {
  version: number;
  plan: GrowthMasterPlan;
  generatedAt: string;
  updateReasons: string[];
}

export interface BusinessPlan {
  vision: string;
  mission: string;
  targetAudience: {
    demographics: string[];
    painPoints: string[];
  };
  valueProposition: string;
  revenueModel: string;
  offerings?: string[];
  growthPlan?: GrowthMasterPlan;
  growthPlanVersion?: number;
  growthPlanGeneratedAt?: string;
  growthPlanApprovedAt?: string;
  growthPlanUpdateReasons?: string[];
  growthPlanHistory?: GrowthPlanHistoryEntry[];
  growthPlanDraft?: GrowthPlanDraft;
  competitors: string[];
  suggestedAgents: Array<{
    role: string;
    name: string;
    responsibilities: string[];
  }>;
}

// Companies table
export const companies = pgTable(
  'companies',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ownerId: uuid('owner_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),

    // Basic Info
    name: varchar('name', { length: 255 }).notNull(),
    slug: varchar('slug', { length: 100 }).notNull().unique(),
    description: text('description'),
    logo: varchar('logo', { length: 500 }),
    industry: varchar('industry', { length: 100 }),
    businessType: varchar('business_type', { length: 100 }),

    // Configuration
    status: companyStatusEnum('status').default('setup').notNull(),
    settings: jsonb('settings').$type<CompanySettings>().default({
      timezone: 'UTC',
      currency: 'USD',
      language: 'en',
      approvalThresholds: { spending: 1000, majorDecision: true },
    }),
    goals: jsonb('goals').$type<CompanyGoals>(),

    // Business Plan
    businessPlan: jsonb('business_plan').$type<BusinessPlan>(),

    // Budget
    totalBudget: decimal('total_budget', { precision: 12, scale: 2 }).default('0'),
    budgetSpent: decimal('budget_spent', { precision: 12, scale: 2 }).default('0'),
    monthlyBudget: decimal('monthly_budget', { precision: 12, scale: 2 }).default('1000'),

    // Agent Management
    maxAgents: integer('max_agents').default(10),
    autoSpawnEnabled: integer('auto_spawn_enabled').default(0), // 0 = false, 1 = true
    autoApproveSpawn: integer('auto_approve_spawn').default(0), // 0 = false, 1 = true

    // Timestamps
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
    launchedAt: timestamp('launched_at'),
  },
  (table) => ({
    ownerIdx: index('companies_owner_idx').on(table.ownerId),
    statusIdx: index('companies_status_idx').on(table.status),
  })
);

// Departments table
export const departments = pgTable(
  'departments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    companyId: uuid('company_id')
      .references(() => companies.id, { onDelete: 'cascade' })
      .notNull(),

    name: varchar('name', { length: 100 }).notNull(),
    description: text('description'),
    color: varchar('color', { length: 7 }).default('#6366f1'),
    icon: varchar('icon', { length: 50 }).default('building'),
    parentId: uuid('parent_id'),

    // Budget
    budgetAllocated: decimal('budget_allocated', { precision: 12, scale: 2 }).default('0'),
    budgetSpent: decimal('budget_spent', { precision: 12, scale: 2 }).default('0'),

    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => ({
    companyIdx: index('departments_company_idx').on(table.companyId),
  })
);

// Relations
export const companiesRelations = relations(companies, ({ one, many }) => ({
  owner: one(users, {
    fields: [companies.ownerId],
    references: [users.id],
  }),
  departments: many(departments),
}));

export const departmentsRelations = relations(departments, ({ one, many }) => ({
  company: one(companies, {
    fields: [departments.companyId],
    references: [companies.id],
  }),
  parent: one(departments, {
    fields: [departments.parentId],
    references: [departments.id],
    relationName: 'departmentHierarchy',
  }),
  children: many(departments, { relationName: 'departmentHierarchy' }),
}));
