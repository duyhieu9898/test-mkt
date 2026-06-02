// =============================================================================
// @1person/ai-tenant — Market & Competitors store (doc 10 §5)
// =============================================================================
// Per-tenant CRUD for tracked competitors + scan history. Only exposes the
// methods the Market UI + scan service actually call — no speculative helpers.
// =============================================================================

import { eq, and, desc } from 'drizzle-orm';
import { marketCompetitors, marketScans } from './schema.js';
import { logAction } from './audit-trail.js';
import type { Database } from './db.js';

// ─── Types ───────────────────────────────────────────────────────────

export interface CompetitorInput {
  name: string;
  url?: string | null;
  keywords?: string[];
  notes?: string | null;
}

export interface Signal {
  type: string;
  text: string;
  url?: string;
  date?: string;
}

export interface Competitor {
  id: string;
  tenantId: string;
  name: string;
  url: string | null;
  keywords: string[];
  notes: string | null;
  lastScanAt: Date | null;
  latestSignals: Signal[];
  createdAt: Date;
  updatedAt: Date;
}

export interface ScanSource {
  kind: string;
  url: string;
  fetchedAt: string;
}

export interface ScanRecord {
  id: string;
  tenantId: string;
  competitorId: string | null;
  status: string;
  startedAt: Date;
  completedAt: Date | null;
  sources: ScanSource[];
  signals: Signal[];
  aiSummary: string | null;
  recommendedAction: string | null;
  errorMessage: string | null;
}

// ─── Row mappers ─────────────────────────────────────────────────────

function mapCompetitor(row: any): Competitor {
  return {
    id: row.id,
    tenantId: row.tenantId,
    name: row.name,
    url: row.url ?? null,
    keywords: (row.keywords as string[]) ?? [],
    notes: row.notes ?? null,
    lastScanAt: row.lastScanAt ?? null,
    latestSignals: (row.latestSignals as Signal[]) ?? [],
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function mapScan(row: any): ScanRecord {
  return {
    id: row.id,
    tenantId: row.tenantId,
    competitorId: row.competitorId ?? null,
    status: row.status,
    startedAt: row.startedAt,
    completedAt: row.completedAt ?? null,
    sources: (row.sources as ScanSource[]) ?? [],
    signals: (row.signals as Signal[]) ?? [],
    aiSummary: row.aiSummary ?? null,
    recommendedAction: row.recommendedAction ?? null,
    errorMessage: row.errorMessage ?? null,
  };
}

// ─── Competitors ─────────────────────────────────────────────────────

export async function listCompetitors(
  db: Database,
  tenantId: string,
): Promise<Competitor[]> {
  const rows = await db
    .select()
    .from(marketCompetitors)
    .where(eq(marketCompetitors.tenantId, tenantId))
    .orderBy(desc(marketCompetitors.updatedAt));
  return rows.map(mapCompetitor);
}

export async function getCompetitor(
  db: Database,
  tenantId: string,
  competitorId: string,
): Promise<Competitor | null> {
  const rows = await db
    .select()
    .from(marketCompetitors)
    .where(and(eq(marketCompetitors.id, competitorId), eq(marketCompetitors.tenantId, tenantId)))
    .limit(1);
  return rows[0] ? mapCompetitor(rows[0]) : null;
}

export async function createCompetitor(
  db: Database,
  tenantId: string,
  input: CompetitorInput,
  actor: string = 'system',
): Promise<Competitor> {
  const [created] = await db
    .insert(marketCompetitors)
    .values({
      tenantId,
      name: input.name,
      url: input.url ?? null,
      keywords: (input.keywords ?? []) as any,
      notes: input.notes ?? null,
    })
    .returning();
  if (!created) throw new Error('Failed to create competitor');
  await logAction(db, tenantId, 'data_access', actor, {
    kind: 'market_competitor_create',
    competitorId: created.id,
  });
  return mapCompetitor(created);
}

export async function updateCompetitor(
  db: Database,
  tenantId: string,
  competitorId: string,
  input: Partial<CompetitorInput>,
  actor: string = 'system',
): Promise<Competitor> {
  const [updated] = await db
    .update(marketCompetitors)
    .set({
      ...(input.name !== undefined && { name: input.name }),
      ...(input.url !== undefined && { url: input.url }),
      ...(input.keywords !== undefined && { keywords: input.keywords as any }),
      ...(input.notes !== undefined && { notes: input.notes }),
      updatedAt: new Date(),
    })
    .where(
      and(eq(marketCompetitors.id, competitorId), eq(marketCompetitors.tenantId, tenantId)),
    )
    .returning();
  if (!updated) throw new Error('Competitor not found');
  await logAction(db, tenantId, 'data_access', actor, {
    kind: 'market_competitor_update',
    competitorId,
  });
  return mapCompetitor(updated);
}

export async function deleteCompetitor(
  db: Database,
  tenantId: string,
  competitorId: string,
  actor: string = 'system',
): Promise<void> {
  await db
    .delete(marketCompetitors)
    .where(
      and(eq(marketCompetitors.id, competitorId), eq(marketCompetitors.tenantId, tenantId)),
    );
  await logAction(db, tenantId, 'data_access', actor, {
    kind: 'market_competitor_delete',
    competitorId,
  });
}

// ─── Scans ───────────────────────────────────────────────────────────

export async function startScan(
  db: Database,
  tenantId: string,
  competitorId: string | null,
): Promise<ScanRecord> {
  const [row] = await db
    .insert(marketScans)
    .values({
      tenantId,
      competitorId,
      status: 'running',
    })
    .returning();
  if (!row) throw new Error('Failed to start scan');
  return mapScan(row);
}

export async function completeScan(
  db: Database,
  scanId: string,
  patch: {
    status: 'completed' | 'failed';
    sources?: ScanSource[];
    signals?: Signal[];
    aiSummary?: string | null;
    recommendedAction?: string | null;
    errorMessage?: string | null;
  },
): Promise<void> {
  await db
    .update(marketScans)
    .set({
      status: patch.status,
      completedAt: new Date(),
      ...(patch.sources !== undefined && { sources: patch.sources as any }),
      ...(patch.signals !== undefined && { signals: patch.signals as any }),
      ...(patch.aiSummary !== undefined && { aiSummary: patch.aiSummary }),
      ...(patch.recommendedAction !== undefined && { recommendedAction: patch.recommendedAction }),
      ...(patch.errorMessage !== undefined && { errorMessage: patch.errorMessage }),
    })
    .where(eq(marketScans.id, scanId));
}

export async function updateCompetitorAfterScan(
  db: Database,
  competitorId: string,
  signals: Signal[],
): Promise<void> {
  await db
    .update(marketCompetitors)
    .set({
      lastScanAt: new Date(),
      latestSignals: signals as any,
      updatedAt: new Date(),
    })
    .where(eq(marketCompetitors.id, competitorId));
}

export async function listScans(
  db: Database,
  tenantId: string,
  limit: number = 20,
): Promise<ScanRecord[]> {
  const rows = await db
    .select()
    .from(marketScans)
    .where(eq(marketScans.tenantId, tenantId))
    .orderBy(desc(marketScans.startedAt))
    .limit(limit);
  return rows.map(mapScan);
}
