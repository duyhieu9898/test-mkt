import { desc, eq, sql } from 'drizzle-orm';
import { dataEvents } from '@1person/core/db';
import { db } from '../../lib/db';
import { embedTexts } from '../embedding-service';

export interface BrainEventSearchHit {
  id: string;
  sourceId: string;
  type: string;
  subject: string;
  content: string;
  topicTags: string[];
  sentiment: string | null;
  occurredAt: string;
  score: number;
}

export interface BrainEventSearchOptions {
  companyId: string;
  query: string;
  limit?: number;
  minScore?: number;
}

function freshnessScore(occurredAt: string): number {
  const ageDays = Math.max(0, (Date.now() - new Date(occurredAt).getTime()) / 86_400_000);
  return Math.max(0, 1 - ageDays / 180);
}

/**
 * Hybrid Brain Hub retrieval. Semantic search is used when embeddings are
 * configured, while PostgreSQL full-text search provides a zero-cost fallback
 * and preserves exact product/topic matches.
 */
export async function searchBrainEvents(
  options: BrainEventSearchOptions,
): Promise<BrainEventSearchHit[]> {
  const limit = Math.min(50, Math.max(1, options.limit ?? 10));
  const minScore = options.minScore ?? 0.15;
  const candidates = new Map<string, BrainEventSearchHit>();

  if (process.env.OPENAI_API_KEY) {
    try {
      const [vector] = await embedTexts([options.query]);
      if (vector) {
        const literal = `[${vector.join(',')}]`;
        const rows = await db.execute<{
          id: string;
          source_id: string;
          type: string;
          subject: string;
          content: string;
          topic_tags: string[];
          sentiment: string | null;
          occurred_at: string;
          distance: number;
        }>(sql`
          SELECT id::text AS id, source_id::text AS source_id, type, subject, content,
                 topic_tags, sentiment, occurred_at,
                 embedding <=> ${literal}::vector AS distance
          FROM data_events
          WHERE company_id = ${options.companyId} AND embedding IS NOT NULL
          ORDER BY embedding <=> ${literal}::vector
          LIMIT ${limit * 2}
        `);

        for (const row of rows as any as Array<any>) {
          const semanticScore = Math.max(0, 1 - Number(row.distance));
          candidates.set(row.id, {
            id: row.id,
            sourceId: row.source_id,
            type: row.type,
            subject: row.subject,
            content: row.content,
            topicTags: row.topic_tags ?? [],
            sentiment: row.sentiment,
            occurredAt: row.occurred_at,
            score: semanticScore * 0.85 + freshnessScore(row.occurred_at) * 0.15,
          });
        }
      }
    } catch (error) {
      console.warn('[brain-hub] semantic search failed, using lexical fallback:', error);
    }
  }

  try {
    const rows = await db.execute<{
      id: string;
      source_id: string;
      type: string;
      subject: string;
      content: string;
      topic_tags: string[];
      sentiment: string | null;
      occurred_at: string;
      rank: number;
    }>(sql`
      SELECT id::text AS id, source_id::text AS source_id, type, subject, content,
             topic_tags, sentiment, occurred_at,
             ts_rank_cd(
               to_tsvector('simple', subject || ' ' || content),
               websearch_to_tsquery('simple', ${options.query})
             ) AS rank
      FROM data_events
      WHERE company_id = ${options.companyId}
        AND to_tsvector('simple', subject || ' ' || content)
            @@ websearch_to_tsquery('simple', ${options.query})
      ORDER BY rank DESC, occurred_at DESC
      LIMIT ${limit * 2}
    `);

    const maxRank = Math.max(0.0001, ...Array.from(rows as any as Array<any>, (row) => Number(row.rank)));
    for (const row of rows as any as Array<any>) {
      const lexicalScore = Math.min(1, Number(row.rank) / maxRank);
      const existing = candidates.get(row.id);
      const combinedScore = existing
        ? Math.min(1, existing.score * 0.75 + lexicalScore * 0.25)
        : lexicalScore * 0.85 + freshnessScore(row.occurred_at) * 0.15;
      candidates.set(row.id, {
        id: row.id,
        sourceId: row.source_id,
        type: row.type,
        subject: row.subject,
        content: row.content,
        topicTags: row.topic_tags ?? [],
        sentiment: row.sentiment,
        occurredAt: row.occurred_at,
        score: combinedScore,
      });
    }
  } catch (error) {
    console.warn('[brain-hub] lexical search failed:', error);
  }

  if (candidates.size === 0) {
    const recent = await db
      .select()
      .from(dataEvents)
      .where(eq(dataEvents.companyId, options.companyId))
      .orderBy(desc(dataEvents.occurredAt))
      .limit(Math.min(limit, 5));
    for (const row of recent) {
      candidates.set(row.id, {
        id: row.id,
        sourceId: row.sourceId,
        type: row.type,
        subject: row.subject,
        content: row.content,
        topicTags: row.topicTags ?? [],
        sentiment: row.sentiment ?? null,
        occurredAt: row.occurredAt.toISOString(),
        score: 0.15 + freshnessScore(row.occurredAt.toISOString()) * 0.1,
      });
    }
  }

  return [...candidates.values()]
    .filter((hit) => hit.score >= minScore)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}
