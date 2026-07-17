/**
 * Brain Hub API — Phase A.
 *
 * Path: /api/v1/brain-hub/:companyId/...
 *
 * Surfaces:
 *   - GET    /:companyId/sources                  list sources
 *   - DELETE /:companyId/sources/:id              remove a source (+ events cascade)
 *   - PATCH  /:companyId/sources/:id              rename / pause / resume
 *   - GET    /:companyId/events                   recent events + filters
 *   - POST   /:companyId/events/search            hybrid semantic + lexical search
 *   - GET    /:companyId/analytics/top-topics     top tags this week
 *   - GET    /:companyId/analytics/summary        counts by source type + sentiment
 *   - POST   /:companyId/upload                   manual_upload (multipart)
 *   - POST   /:companyId/bulk-import              bulk_import (JSON paste)
 *   - GET    /:companyId/adapters                 list adapter descriptors (for UI)
 */
import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { and, desc, eq, sql, gte } from 'drizzle-orm';
import { HTTPException } from 'hono/http-exception';
import { db } from '../lib/db';
import {
  companies,
  dataSources,
  dataEvents,
  brainWatchers,
  brainReactions,
} from '@1person/core/db';
import { authMiddleware } from '../middleware/auth';
import { ingestUpload } from '../services/brain-hub/adapters/manual-upload';
import { ingestBulkImport } from '../services/brain-hub/adapters/bulk-import';
import { ADAPTERS } from '../services/brain-hub/adapters/index';
import { searchBrainEvents } from '../services/brain-hub/search';
import { ensureDefaultWatchers } from '../services/brain-hub/watcher-seeder';
import { evaluateAllWatchers } from '../services/brain-hub/watcher-evaluator';
import { approveReaction, dismissReaction } from '../services/brain-hub/reaction-approver';

const brainHubRouter = new Hono();
brainHubRouter.use('*', authMiddleware);

async function verifyOwnership(companyId: string, userId: string): Promise<void> {
  const company = await db.query.companies.findFirst({
    where: eq(companies.id, companyId),
    columns: { id: true, ownerId: true },
  });
  if (!company) throw new HTTPException(404, { message: 'Company not found' });
  if (company.ownerId !== userId) {
    throw new HTTPException(403, { message: 'You do not own this company' });
  }
}

/* ─── Adapters (static catalog) ────────────────────────────────── */

brainHubRouter.get('/adapters', async (c) => {
  return c.json({ data: ADAPTERS });
});

/* ─── Sources ──────────────────────────────────────────────────── */

brainHubRouter.get('/:companyId/sources', async (c) => {
  const { userId } = c.get('user');
  const companyId = c.req.param('companyId');
  await verifyOwnership(companyId, userId);

  const sources = await db
    .select()
    .from(dataSources)
    .where(eq(dataSources.companyId, companyId))
    .orderBy(desc(dataSources.createdAt));

  return c.json({ data: sources });
});

const patchSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  status: z.enum(['active', 'paused', 'error']).optional(),
});

brainHubRouter.patch('/:companyId/sources/:id', zValidator('json', patchSchema), async (c) => {
  const { userId } = c.get('user');
  const companyId = c.req.param('companyId');
  const id = c.req.param('id');
  await verifyOwnership(companyId, userId);

  const body = c.req.valid('json');
  const [updated] = await db
    .update(dataSources)
    .set({ ...body, updatedAt: new Date() })
    .where(and(eq(dataSources.id, id), eq(dataSources.companyId, companyId)))
    .returning();

  if (!updated) throw new HTTPException(404, { message: 'Source not found' });
  return c.json({ data: updated });
});

brainHubRouter.delete('/:companyId/sources/:id', async (c) => {
  const { userId } = c.get('user');
  const companyId = c.req.param('companyId');
  const id = c.req.param('id');
  await verifyOwnership(companyId, userId);

  const result = await db
    .delete(dataSources)
    .where(and(eq(dataSources.id, id), eq(dataSources.companyId, companyId)))
    .returning({ id: dataSources.id });

  if (result.length === 0) throw new HTTPException(404, { message: 'Source not found' });
  return c.json({ ok: true });
});

/* ─── Events ───────────────────────────────────────────────────── */

const listEventsSchema = z.object({
  sourceId: z.string().uuid().optional(),
  type: z.string().optional(),
  sentiment: z.string().optional(),
  topicTag: z.string().optional(),
  limit: z.coerce.number().min(1).max(200).default(50),
  offset: z.coerce.number().min(0).default(0),
});

brainHubRouter.get('/:companyId/events', zValidator('query', listEventsSchema), async (c) => {
  const { userId } = c.get('user');
  const companyId = c.req.param('companyId');
  await verifyOwnership(companyId, userId);

  const q = c.req.valid('query');

  const filters = [eq(dataEvents.companyId, companyId)];
  if (q.sourceId) filters.push(eq(dataEvents.sourceId, q.sourceId));
  if (q.type) filters.push(eq(dataEvents.type, q.type as any));
  if (q.sentiment) filters.push(eq(dataEvents.sentiment, q.sentiment as any));

  let baseQuery = db
    .select({
      id: dataEvents.id,
      sourceId: dataEvents.sourceId,
      type: dataEvents.type,
      subject: dataEvents.subject,
      content: dataEvents.content,
      topicTags: dataEvents.topicTags,
      sentiment: dataEvents.sentiment,
      occurredAt: dataEvents.occurredAt,
      ingestedAt: dataEvents.ingestedAt,
    })
    .from(dataEvents)
    .where(and(...filters))
    .orderBy(desc(dataEvents.occurredAt))
    .limit(q.limit)
    .offset(q.offset);

  let rows = await baseQuery;

  // Optional topic-tag filter (jsonb contains)
  if (q.topicTag) {
    const tag = q.topicTag.toLowerCase();
    rows = rows.filter((r) => Array.isArray(r.topicTags) && r.topicTags.includes(tag));
  }

  return c.json({ data: rows });
});

const searchSchema = z.object({
  query: z.string().min(2).max(500),
  limit: z.number().min(1).max(50).default(10),
  minScore: z.number().min(0).max(1).default(0.15),
});

brainHubRouter.post('/:companyId/events/search', zValidator('json', searchSchema), async (c) => {
  const { userId } = c.get('user');
  const companyId = c.req.param('companyId');
  await verifyOwnership(companyId, userId);

  const { query, limit, minScore } = c.req.valid('json');

  const hits = await searchBrainEvents({ companyId, query, limit, minScore });
  return c.json({ data: hits });
});

/* ─── Analytics ────────────────────────────────────────────────── */

brainHubRouter.get('/:companyId/analytics/summary', async (c) => {
  const { userId } = c.get('user');
  const companyId = c.req.param('companyId');
  await verifyOwnership(companyId, userId);

  const since7d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const [totals] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(dataEvents)
    .where(eq(dataEvents.companyId, companyId));

  const [week] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(dataEvents)
    .where(and(eq(dataEvents.companyId, companyId), gte(dataEvents.occurredAt, since7d)));

  const sentimentRows = await db.execute<{ sentiment: string | null; n: number }>(
    sql`SELECT sentiment, COUNT(*)::int AS n
        FROM data_events
        WHERE company_id = ${companyId} AND occurred_at >= ${since7d.toISOString()}
        GROUP BY sentiment`,
  );

  const sourceRows = await db.execute<{ type: string; n: number }>(
    sql`SELECT s.type, COUNT(e.id)::int AS n
        FROM data_sources s
        LEFT JOIN data_events e ON e.source_id = s.id AND e.occurred_at >= ${since7d.toISOString()}
        WHERE s.company_id = ${companyId}
        GROUP BY s.type`,
  );

  return c.json({
    data: {
      totalEvents: totals?.total ?? 0,
      eventsLast7d: week?.total ?? 0,
      sentimentBreakdown7d: rowsToMap(sentimentRows, 'sentiment'),
      eventsBySourceType7d: rowsToMap(sourceRows, 'type'),
    },
  });
});

brainHubRouter.get('/:companyId/analytics/top-topics', async (c) => {
  const { userId } = c.get('user');
  const companyId = c.req.param('companyId');
  await verifyOwnership(companyId, userId);

  const sinceDays = Number(c.req.query('days') ?? 7);
  const since = new Date(Date.now() - sinceDays * 24 * 60 * 60 * 1000);

  // Unnest the jsonb topic_tags array, group by tag, count.
  const rows = await db.execute<{ tag: string; n: number }>(
    sql`SELECT tag, COUNT(*)::int AS n
        FROM data_events,
             jsonb_array_elements_text(topic_tags) AS tag
        WHERE company_id = ${companyId} AND occurred_at >= ${since.toISOString()}
        GROUP BY tag
        ORDER BY n DESC
        LIMIT 30`,
  );

  return c.json({
    data: (rows as any as Array<{ tag: string; n: number }>).map((r) => ({ tag: r.tag, count: r.n })),
  });
});

/* ─── Upload + Bulk Import ─────────────────────────────────────── */

brainHubRouter.post('/:companyId/upload', async (c) => {
  const { userId } = c.get('user');
  const companyId = c.req.param('companyId');
  await verifyOwnership(companyId, userId);

  const formData = await c.req.formData();
  const file = formData.get('file') as File | null;
  const sourceName = (formData.get('sourceName') as string | null) ?? undefined;

  if (!file) throw new HTTPException(400, { message: 'No file provided (field: file)' });

  const buffer = Buffer.from(await file.arrayBuffer());
  try {
    const result = await ingestUpload({
      companyId,
      filename: file.name,
      mimeType: file.type || 'application/octet-stream',
      buffer,
      sourceName,
    });
    return c.json({ data: result });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Upload failed';
    throw new HTTPException(400, { message: msg });
  }
});

const bulkSchema = z.object({
  name: z.string().min(1).max(120),
  text: z.string().min(1).max(200_000),
  mode: z.enum(['single', 'lines', 'csv', 'double-newline']).default('single'),
  subjectPrefix: z.string().max(80).optional(),
});

brainHubRouter.post('/:companyId/bulk-import', zValidator('json', bulkSchema), async (c) => {
  const { userId } = c.get('user');
  const companyId = c.req.param('companyId');
  await verifyOwnership(companyId, userId);

  const body = c.req.valid('json');
  try {
    const result = await ingestBulkImport({ companyId, ...body });
    return c.json({ data: result });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Bulk import failed';
    throw new HTTPException(400, { message: msg });
  }
});

/* ─── Phase B: Watchers ────────────────────────────────────────── */

brainHubRouter.get('/:companyId/watchers', async (c) => {
  const { userId } = c.get('user');
  const companyId = c.req.param('companyId');
  await verifyOwnership(companyId, userId);

  // Idempotent: seeds defaults if a brand-new company hits this for
  // the first time. Surfacing watchers immediately is core to the UX.
  await ensureDefaultWatchers(companyId);

  const watchers = await db
    .select()
    .from(brainWatchers)
    .where(eq(brainWatchers.companyId, companyId))
    .orderBy(desc(brainWatchers.createdAt));

  return c.json({ data: watchers });
});

const watcherPatchSchema = z.object({
  name: z.string().min(1).max(160).optional(),
  description: z.string().optional(),
  status: z.enum(['active', 'paused']).optional(),
  autoMode: z.enum(['review', 'auto_high_conf']).optional(),
  cooldownHours: z.number().int().min(0).max(720).optional(),
  condition: z.any().optional(),
  actions: z.array(z.any()).optional(),
});

brainHubRouter.patch('/:companyId/watchers/:id', zValidator('json', watcherPatchSchema), async (c) => {
  const { userId } = c.get('user');
  const companyId = c.req.param('companyId');
  const id = c.req.param('id');
  await verifyOwnership(companyId, userId);

  const body = c.req.valid('json');
  const [updated] = await db
    .update(brainWatchers)
    .set({ ...body, updatedAt: new Date() })
    .where(and(eq(brainWatchers.id, id), eq(brainWatchers.companyId, companyId)))
    .returning();

  if (!updated) throw new HTTPException(404, { message: 'Watcher not found' });
  return c.json({ data: updated });
});

brainHubRouter.post('/:companyId/watchers/run-all', async (c) => {
  const { userId } = c.get('user');
  const companyId = c.req.param('companyId');
  await verifyOwnership(companyId, userId);

  const results = await evaluateAllWatchers(companyId);
  const fired = results.filter((r) => r.fired).length;
  return c.json({ data: { checked: results.length, fired, results } });
});

/* ─── Phase B: Reactions ───────────────────────────────────────── */

const reactionsQuerySchema = z.object({
  status: z.enum(['suggested', 'approved', 'published', 'dismissed', 'expired']).optional(),
  watcherId: z.string().uuid().optional(),
  limit: z.coerce.number().min(1).max(200).default(50),
});

brainHubRouter.get('/:companyId/reactions', zValidator('query', reactionsQuerySchema), async (c) => {
  const { userId } = c.get('user');
  const companyId = c.req.param('companyId');
  await verifyOwnership(companyId, userId);

  const q = c.req.valid('query');
  const filters = [eq(brainReactions.companyId, companyId)];
  if (q.status) filters.push(eq(brainReactions.status, q.status));
  if (q.watcherId) filters.push(eq(brainReactions.watcherId, q.watcherId));

  const rows = await db
    .select({
      id: brainReactions.id,
      watcherId: brainReactions.watcherId,
      groupKey: brainReactions.groupKey,
      headline: brainReactions.headline,
      summary: brainReactions.summary,
      drafts: brainReactions.drafts,
      triggerEventIds: brainReactions.triggerEventIds,
      status: brainReactions.status,
      firedAt: brainReactions.firedAt,
      reviewedAt: brainReactions.reviewedAt,
      expiresAt: brainReactions.expiresAt,
    })
    .from(brainReactions)
    .where(and(...filters))
    .orderBy(desc(brainReactions.firedAt))
    .limit(q.limit);

  return c.json({ data: rows });
});

brainHubRouter.get('/:companyId/reactions/:id/events', async (c) => {
  const { userId } = c.get('user');
  const companyId = c.req.param('companyId');
  const id = c.req.param('id');
  await verifyOwnership(companyId, userId);

  const reaction = await db.query.brainReactions.findFirst({
    where: and(eq(brainReactions.id, id), eq(brainReactions.companyId, companyId)),
  });
  if (!reaction) throw new HTTPException(404, { message: 'Reaction not found' });

  const ids = (reaction.triggerEventIds ?? []).slice(0, 20);
  if (ids.length === 0) return c.json({ data: [] });

  const events = await db
    .select({
      id: dataEvents.id,
      subject: dataEvents.subject,
      content: dataEvents.content,
      sentiment: dataEvents.sentiment,
      occurredAt: dataEvents.occurredAt,
      topicTags: dataEvents.topicTags,
    })
    .from(dataEvents)
    .where(and(
      eq(dataEvents.companyId, companyId),
      sql`${dataEvents.id} = ANY(${sql.raw(`ARRAY[${ids.map((i) => `'${i}'::uuid`).join(',')}]`)})`,
    ));

  return c.json({ data: events });
});

brainHubRouter.post('/:companyId/reactions/:id/approve', async (c) => {
  const { userId } = c.get('user');
  const companyId = c.req.param('companyId');
  const id = c.req.param('id');
  await verifyOwnership(companyId, userId);

  try {
    const result = await approveReaction(companyId, id);
    return c.json({ data: result });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Approve failed';
    throw new HTTPException(400, { message: msg });
  }
});

brainHubRouter.post('/:companyId/reactions/:id/dismiss', async (c) => {
  const { userId } = c.get('user');
  const companyId = c.req.param('companyId');
  const id = c.req.param('id');
  await verifyOwnership(companyId, userId);

  await dismissReaction(companyId, id);
  return c.json({ ok: true });
});

/* ─── helpers ──────────────────────────────────────────────────── */

function rowsToMap(rows: unknown, keyField: string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const r of rows as any as Array<Record<string, unknown>>) {
    const k = (r[keyField] as string | null) ?? 'unknown';
    out[k] = Number(r.n ?? 0);
  }
  return out;
}

export default brainHubRouter;
