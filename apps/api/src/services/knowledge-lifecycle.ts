import { and, desc, eq, inArray, like, or } from 'drizzle-orm';
import { embeddingChunks, knowledgeBase } from '@1person/core/db';
import { db } from '../lib/db';
import { embedKnowledgeEntry } from './embedding-service';

export interface ApprovedKnowledgeItem {
  category: string;
  title: string;
  content: string;
  confidence?: number;
  visibility?: 'public' | 'internal' | 'confidential';
  tags?: string[];
}

export interface KnowledgeSyncResult {
  saved: number;
  indexed: number;
  indexingFailed: number;
}

/** User-managed knowledge that may appear in Knowledge Search. */
function searchableKnowledgeSource() {
  return or(
    like(knowledgeBase.source, 'document:%'),
    like(knowledgeBase.source, 'meeting:%'),
  );
}

/**
 * Replaces every approved fact for one source. Database replacement is atomic;
 * vector indexing happens afterward and is safe to retry because each entry is
 * upserted by its stable knowledge-base ID.
 */
export async function replaceApprovedKnowledge(params: {
  companyId: string;
  source: string;
  items: ApprovedKnowledgeItem[];
  verifiedByUserId?: string;
}): Promise<KnowledgeSyncResult> {
  const source = params.source.slice(0, 100);
  const items = params.items.filter((item) => item.title.trim() && item.content.trim());

  const inserted = await db.transaction(async (tx) => {
    const existing = await tx
      .select({ id: knowledgeBase.id })
      .from(knowledgeBase)
      .where(and(
        eq(knowledgeBase.companyId, params.companyId),
        eq(knowledgeBase.source, source),
      ));

    const existingIds = existing.map((entry) => entry.id);
    if (existingIds.length > 0) {
      await tx.delete(embeddingChunks).where(and(
        eq(embeddingChunks.companyId, params.companyId),
        eq(embeddingChunks.sourceType, 'knowledge_base'),
        inArray(embeddingChunks.sourceId, existingIds),
      ));
    }

    await tx.delete(knowledgeBase).where(and(
      eq(knowledgeBase.companyId, params.companyId),
      eq(knowledgeBase.source, source),
    ));

    if (items.length === 0) return [];

    return tx.insert(knowledgeBase).values(items.map((item) => ({
      companyId: params.companyId,
      source,
      category: item.category || 'general',
      title: item.title.slice(0, 255),
      content: item.content,
      confidence: item.confidence ?? 1,
      verifiedByUserId: params.verifiedByUserId,
      visibility: item.visibility ?? 'internal',
      tags: [...new Set(item.tags ?? [])],
    }))).returning({
      id: knowledgeBase.id,
      title: knowledgeBase.title,
      content: knowledgeBase.content,
      category: knowledgeBase.category,
    });
  });

  const indexing = await Promise.allSettled(inserted.map((entry) =>
    embedKnowledgeEntry({
      companyId: params.companyId,
      entryId: entry.id,
      title: entry.title,
      text: entry.content,
      category: entry.category,
    })
  ));
  const indexed = indexing.filter((result) => result.status === 'fulfilled').length;

  return {
    saved: inserted.length,
    indexed,
    indexingFailed: inserted.length - indexed,
  };
}

/** Removes an approved source and all vector chunks derived from it. */
export async function removeApprovedKnowledge(companyId: string, source: string): Promise<number> {
  return db.transaction(async (tx) => {
    const existing = await tx
      .select({ id: knowledgeBase.id })
      .from(knowledgeBase)
      .where(and(eq(knowledgeBase.companyId, companyId), eq(knowledgeBase.source, source)));
    const ids = existing.map((entry) => entry.id);

    if (ids.length > 0) {
      await tx.delete(embeddingChunks).where(and(
        eq(embeddingChunks.companyId, companyId),
        eq(embeddingChunks.sourceType, 'knowledge_base'),
        inArray(embeddingChunks.sourceId, ids),
      ));
    }

    await tx.delete(knowledgeBase).where(and(
      eq(knowledgeBase.companyId, companyId),
      eq(knowledgeBase.source, source),
    ));
    return ids.length;
  });
}

/**
 * Lazily backfills approved entries created before the unified lifecycle was
 * introduced. Once indexed, later calls only perform two lightweight reads.
 */
export async function ensureApprovedKnowledgeIndexed(companyId: string): Promise<KnowledgeSyncResult> {
  const [entries, chunks] = await Promise.all([
    db.select({
      id: knowledgeBase.id,
      title: knowledgeBase.title,
      content: knowledgeBase.content,
      category: knowledgeBase.category,
    })
      .from(knowledgeBase)
      .where(and(
        eq(knowledgeBase.companyId, companyId),
        searchableKnowledgeSource(),
      ))
      .orderBy(desc(knowledgeBase.updatedAt))
      .limit(500),
    db.select({ sourceId: embeddingChunks.sourceId })
      .from(embeddingChunks)
      .where(and(
        eq(embeddingChunks.companyId, companyId),
        eq(embeddingChunks.sourceType, 'knowledge_base'),
      )),
  ]);

  const indexedIds = new Set(chunks.map((chunk) => chunk.sourceId).filter(Boolean));
  // Bound lazy work so the first search remains responsive on older accounts.
  const missing = entries.filter((entry) => !indexedIds.has(entry.id)).slice(0, 50);
  const indexing = await Promise.allSettled(missing.map((entry) =>
    embedKnowledgeEntry({
      companyId,
      entryId: entry.id,
      title: entry.title,
      text: entry.content,
      category: entry.category,
    })
  ));
  const indexed = indexing.filter((result) => result.status === 'fulfilled').length;

  return {
    saved: entries.length,
    indexed,
    indexingFailed: missing.length - indexed,
  };
}
