/**
 * Embedding & semantic search — Block 3 infrastructure.
 *
 * Single table `embedding_chunks` stores all chunked content with a
 * 1536-dim OpenAI vector (text-embedding-3-small). Callers index any
 * content with `embedChunks(...)` and query the closest matches with
 * `semanticSearch(...)`. The pgvector `<=>` operator is cosine
 * distance, so smaller = better; we expose 1 - distance as the score.
 *
 * Cost: text-embedding-3-small is ~$0.02 per 1M tokens — call it
 * liberally. There's a per-text length cap of ~8k tokens at the
 * provider; we slice to 4k chars before embedding.
 *
 * Auto-index hooks:
 *   - Brand IQ generate/update -> embedBrandIqProfile()
 *   - Knowledge base create   -> embedKnowledgeEntry()
 *   - Blog post publish        -> embedBlogPost()
 * (Hooks wire up callers; this file only owns the primitives.)
 */
import { sql, eq, and } from 'drizzle-orm';
import { db } from '../lib/db';
import {
  embeddingChunks,
  type EmbeddingSource,
  type EmbeddingChunk,
} from '@1person/core/db';

const EMBEDDING_MODEL = 'text-embedding-3-small';
const EMBEDDING_DIM = 1536;
const MAX_CHARS_PER_CHUNK = 4000;
const TARGET_CHUNK_CHARS = 1200; // friendlier for retrieval granularity

/* ─── Chunking ───────────────────────────────────────────────────── */

/**
 * Split text into ~TARGET_CHUNK_CHARS chunks, preferring paragraph
 * boundaries. Very long single paragraphs are split mid-sentence.
 */
export function chunkText(text: string, targetSize = TARGET_CHUNK_CHARS): string[] {
  const cleaned = text.replace(/\r\n/g, '\n').trim();
  if (cleaned.length === 0) return [];
  if (cleaned.length <= targetSize) return [cleaned];

  // First pass: split on blank lines (paragraphs)
  const paras = cleaned.split(/\n\s*\n+/);
  const out: string[] = [];
  let buf = '';
  for (const p of paras) {
    if ((buf + '\n\n' + p).length > targetSize && buf.length > 0) {
      out.push(buf);
      buf = '';
    }
    if (p.length > targetSize) {
      // Split a very long paragraph on sentence boundaries.
      const sentences = p.match(/[^.!?]+[.!?]+\s*/g) ?? [p];
      let sBuf = buf;
      for (const s of sentences) {
        if ((sBuf + s).length > targetSize && sBuf.length > 0) {
          out.push(sBuf.trim());
          sBuf = '';
        }
        sBuf += s;
      }
      buf = sBuf;
    } else {
      buf = buf ? buf + '\n\n' + p : p;
    }
  }
  if (buf.trim()) out.push(buf.trim());
  return out.map((c) => c.slice(0, MAX_CHARS_PER_CHUNK));
}

/* ─── Embedding (calls OpenAI) ───────────────────────────────────── */

async function getOpenAIClient() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY required for embeddings');
  const OpenAI = (await import('openai')).default;
  return new OpenAI({ apiKey });
}

export async function embedTexts(inputs: string[]): Promise<number[][]> {
  if (inputs.length === 0) return [];
  const trimmed = inputs.map((t) => t.slice(0, MAX_CHARS_PER_CHUNK));
  const openai = await getOpenAIClient();
  const res = await openai.embeddings.create({
    model: EMBEDDING_MODEL,
    input: trimmed,
  });
  return res.data.map((d) => d.embedding as number[]);
}

/* ─── Indexing ───────────────────────────────────────────────────── */

export interface UpsertSourceArgs {
  companyId: string;
  sourceType: EmbeddingSource;
  sourceId: string;
  text: string;
  metadata?: Record<string, unknown>;
}

/**
 * Replace all chunks for a (sourceType, sourceId) tuple with freshly
 * embedded chunks of the new text. Idempotent — safe to call from any
 * "save" hook.
 */
export async function upsertSourceChunks(args: UpsertSourceArgs): Promise<number> {
  const chunks = chunkText(args.text);
  if (chunks.length === 0) return 0;

  // Delete old chunks for this source first
  await db
    .delete(embeddingChunks)
    .where(
      and(
        eq(embeddingChunks.companyId, args.companyId),
        eq(embeddingChunks.sourceType, args.sourceType),
        eq(embeddingChunks.sourceId, args.sourceId),
      ),
    );

  const embeddings = await embedTexts(chunks);
  if (embeddings.length !== chunks.length) {
    throw new Error('Embedding count mismatch');
  }

  await db.insert(embeddingChunks).values(
    chunks.map((chunkTxt, idx) => ({
      companyId: args.companyId,
      sourceType: args.sourceType,
      sourceId: args.sourceId,
      chunkText: chunkTxt,
      chunkOrder: idx,
      embedding: embeddings[idx]!,
      metadata: args.metadata ?? {},
    })),
  );

  return chunks.length;
}

/* ─── Search ─────────────────────────────────────────────────────── */

export interface SemanticSearchHit {
  id: string;
  sourceType: EmbeddingSource;
  sourceId: string | null;
  chunkText: string;
  score: number; // 0..1, higher is more similar
  metadata: Record<string, unknown>;
}

export interface SemanticSearchOptions {
  /** Limit results. */
  limit?: number;
  /** Restrict to one or more source types. */
  sourceTypes?: EmbeddingSource[];
  /** Minimum cosine similarity (0..1). */
  minScore?: number;
}

export async function semanticSearch(
  companyId: string,
  query: string,
  options: SemanticSearchOptions = {},
): Promise<SemanticSearchHit[]> {
  const limit = Math.min(50, Math.max(1, options.limit ?? 8));
  const minScore = options.minScore ?? 0.15;

  const [queryVector] = await embedTexts([query]);
  if (!queryVector) return [];
  const vectorLiteral = `[${queryVector.join(',')}]`;

  // Filter by source types if specified
  const sourceFilter = options.sourceTypes?.length
    ? sql`AND source_type = ANY(${sql.raw(`ARRAY[${options.sourceTypes.map((s) => `'${s}'`).join(',')}]`)})`
    : sql``;

  const rows = await db.execute<{
    id: string;
    source_type: EmbeddingSource;
    source_id: string | null;
    chunk_text: string;
    distance: number;
    metadata: Record<string, unknown>;
  }>(
    sql`
      SELECT
        id::text AS id,
        source_type,
        source_id,
        chunk_text,
        embedding <=> ${vectorLiteral}::vector AS distance,
        metadata
      FROM embedding_chunks
      WHERE company_id = ${companyId}
      ${sourceFilter}
      ORDER BY embedding <=> ${vectorLiteral}::vector
      LIMIT ${limit}
    `,
  );

  return (rows as any as Array<{
    id: string;
    source_type: EmbeddingSource;
    source_id: string | null;
    chunk_text: string;
    distance: number;
    metadata: Record<string, unknown>;
  }>)
    .map((r) => ({
      id: r.id,
      sourceType: r.source_type,
      sourceId: r.source_id,
      chunkText: r.chunk_text,
      score: 1 - r.distance,
      metadata: r.metadata ?? {},
    }))
    .filter((h) => h.score >= minScore);
}

/* ─── Auto-index hooks (called from other services) ──────────────── */

export async function embedBrandIqProfile(args: {
  companyId: string;
  profileId: string;
  text: string;
}): Promise<void> {
  await upsertSourceChunks({
    companyId: args.companyId,
    sourceType: 'brand_iq',
    sourceId: args.profileId,
    text: args.text,
  });
}

export async function embedKnowledgeEntry(args: {
  companyId: string;
  entryId: string;
  title: string;
  text: string;
  category?: string;
}): Promise<void> {
  await upsertSourceChunks({
    companyId: args.companyId,
    sourceType: 'knowledge_base',
    sourceId: args.entryId,
    text: `${args.title}\n\n${args.text}`,
    metadata: { category: args.category ?? 'general', title: args.title },
  });
}

export async function embedBlogPost(args: {
  companyId: string;
  postId: string;
  title: string;
  body: string;
}): Promise<void> {
  await upsertSourceChunks({
    companyId: args.companyId,
    sourceType: 'blog_post',
    sourceId: args.postId,
    text: `${args.title}\n\n${args.body}`,
    metadata: { title: args.title },
  });
}

/* ─── Misc helpers ───────────────────────────────────────────────── */

export async function deleteSourceChunks(
  companyId: string,
  sourceType: EmbeddingSource,
  sourceId: string,
): Promise<void> {
  await db
    .delete(embeddingChunks)
    .where(
      and(
        eq(embeddingChunks.companyId, companyId),
        eq(embeddingChunks.sourceType, sourceType),
        eq(embeddingChunks.sourceId, sourceId),
      ),
    );
}

export async function countChunks(companyId: string): Promise<{ total: number; bySource: Record<string, number> }> {
  const rows = await db.execute<{ source_type: string; n: number }>(
    sql`SELECT source_type, COUNT(*)::int AS n FROM embedding_chunks WHERE company_id = ${companyId} GROUP BY source_type`,
  );
  const bySource: Record<string, number> = {};
  let total = 0;
  for (const r of rows as any as Array<{ source_type: string; n: number }>) {
    bySource[r.source_type] = r.n;
    total += r.n;
  }
  return { total, bySource };
}

export { EMBEDDING_MODEL, EMBEDDING_DIM };
