// =============================================================================
// @1person/ai-tenant — CEO Advisor briefs store (doc 10 §8)
// =============================================================================
// Append-only history of Chief of Staff briefs. The CEO Advisor UI reads the
// latest brief + lets the user trigger a refresh which writes a new row.
// =============================================================================

import { eq, desc } from 'drizzle-orm';
import { ceoAdvisorBriefs } from './schema.js';
import { logAction } from './audit-trail.js';
import type { Database } from './db.js';

// ─── Types ───────────────────────────────────────────────────────────

export interface BriefAction {
  title: string;
  why: string;
  impact?: string;
  link?: string;
  severity?: 'critical' | 'high' | 'medium' | 'low';
  priority?: 'urgent' | 'high' | 'medium' | 'low';
  confidence?: 'high' | 'medium' | 'low';
  issue?: string;
  evidenceSummary?: string;
  recommendation?: string;
  expectedImpact?: string;
  marketContext?: string;
  todayMove?: string;
  sevenDayMove?: string;
  strategicGap?: AdvisorStrategicGap;
  evidence?: BriefEvidence[];
  actionKind?: 'campaign' | 'content' | 'sales' | 'market' | 'operations';
  campaignProposal?: CampaignProposal;
  responsibleDepartments?: AdvisorResponsibleDepartment[];
  teamTasks?: AdvisorTeamTask[];
}

export interface AdvisorStrategicGap {
  type: 'market_gap' | 'content_gap' | 'creative_gap' | 'channel_gap' | 'conversion_gap' | 'knowledge_gap';
  marketSignal?: string;
  internalMissingPiece?: string;
  suggestedAssets?: Array<'blog' | 'landing_page' | 'social_posts' | 'banner_images' | 'video' | 'market_scan' | 'sales_enablement'>;
  supportingKnowledge?: string[];
}

export interface AdvisorResponsibleDepartment {
  department: string;
  ownerAgentId?: string;
  ownerName?: string;
  role?: string;
  title?: string;
  responsibility: string;
  expectedOutcome?: string;
}

export interface AdvisorTeamTask {
  agentId: string;
  agentName: string;
  role: string;
  title?: string;
  department?: string;
  task: string;
  expectedOutcome?: string;
}

export interface BriefEvidence {
  id: string;
  sourceType: string;
  sourceId?: string;
  label: string;
  detail: string;
  link?: string;
  occurredAt?: string;
  score?: number;
}

export interface CampaignProposal {
  goal: string;
  audience: string;
  offer?: string;
  publicTopic?: string;
  contentAngle?: string;
  channels: string[];
  assets: string[];
  expectedOutcome?: string;
}

export interface BriefWin {
  what: string;
  detail?: string;
}

export interface BriefAlert {
  what: string;
  detail?: string;
  link?: string;
}

export interface AdvisorWeeklyAction {
  day: number;
  dayLabel: string;
  title: string;
  action: string;
  why: string;
  ownerDepartment?: string;
  priority?: 'urgent' | 'high' | 'medium' | 'low';
  evidenceIds?: string[];
  successSignal?: string;
  link?: string;
}

export interface AdvisorBriefInput {
  headline?: string | null;
  actions?: BriefAction[];
  wins?: BriefWin[];
  alerts?: BriefAlert[];
  weeklyActions?: AdvisorWeeklyAction[];
  sourcesUsed?: Record<string, unknown>;
  model?: string | null;
  traceId?: string | null;
}

export interface AdvisorBrief {
  id: string;
  tenantId: string;
  generatedAt: Date;
  headline: string | null;
  actions: BriefAction[];
  wins: BriefWin[];
  alerts: BriefAlert[];
  weeklyActions?: AdvisorWeeklyAction[];
  sourcesUsed: Record<string, unknown>;
  model: string | null;
  traceId: string | null;
}

// ─── Mapper ──────────────────────────────────────────────────────────

function mapBrief(row: any): AdvisorBrief {
  return {
    id: row.id,
    tenantId: row.tenantId,
    generatedAt: row.generatedAt,
    headline: row.headline ?? null,
    actions: (row.actions as BriefAction[]) ?? [],
    wins: (row.wins as BriefWin[]) ?? [],
    alerts: (row.alerts as BriefAlert[]) ?? [],
    sourcesUsed: (row.sourcesUsed as Record<string, unknown>) ?? {},
    weeklyActions: ((row.sourcesUsed as Record<string, unknown> | null)?.weeklyActions as AdvisorWeeklyAction[] | undefined) ?? [],
    model: row.model ?? null,
    traceId: row.traceId ?? null,
  };
}

// ─── Store API ───────────────────────────────────────────────────────

export async function getLatestBrief(
  db: Database,
  tenantId: string,
): Promise<AdvisorBrief | null> {
  const rows = await db
    .select()
    .from(ceoAdvisorBriefs)
    .where(eq(ceoAdvisorBriefs.tenantId, tenantId))
    .orderBy(desc(ceoAdvisorBriefs.generatedAt))
    .limit(1);
  return rows[0] ? mapBrief(rows[0]) : null;
}

export async function listBriefs(
  db: Database,
  tenantId: string,
  limit: number = 10,
): Promise<AdvisorBrief[]> {
  const rows = await db
    .select()
    .from(ceoAdvisorBriefs)
    .where(eq(ceoAdvisorBriefs.tenantId, tenantId))
    .orderBy(desc(ceoAdvisorBriefs.generatedAt))
    .limit(limit);
  return rows.map(mapBrief);
}

export async function appendBrief(
  db: Database,
  tenantId: string,
  input: AdvisorBriefInput,
  actor: string = 'system',
): Promise<AdvisorBrief> {
  const [row] = await db
    .insert(ceoAdvisorBriefs)
    .values({
      tenantId,
      headline: input.headline ?? null,
      actions: (input.actions ?? []) as any,
      wins: (input.wins ?? []) as any,
      alerts: (input.alerts ?? []) as any,
      sourcesUsed: {
        ...(input.sourcesUsed ?? {}),
        weeklyActions: input.weeklyActions ?? [],
      } as any,
      model: input.model ?? null,
      traceId: input.traceId ?? null,
    })
    .returning();
  if (!row) throw new Error('Failed to append brief');
  await logAction(db, tenantId, 'data_access', actor, {
    kind: 'ceo_advisor_brief_create',
    briefId: row.id,
  });
  return mapBrief(row);
}
