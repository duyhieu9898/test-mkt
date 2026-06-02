/**
 * Block 3 — AI Employees + Vector Memory.
 *
 * Three tables ship in one block:
 *   - embedding_chunks  vector-indexed chunks from any source
 *                       (Brand IQ, knowledge base, blog posts, GSC
 *                       queries, GEO mentions). One table; the
 *                       source_type column lets the search filter.
 *   - agent_personalities  the 7 named "employees" (Cleo, Cassie,
 *                       Soshie, Seomi, Geoffrey, Penn, Vio). Seeded
 *                       lazily — first /employees call on a company
 *                       inserts the defaults if missing.
 *   - employee_chats   per-(company,employee) chat threads so the
 *                       founder's DM history with each employee is
 *                       persistent across sessions.
 *
 * The `vector` column type comes from the pgvector extension (already
 * enabled in 1person-postgres). Drizzle doesn't ship a first-class
 * vector type yet, so we declare it as a custom type that round-trips
 * as a literal string. We never read it as JSON in TypeScript — search
 * uses raw SQL with the `<=>` cosine-distance operator.
 */
import {
  pgTable,
  uuid,
  text,
  varchar,
  jsonb,
  timestamp,
  integer,
  index,
  customType,
} from 'drizzle-orm/pg-core';
import { companies } from './companies';

// Custom pgvector type — passes through as raw text "[0.1,0.2,...]".
const vector = (name: string, dim = 1536) =>
  customType<{ data: number[]; driverData: string }>({
    dataType() {
      return `vector(${dim})`;
    },
    toDriver(value: number[]): string {
      return `[${value.join(',')}]`;
    },
    fromDriver(value: string): number[] {
      // pg returns "[0.1,0.2,...]"
      return JSON.parse(value);
    },
  })(name);

/* ─── Embedding chunks ──────────────────────────────────────────── */

export type EmbeddingSource =
  | 'brand_iq'
  | 'knowledge_base'
  | 'blog_post'
  | 'gsc_query'
  | 'geo_mention'
  | 'meeting'
  | 'manual';

export const embeddingChunks = pgTable(
  'embedding_chunks',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    companyId: uuid('company_id').notNull().references(() => companies.id, { onDelete: 'cascade' }),

    sourceType: varchar('source_type', { length: 32 }).$type<EmbeddingSource>().notNull(),
    sourceId: text('source_id'), // foreign id (uuid as string, or composite slug)

    chunkText: text('chunk_text').notNull(),
    chunkOrder: integer('chunk_order').notNull().default(0), // 0..N within a source
    embedding: vector('embedding', 1536), // OpenAI text-embedding-3-small

    metadata: jsonb('metadata').default({}).notNull(),

    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (t) => ({
    companyIdx: index('embedding_chunks_company_idx').on(t.companyId),
    sourceIdx: index('embedding_chunks_source_idx').on(t.companyId, t.sourceType),
    sourceIdIdx: index('embedding_chunks_source_id_idx').on(t.companyId, t.sourceType, t.sourceId),
    // ivfflat index for cosine distance — created in migration, not via Drizzle DSL.
  }),
);

export type EmbeddingChunk = typeof embeddingChunks.$inferSelect;
export type NewEmbeddingChunk = typeof embeddingChunks.$inferInsert;

/* ─── Agent personalities (the 7 named employees) ──────────────── */

export type AgentDepartment =
  | 'executive'
  | 'marketing'
  | 'content'
  | 'seo'
  | 'support'
  | 'creative';

export interface AgentKpiSlot {
  /** Stable key e.g. "growth_score", "blogs_published_30d". */
  key: string;
  /** Human label shown in the employee card. */
  label: string;
  /** Where to fetch the value from — lets the API resolve it later. */
  source: 'growth_score' | 'blog_count' | 'geo_sov' | 'social_count' | 'leads_count' | 'chatbot_conversations' | 'static';
  /** Optional static value if source === 'static'. */
  staticValue?: string | number;
}

export const agentPersonalities = pgTable(
  'agent_personalities',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    companyId: uuid('company_id').notNull().references(() => companies.id, { onDelete: 'cascade' }),

    slug: varchar('slug', { length: 50 }).notNull(), // e.g. "cleo"
    name: varchar('name', { length: 80 }).notNull(),
    roleTitle: varchar('role_title', { length: 120 }).notNull(),
    department: varchar('department', { length: 32 }).$type<AgentDepartment>().notNull(),
    avatarEmoji: varchar('avatar_emoji', { length: 8 }).notNull(),
    accentColor: varchar('accent_color', { length: 7 }).notNull(), // #rrggbb

    intro: text('intro').notNull(), // 1-2 sentences shown on the team grid
    personaPrompt: text('persona_prompt').notNull(), // system prompt that defines how they speak

    kpiSlots: jsonb('kpi_slots').$type<AgentKpiSlot[]>().default([]).notNull(),

    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (t) => ({
    companyIdx: index('agent_personalities_company_idx').on(t.companyId),
    slugIdx: index('agent_personalities_slug_idx').on(t.companyId, t.slug),
  }),
);

export type AgentPersonality = typeof agentPersonalities.$inferSelect;
export type NewAgentPersonality = typeof agentPersonalities.$inferInsert;

/* ─── Employee chat threads ─────────────────────────────────────── */

export interface EmployeeChatMessage {
  role: 'founder' | 'employee';
  text: string;
  at: string; // ISO timestamp
  /** Top-K semantic snippets the employee leaned on, for transparency. */
  citations?: Array<{ sourceType: EmbeddingSource; preview: string; score: number }>;
}

export const employeeChats = pgTable(
  'employee_chats',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    companyId: uuid('company_id').notNull().references(() => companies.id, { onDelete: 'cascade' }),
    employeeSlug: varchar('employee_slug', { length: 50 }).notNull(),

    messages: jsonb('messages').$type<EmployeeChatMessage[]>().default([]).notNull(),

    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (t) => ({
    companyIdx: index('employee_chats_company_idx').on(t.companyId),
    threadIdx: index('employee_chats_thread_idx').on(t.companyId, t.employeeSlug),
  }),
);

export type EmployeeChat = typeof employeeChats.$inferSelect;
export type NewEmployeeChat = typeof employeeChats.$inferInsert;
