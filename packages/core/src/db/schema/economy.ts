import { pgTable, text, timestamp, uuid, jsonb, pgEnum, integer, real, boolean } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { companies } from './companies';
import { agents } from './agents';

// Resource type enum
export const resourceTypeEnum = pgEnum('resource_type', [
  'api_calls',        // LLM API calls
  'compute',          // CPU/GPU time
  'storage',          // File storage
  'bandwidth',        // Network bandwidth
  'tokens',           // LLM tokens
  'tools',            // Tool invocations
  'external_api',     // External API calls
]);

// Transaction type enum
export const transactionTypeEnum = pgEnum('transaction_type', [
  'allocation',       // Initial budget allocation
  'usage',            // Resource usage (debit)
  'bonus',            // Bonus credits
  'transfer',         // Transfer between agents
  'refund',           // Refund/rollback
  'reset',            // Monthly reset
  'adjustment',       // Manual adjustment
]);

// Agent credit accounts
export const agentCredits = pgTable('agent_credits', {
  id: uuid('id').defaultRandom().primaryKey(),
  agentId: uuid('agent_id').notNull().references(() => agents.id, { onDelete: 'cascade' }),
  companyId: uuid('company_id').notNull().references(() => companies.id, { onDelete: 'cascade' }),

  // Credit balances by resource type
  apiCallsBalance: integer('api_calls_balance').default(0).notNull(),
  apiCallsUsed: integer('api_calls_used').default(0).notNull(),
  tokensBalance: integer('tokens_balance').default(0).notNull(),
  tokensUsed: integer('tokens_used').default(0).notNull(),
  toolsBalance: integer('tools_balance').default(0).notNull(),
  toolsUsed: integer('tools_used').default(0).notNull(),
  externalApiBalance: integer('external_api_balance').default(0).notNull(),
  externalApiUsed: integer('external_api_used').default(0).notNull(),

  // Monthly limits
  monthlyApiCallsLimit: integer('monthly_api_calls_limit').default(10000).notNull(),
  monthlyTokensLimit: integer('monthly_tokens_limit').default(1000000).notNull(),
  monthlyToolsLimit: integer('monthly_tools_limit').default(5000).notNull(),
  monthlyExternalApiLimit: integer('monthly_external_api_limit').default(1000).notNull(),

  // Budget in USD equivalent
  budgetAllocation: real('budget_allocation').default(0).notNull(),
  budgetSpent: real('budget_spent').default(0).notNull(),

  // Performance multiplier (rewards for efficiency)
  performanceMultiplier: real('performance_multiplier').default(1.0).notNull(),

  // Last reset date
  lastResetAt: timestamp('last_reset_at').defaultNow().notNull(),

  // Metadata
  metadata: jsonb('metadata').$type<Record<string, unknown>>(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// Credit transactions ledger
export const creditTransactions = pgTable('credit_transactions', {
  id: uuid('id').defaultRandom().primaryKey(),
  companyId: uuid('company_id').notNull().references(() => companies.id, { onDelete: 'cascade' }),
  agentId: uuid('agent_id').notNull().references(() => agents.id, { onDelete: 'cascade' }),

  transactionType: transactionTypeEnum('transaction_type').notNull(),
  resourceType: resourceTypeEnum('resource_type').notNull(),

  // Amount (positive = credit, negative = debit)
  amount: integer('amount').notNull(),
  balanceBefore: integer('balance_before').notNull(),
  balanceAfter: integer('balance_after').notNull(),

  // Cost in USD (for usage transactions)
  costUsd: real('cost_usd'),

  // Reference to what caused this transaction
  referenceType: text('reference_type'), // task, action, transfer, etc.
  referenceId: text('reference_id'),

  // Description
  description: text('description'),

  // Related agent (for transfers)
  counterpartyAgentId: uuid('counterparty_agent_id'),

  // Metadata
  metadata: jsonb('metadata').$type<Record<string, unknown>>(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// Resource pricing configuration
export const resourcePricing = pgTable('resource_pricing', {
  id: uuid('id').defaultRandom().primaryKey(),
  companyId: uuid('company_id').notNull().references(() => companies.id, { onDelete: 'cascade' }),

  resourceType: resourceTypeEnum('resource_type').notNull(),
  name: text('name').notNull(),

  // Pricing per unit
  pricePerUnit: real('price_per_unit').notNull(),
  unitName: text('unit_name').notNull(), // 'call', 'token', '1K tokens', etc.

  // Model-specific pricing (for API calls)
  modelPricing: jsonb('model_pricing').$type<Record<string, { input: number; output: number }>>(),

  // Is this the default pricing
  isDefault: boolean('is_default').default(false).notNull(),

  // Metadata
  metadata: jsonb('metadata').$type<Record<string, unknown>>(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// Agent performance scores (for multiplier calculation)
export const agentPerformanceScores = pgTable('agent_performance_scores', {
  id: uuid('id').defaultRandom().primaryKey(),
  agentId: uuid('agent_id').notNull().references(() => agents.id, { onDelete: 'cascade' }),
  companyId: uuid('company_id').notNull().references(() => companies.id, { onDelete: 'cascade' }),

  // Period
  periodStart: timestamp('period_start').notNull(),
  periodEnd: timestamp('period_end').notNull(),

  // Scores (0-100)
  efficiencyScore: integer('efficiency_score').default(50).notNull(),    // Resource efficiency
  qualityScore: integer('quality_score').default(50).notNull(),          // Output quality
  speedScore: integer('speed_score').default(50).notNull(),              // Task completion speed
  collaborationScore: integer('collaboration_score').default(50).notNull(), // Team collaboration
  overallScore: integer('overall_score').default(50).notNull(),

  // Calculated multiplier
  calculatedMultiplier: real('calculated_multiplier').default(1.0).notNull(),

  // Details
  metrics: jsonb('metrics').$type<{
    tasksCompleted: number;
    tasksSuccessRate: number;
    avgTokensPerTask: number;
    avgResponseTime: number;
    collaborations: number;
    helpRequestsResolved: number;
  }>(),

  // Metadata
  metadata: jsonb('metadata').$type<Record<string, unknown>>(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// Credit transfer requests
export const creditTransferRequests = pgTable('credit_transfer_requests', {
  id: uuid('id').defaultRandom().primaryKey(),
  companyId: uuid('company_id').notNull().references(() => companies.id, { onDelete: 'cascade' }),

  fromAgentId: uuid('from_agent_id').notNull().references(() => agents.id, { onDelete: 'cascade' }),
  toAgentId: uuid('to_agent_id').notNull().references(() => agents.id, { onDelete: 'cascade' }),

  resourceType: resourceTypeEnum('resource_type').notNull(),
  amount: integer('amount').notNull(),

  // Status
  status: text('status').default('pending').notNull(), // pending, approved, rejected, completed

  // Reason
  reason: text('reason').notNull(),
  responseReason: text('response_reason'),

  // Approval
  approvedBy: text('approved_by'),       // 'auto', 'ceo', user ID
  approvedAt: timestamp('approved_at'),

  // Metadata
  metadata: jsonb('metadata').$type<Record<string, unknown>>(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// Relations
export const agentCreditsRelations = relations(agentCredits, ({ one }) => ({
  agent: one(agents, {
    fields: [agentCredits.agentId],
    references: [agents.id],
  }),
  company: one(companies, {
    fields: [agentCredits.companyId],
    references: [companies.id],
  }),
}));

export const creditTransactionsRelations = relations(creditTransactions, ({ one }) => ({
  agent: one(agents, {
    fields: [creditTransactions.agentId],
    references: [agents.id],
  }),
  company: one(companies, {
    fields: [creditTransactions.companyId],
    references: [companies.id],
  }),
}));

export const resourcePricingRelations = relations(resourcePricing, ({ one }) => ({
  company: one(companies, {
    fields: [resourcePricing.companyId],
    references: [companies.id],
  }),
}));

export const agentPerformanceScoresRelations = relations(agentPerformanceScores, ({ one }) => ({
  agent: one(agents, {
    fields: [agentPerformanceScores.agentId],
    references: [agents.id],
  }),
  company: one(companies, {
    fields: [agentPerformanceScores.companyId],
    references: [companies.id],
  }),
}));

export const creditTransferRequestsRelations = relations(creditTransferRequests, ({ one }) => ({
  fromAgent: one(agents, {
    fields: [creditTransferRequests.fromAgentId],
    references: [agents.id],
  }),
  toAgent: one(agents, {
    fields: [creditTransferRequests.toAgentId],
    references: [agents.id],
  }),
  company: one(companies, {
    fields: [creditTransferRequests.companyId],
    references: [companies.id],
  }),
}));

// Types
export type AgentCredits = typeof agentCredits.$inferSelect;
export type NewAgentCredits = typeof agentCredits.$inferInsert;
export type CreditTransaction = typeof creditTransactions.$inferSelect;
export type NewCreditTransaction = typeof creditTransactions.$inferInsert;
export type ResourcePricing = typeof resourcePricing.$inferSelect;
export type NewResourcePricing = typeof resourcePricing.$inferInsert;
export type AgentPerformanceScore = typeof agentPerformanceScores.$inferSelect;
export type NewAgentPerformanceScore = typeof agentPerformanceScores.$inferInsert;
export type CreditTransferRequest = typeof creditTransferRequests.$inferSelect;
export type NewCreditTransferRequest = typeof creditTransferRequests.$inferInsert;
