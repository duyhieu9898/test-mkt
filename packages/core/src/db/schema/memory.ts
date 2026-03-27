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
  vector,
  real,
} from 'drizzle-orm/pg-core';
import { relations, sql } from 'drizzle-orm';
import { companies } from './companies';
import { agents } from './agents';
import { tasks } from './tasks';

// Memory types
export const memoryTypeEnum = pgEnum('memory_type', [
  'task_result',      // Results from completed tasks
  'strategy',         // Successful strategies
  'failure_lesson',   // Lessons from failures
  'customer_insight', // Customer/market insights
  'skill_knowledge',  // Domain knowledge
  'collaboration',    // Inter-agent collaboration patterns
  'decision',         // Important decisions made
  'feedback',         // User feedback
]);

export const memoryImportanceEnum = pgEnum('memory_importance', [
  'critical',   // Must remember
  'high',       // Important
  'medium',     // Useful
  'low',        // Nice to have
]);

// Agent memories table with vector embeddings
export const agentMemories = pgTable(
  'agent_memories',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    companyId: uuid('company_id')
      .references(() => companies.id, { onDelete: 'cascade' })
      .notNull(),
    agentId: uuid('agent_id')
      .references(() => agents.id, { onDelete: 'cascade' })
      .notNull(),

    // Memory content
    type: memoryTypeEnum('type').notNull(),
    title: varchar('title', { length: 255 }).notNull(),
    content: text('content').notNull(),
    summary: text('summary'), // Short summary for quick access

    // Vector embedding for semantic search (1536 dimensions for OpenAI ada-002)
    embedding: vector('embedding', { dimensions: 1536 }),

    // Importance and relevance
    importance: memoryImportanceEnum('importance').default('medium'),
    relevanceScore: real('relevance_score').default(1.0),
    accessCount: integer('access_count').default(0),
    lastAccessedAt: timestamp('last_accessed_at'),

    // Context
    sourceTaskId: uuid('source_task_id').references(() => tasks.id, { onDelete: 'set null' }),
    metadata: jsonb('metadata').$type<{
      tags?: string[];
      relatedAgentIds?: string[];
      campaign?: string;
      outcome?: 'success' | 'failure' | 'partial';
      metrics?: Record<string, number>;
      context?: Record<string, unknown>;
    }>(),

    // Lifecycle
    expiresAt: timestamp('expires_at'), // Some memories can expire
    isArchived: integer('is_archived').default(0), // Soft archive

    // Timestamps
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => ({
    agentIdx: index('memories_agent_idx').on(table.agentId),
    companyIdx: index('memories_company_idx').on(table.companyId),
    typeIdx: index('memories_type_idx').on(table.type),
    importanceIdx: index('memories_importance_idx').on(table.importance),
    // Vector similarity index (requires pgvector extension)
    // embeddingIdx: index('memories_embedding_idx').using('ivfflat', table.embedding.op('vector_cosine_ops')),
  })
);

// Memory associations - link memories that are related
export const memoryAssociations = pgTable(
  'memory_associations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    memoryId: uuid('memory_id')
      .references(() => agentMemories.id, { onDelete: 'cascade' })
      .notNull(),
    associatedMemoryId: uuid('associated_memory_id')
      .references(() => agentMemories.id, { onDelete: 'cascade' })
      .notNull(),
    associationType: varchar('association_type', { length: 50 }).default('related'),
    strength: real('strength').default(1.0), // How strongly related (0-1)
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => ({
    memoryIdx: index('associations_memory_idx').on(table.memoryId),
  })
);

// Knowledge base - shared company-wide knowledge
export const knowledgeBase = pgTable(
  'knowledge_base',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    companyId: uuid('company_id')
      .references(() => companies.id, { onDelete: 'cascade' })
      .notNull(),

    // Knowledge content
    category: varchar('category', { length: 100 }).notNull(),
    title: varchar('title', { length: 255 }).notNull(),
    content: text('content').notNull(),

    // Vector embedding
    embedding: vector('embedding', { dimensions: 1536 }),

    // Metadata
    source: varchar('source', { length: 100 }), // Where this knowledge came from
    confidence: real('confidence').default(1.0),
    verifiedByUserId: uuid('verified_by_user_id'),

    // Usage tracking
    usageCount: integer('usage_count').default(0),
    lastUsedAt: timestamp('last_used_at'),

    // Timestamps
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => ({
    companyIdx: index('knowledge_company_idx').on(table.companyId),
    categoryIdx: index('knowledge_category_idx').on(table.category),
  })
);

// Relations
export const agentMemoriesRelations = relations(agentMemories, ({ one, many }) => ({
  company: one(companies, {
    fields: [agentMemories.companyId],
    references: [companies.id],
  }),
  agent: one(agents, {
    fields: [agentMemories.agentId],
    references: [agents.id],
  }),
  sourceTask: one(tasks, {
    fields: [agentMemories.sourceTaskId],
    references: [tasks.id],
  }),
  associations: many(memoryAssociations),
}));

export const knowledgeBaseRelations = relations(knowledgeBase, ({ one }) => ({
  company: one(companies, {
    fields: [knowledgeBase.companyId],
    references: [companies.id],
  }),
}));
