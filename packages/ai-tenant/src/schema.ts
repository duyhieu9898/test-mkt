// =============================================================================
// @1person/ai-tenant — Drizzle ORM Schema
// =============================================================================
// All tables are prefixed with 'ai_' to avoid conflicts with the main platform.
// This module owns its own tables — independent from @1person/core.
// =============================================================================

import {
  pgTable,
  uuid,
  varchar,
  text,
  timestamp,
  integer,
  jsonb,
  index,
  boolean,
  real,
} from 'drizzle-orm/pg-core';

// ---------------------------------------------------------------------------
// Tenants — maps to companies in the main platform, but fully independent
// ---------------------------------------------------------------------------
export const tenants = pgTable('ai_tenants', {
  id: uuid('id').primaryKey().defaultRandom(),
  externalId: varchar('external_id', { length: 255 }).notNull().unique(),
  name: varchar('name', { length: 255 }).notNull(),
  settings: jsonb('settings').default({}).notNull(),
  status: varchar('status', { length: 20 }).default('active').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// ---------------------------------------------------------------------------
// Agents — per-tenant AI agent configurations
// ---------------------------------------------------------------------------
export const tenantAgents = pgTable(
  'ai_tenant_agents',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .references(() => tenants.id, { onDelete: 'cascade' })
      .notNull(),
    name: varchar('name', { length: 255 }).notNull(),
    systemPrompt: text('system_prompt').notNull(),
    tone: varchar('tone', { length: 20 }).default('professional').notNull(),
    temperature: real('temperature').default(0.7).notNull(),
    maxContextChunks: integer('max_context_chunks').default(5).notNull(),
    tools: jsonb('tools').default([]).notNull(),
    isDefault: boolean('is_default').default(false),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => ({
    tenantIdx: index('ai_agents_tenant_idx').on(table.tenantId),
  }),
);

// ---------------------------------------------------------------------------
// Documents — files uploaded by tenants for RAG
// ---------------------------------------------------------------------------
export const tenantDocuments = pgTable(
  'ai_tenant_documents',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .references(() => tenants.id, { onDelete: 'cascade' })
      .notNull(),
    name: varchar('name', { length: 255 }).notNull(),
    mimeType: varchar('mime_type', { length: 100 }).notNull(),
    fileSize: integer('file_size'),
    fileHash: varchar('file_hash', { length: 64 }).notNull(),
    filePath: text('file_path'),
    chunkCount: integer('chunk_count').default(0).notNull(),
    status: varchar('status', { length: 20 }).default('uploading').notNull(),
    metadata: jsonb('metadata').default({}).notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => ({
    tenantIdx: index('ai_docs_tenant_idx').on(table.tenantId),
  }),
);

// ---------------------------------------------------------------------------
// Document Chunks — with embeddings for vector search
// ---------------------------------------------------------------------------
// NOTE: The embedding column uses jsonb since pgvector extension handling
// varies across environments. In production with pgvector installed, this
// should use the native vector type for optimal similarity search performance.
export const documentChunks = pgTable(
  'ai_document_chunks',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .references(() => tenants.id, { onDelete: 'cascade' })
      .notNull(),
    documentId: uuid('document_id')
      .references(() => tenantDocuments.id, { onDelete: 'cascade' })
      .notNull(),
    content: text('content').notNull(),
    chunkIndex: integer('chunk_index').notNull(),
    tokenCount: integer('token_count'),
    embedding: jsonb('embedding'),
    metadata: jsonb('metadata').default({}).notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => ({
    tenantIdx: index('ai_chunks_tenant_idx').on(table.tenantId),
    docIdx: index('ai_chunks_doc_idx').on(table.documentId),
  }),
);

// ---------------------------------------------------------------------------
// Audit Log — APPEND-ONLY, chain-hashed for tamper detection
// ---------------------------------------------------------------------------
// No updatedAt column — audit entries are IMMUTABLE.
// No delete operations should ever be performed on this table.
export const auditLog = pgTable(
  'ai_audit_log',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .references(() => tenants.id)
      .notNull(),
    action: varchar('action', { length: 50 }).notNull(),
    actor: varchar('actor', { length: 255 }).notNull(),
    details: jsonb('details').default({}).notNull(),
    dataHash: varchar('data_hash', { length: 64 }),
    previousEntryHash: varchar('previous_entry_hash', { length: 64 }),
    timestamp: timestamp('timestamp').defaultNow().notNull(),
  },
  (table) => ({
    tenantIdx: index('ai_audit_tenant_idx').on(table.tenantId),
    actionIdx: index('ai_audit_action_idx').on(table.action),
    timestampIdx: index('ai_audit_timestamp_idx').on(table.timestamp),
  }),
);

// ---------------------------------------------------------------------------
// Query History — for analytics and billing
// ---------------------------------------------------------------------------
export const queryHistory = pgTable(
  'ai_query_history',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .references(() => tenants.id, { onDelete: 'cascade' })
      .notNull(),
    agentId: uuid('agent_id').references(() => tenantAgents.id),
    question: text('question').notNull(),
    answer: text('answer').notNull(),
    retrievedChunkIds: jsonb('retrieved_chunk_ids').default([]).notNull(),
    promptTokens: integer('prompt_tokens'),
    completionTokens: integer('completion_tokens'),
    retrievalTimeMs: integer('retrieval_time_ms'),
    inferenceTimeMs: integer('inference_time_ms'),
    traceId: varchar('trace_id', { length: 64 }).notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => ({
    tenantIdx: index('ai_queries_tenant_idx').on(table.tenantId),
  }),
);
