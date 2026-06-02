// =============================================================================
// @1person/ai-tenant — Deals store (doc 10 §6)
// =============================================================================
// Sales pipeline + append-only event log. Minimal CRUD for the Sales UI +
// Deal Assistant route.
// =============================================================================

import { eq, and, desc } from 'drizzle-orm';
import { deals, dealEvents } from './schema.js';
import { logAction } from './audit-trail.js';
import type { Database } from './db.js';

// ─── Types ───────────────────────────────────────────────────────────

export type DealStage =
  | 'discovery'
  | 'qualified'
  | 'proposal'
  | 'negotiation'
  | 'closed_won'
  | 'closed_lost';

export interface DealInput {
  title: string;
  contactName?: string | null;
  contactEmail?: string | null;
  company?: string | null;
  value?: string | null;
  currency?: string;
  stage?: DealStage;
  closeDate?: Date | null;
  notes?: string | null;
  nextAction?: string | null;
  nextActionDueAt?: Date | null;
  leadId?: string | null;
}

export interface Deal {
  id: string;
  tenantId: string;
  leadId: string | null;
  title: string;
  contactName: string | null;
  contactEmail: string | null;
  company: string | null;
  value: string | null;
  currency: string;
  stage: DealStage;
  closeDate: Date | null;
  notes: string | null;
  nextAction: string | null;
  nextActionDueAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface DealEventInput {
  type: 'stage_change' | 'note' | 'email_sent' | 'ai_suggestion' | 'meeting_logged';
  payload?: Record<string, unknown>;
}

export interface DealEvent {
  id: string;
  dealId: string;
  type: string;
  payload: Record<string, unknown>;
  createdAt: Date;
}

// ─── Row mappers ─────────────────────────────────────────────────────

function mapDeal(row: any): Deal {
  return {
    id: row.id,
    tenantId: row.tenantId,
    leadId: row.leadId ?? null,
    title: row.title,
    contactName: row.contactName ?? null,
    contactEmail: row.contactEmail ?? null,
    company: row.company ?? null,
    value: row.value ?? null,
    currency: row.currency,
    stage: row.stage as DealStage,
    closeDate: row.closeDate ?? null,
    notes: row.notes ?? null,
    nextAction: row.nextAction ?? null,
    nextActionDueAt: row.nextActionDueAt ?? null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function mapEvent(row: any): DealEvent {
  return {
    id: row.id,
    dealId: row.dealId,
    type: row.type,
    payload: (row.payload as Record<string, unknown>) ?? {},
    createdAt: row.createdAt,
  };
}

// ─── Deals CRUD ──────────────────────────────────────────────────────

export async function listDeals(db: Database, tenantId: string): Promise<Deal[]> {
  const rows = await db
    .select()
    .from(deals)
    .where(eq(deals.tenantId, tenantId))
    .orderBy(desc(deals.updatedAt));
  return rows.map(mapDeal);
}

export async function getDeal(
  db: Database,
  tenantId: string,
  dealId: string,
): Promise<Deal | null> {
  const rows = await db
    .select()
    .from(deals)
    .where(and(eq(deals.id, dealId), eq(deals.tenantId, tenantId)))
    .limit(1);
  return rows[0] ? mapDeal(rows[0]) : null;
}

export async function createDeal(
  db: Database,
  tenantId: string,
  input: DealInput,
  actor: string = 'system',
): Promise<Deal> {
  const [created] = await db
    .insert(deals)
    .values({
      tenantId,
      leadId: input.leadId ?? null,
      title: input.title,
      contactName: input.contactName ?? null,
      contactEmail: input.contactEmail ?? null,
      company: input.company ?? null,
      value: input.value ?? null,
      currency: input.currency ?? 'USD',
      stage: input.stage ?? 'discovery',
      closeDate: input.closeDate ?? null,
      notes: input.notes ?? null,
      nextAction: input.nextAction ?? null,
      nextActionDueAt: input.nextActionDueAt ?? null,
    })
    .returning();
  if (!created) throw new Error('Failed to create deal');
  await logAction(db, tenantId, 'data_access', actor, {
    kind: 'deal_create',
    dealId: created.id,
  });
  await db.insert(dealEvents).values({
    dealId: created.id,
    type: 'stage_change',
    payload: { from: null, to: created.stage, actor },
  });
  return mapDeal(created);
}

export async function updateDeal(
  db: Database,
  tenantId: string,
  dealId: string,
  input: Partial<DealInput>,
  actor: string = 'system',
): Promise<Deal> {
  const existing = await getDeal(db, tenantId, dealId);
  if (!existing) throw new Error('Deal not found');

  const [updated] = await db
    .update(deals)
    .set({
      ...(input.title !== undefined && { title: input.title }),
      ...(input.contactName !== undefined && { contactName: input.contactName }),
      ...(input.contactEmail !== undefined && { contactEmail: input.contactEmail }),
      ...(input.company !== undefined && { company: input.company }),
      ...(input.value !== undefined && { value: input.value }),
      ...(input.currency !== undefined && { currency: input.currency }),
      ...(input.stage !== undefined && { stage: input.stage }),
      ...(input.closeDate !== undefined && { closeDate: input.closeDate }),
      ...(input.notes !== undefined && { notes: input.notes }),
      ...(input.nextAction !== undefined && { nextAction: input.nextAction }),
      ...(input.nextActionDueAt !== undefined && { nextActionDueAt: input.nextActionDueAt }),
      updatedAt: new Date(),
    })
    .where(and(eq(deals.id, dealId), eq(deals.tenantId, tenantId)))
    .returning();
  if (!updated) throw new Error('Deal not found');

  if (input.stage && input.stage !== existing.stage) {
    await db.insert(dealEvents).values({
      dealId,
      type: 'stage_change',
      payload: { from: existing.stage, to: input.stage, actor },
    });
  }

  await logAction(db, tenantId, 'data_access', actor, {
    kind: 'deal_update',
    dealId,
  });
  return mapDeal(updated);
}

export async function deleteDeal(
  db: Database,
  tenantId: string,
  dealId: string,
  actor: string = 'system',
): Promise<void> {
  await db.delete(deals).where(and(eq(deals.id, dealId), eq(deals.tenantId, tenantId)));
  await logAction(db, tenantId, 'data_access', actor, {
    kind: 'deal_delete',
    dealId,
  });
}

// ─── Events ──────────────────────────────────────────────────────────

export async function listDealEvents(
  db: Database,
  dealId: string,
  limit: number = 50,
): Promise<DealEvent[]> {
  const rows = await db
    .select()
    .from(dealEvents)
    .where(eq(dealEvents.dealId, dealId))
    .orderBy(desc(dealEvents.createdAt))
    .limit(limit);
  return rows.map(mapEvent);
}

export async function appendDealEvent(
  db: Database,
  dealId: string,
  input: DealEventInput,
): Promise<DealEvent> {
  const [row] = await db
    .insert(dealEvents)
    .values({
      dealId,
      type: input.type,
      payload: (input.payload ?? {}) as any,
    })
    .returning();
  if (!row) throw new Error('Failed to append deal event');
  return mapEvent(row);
}
