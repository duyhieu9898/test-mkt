/**
 * Event service — the single write path into the Brain Hub.
 *
 * Every adapter (manual_upload, bulk_import, internal_tap, future
 * OAuth/webhook/polling) funnels through `ingestEvent`. The function:
 *   1. embeds `content` via the existing embedding-service primitives
 *   2. runs the auto-tagger (LLM topic + sentiment, fast model)
 *   3. writes a single row to `data_events`
 *   4. bumps the source's `event_count` + `last_synced_at`
 *
 * Embedding is best-effort: if OPENAI_API_KEY is missing or the call
 * fails the event still writes (embedding=null, topic_tags=[]). Phase B
 * watchers will simply ignore those rows until a re-process job runs.
 *
 * Single internal tap helper `ingestInternalTap(...)` is the convenience
 * wrapper for chatbot / omnichannel / lead capture / growth-score —
 * lazily creates the corresponding `internal_tap` source row on first
 * use so callers don't need to manage source IDs.
 */
import { eq, and, sql } from 'drizzle-orm';
import { db } from '../../lib/db';
import {
  dataSources,
  dataEvents,
  type DataSource,
  type DataEvent,
  type EventType,
  type InternalTapSubtype,
} from '@1person/core/db';
import { embedTexts } from '../embedding-service';
import { autoTag } from './auto-tagger';

export interface IngestEventInput {
  companyId: string;
  sourceId: string;
  type: EventType;
  subject: string;
  content: string;
  payload?: Record<string, unknown>;
  occurredAt?: Date;
  /** Skip the auto-tagger LLM call (e.g. for bulk back-fills). */
  skipTagging?: boolean;
  /** Skip the embedding step (e.g. integration tests). */
  skipEmbedding?: boolean;
}

export async function ingestEvent(input: IngestEventInput): Promise<DataEvent> {
  // Trim subject defensively — DB column is varchar(255).
  const subject = input.subject.slice(0, 250);
  const content = input.content.trim();

  // ── Embed (best-effort) ─────────────────────────────────────────
  let embedding: number[] | null = null;
  if (!input.skipEmbedding && content.length > 0 && process.env.OPENAI_API_KEY) {
    try {
      const [vec] = await embedTexts([content]);
      embedding = vec ?? null;
    } catch (err) {
      console.warn('[brain-hub] embedding failed for event:', err);
    }
  }

  // ── Auto-tag (best-effort) ──────────────────────────────────────
  let topicTags: string[] = [];
  let sentiment: DataEvent['sentiment'] = null;
  if (!input.skipTagging && content.length > 0) {
    const tagged = await autoTag({ subject, content });
    topicTags = tagged.topicTags;
    sentiment = tagged.sentiment;
  }

  // ── Insert ──────────────────────────────────────────────────────
  const [row] = await db
    .insert(dataEvents)
    .values({
      companyId: input.companyId,
      sourceId: input.sourceId,
      type: input.type,
      subject,
      content,
      payload: input.payload ?? {},
      embedding: embedding ?? undefined,
      topicTags,
      sentiment: sentiment ?? undefined,
      occurredAt: input.occurredAt ?? new Date(),
    })
    .returning();

  // ── Bump source counters (single SQL, no race) ──────────────────
  await db.execute(sql`
    UPDATE data_sources SET
      last_synced_at = NOW(),
      updated_at = NOW(),
      event_count = jsonb_set(
        jsonb_set(
          COALESCE(event_count, '{"total":0,"last7d":0}'::jsonb),
          '{total}',
          to_jsonb(COALESCE((event_count->>'total')::int, 0) + 1)
        ),
        '{last7d}',
        to_jsonb(COALESCE((event_count->>'last7d')::int, 0) + 1)
      )
    WHERE id = ${input.sourceId}
  `);

  // ── Phase B: trigger watcher evaluation (fire-and-forget) ───────
  // Dynamic import so the auto-tagger / embedding fail paths don't
  // double-block on a circular import, and so this stays optional if
  // Phase B is ever toggled off.
  void import('./watcher-evaluator').then(({ evaluateAfterIngest }) =>
    evaluateAfterIngest(input.companyId),
  );

  return row as DataEvent;
}

/* ─── Internal tap helper ──────────────────────────────────────── */

/**
 * Lazily get-or-create the source row that backs an internal tap.
 * Each (companyId, subtype) maps to exactly one source — chatbot
 * messages all flow through the same chatbot_message source.
 */
async function getOrCreateInternalTapSource(
  companyId: string,
  subtype: InternalTapSubtype,
): Promise<DataSource> {
  const existing = await db.query.dataSources.findFirst({
    where: and(
      eq(dataSources.companyId, companyId),
      eq(dataSources.type, 'internal_tap'),
      eq(dataSources.subtype, subtype),
    ),
  });
  if (existing) return existing;

  const name = INTERNAL_TAP_NAMES[subtype];
  const [row] = await db
    .insert(dataSources)
    .values({
      companyId,
      name,
      type: 'internal_tap',
      subtype,
      config: { autoCreated: true },
      status: 'active',
    })
    .returning();
  return row as DataSource;
}

const INTERNAL_TAP_NAMES: Record<InternalTapSubtype, string> = {
  chatbot_message: 'Chatbot conversations',
  omnichannel_message: 'Omnichannel inbox (FB / IG / Zalo)',
  lead_capture: 'Lead capture forms',
  growth_score_delta: 'Growth Score changes',
};

export interface InternalTapInput {
  companyId: string;
  subtype: InternalTapSubtype;
  type: EventType;
  subject: string;
  content: string;
  payload?: Record<string, unknown>;
  occurredAt?: Date;
}

/**
 * Fire-and-forget convenience for internal taps. Swallows any error and
 * logs a warning — callers (chatbot reply path, lead capture handler)
 * should never have their happy path broken by Brain Hub.
 */
export async function ingestInternalTap(input: InternalTapInput): Promise<void> {
  try {
    const source = await getOrCreateInternalTapSource(input.companyId, input.subtype);
    await ingestEvent({
      companyId: input.companyId,
      sourceId: source.id,
      type: input.type,
      subject: input.subject,
      content: input.content,
      payload: input.payload,
      occurredAt: input.occurredAt,
    });
  } catch (err) {
    console.warn('[brain-hub] internal tap ingest failed:', input.subtype, err);
  }
}
