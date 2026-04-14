/**
 * CEO Advisor — Chief of Staff brief generator.
 *
 * One LLM call. Aggregates campaigns, deals, market scans, meeting learnings
 * and brain snapshot into a single "what should I do today" brief. Called
 * only from POST /insights/:companyId/advisor/refresh.
 *
 * See docs/architecture/10-venture-ceo-ia.md §8.
 */

import { desc, eq } from 'drizzle-orm';
import { db } from '../lib/db';
import { campaigns } from '@1person/core/db';
import { llmGenerate, extractJSON } from '../lib/llm';
import { getTenantAI } from '../lib/tenant-ai';
import type { BriefAction, BriefWin, BriefAlert, AdvisorBriefInput } from '@1person/ai-tenant';

export interface GeneratedBrief extends AdvisorBriefInput {
  headline: string;
  actions: BriefAction[];
  wins: BriefWin[];
  alerts: BriefAlert[];
  sourcesUsed: {
    campaignsCount: number;
    dealsCount: number;
    marketScansCount: number;
    learningsCount: number;
  };
  model: string;
  traceId: string | null;
}

const VALID_SEVERITY = new Set(['critical', 'high', 'medium', 'low']);
const DAY = 24 * 60 * 60 * 1000;

export async function generateCeoBrief(args: {
  companyId: string;
  tenantId: string;
}): Promise<GeneratedBrief> {
  const { companyId, tenantId } = args;
  const ai = getTenantAI();

  const [recentCampaigns, deals, scans, learnings, snapshot] = await Promise.all([
    db.select().from(campaigns).where(eq(campaigns.companyId, companyId))
      .orderBy(desc(campaigns.updatedAt)).limit(20),
    ai.deals.list(tenantId).catch(() => []),
    ai.market.listScans(tenantId, 10).catch(() => []),
    ai.brain.listLearnings(tenantId, 20).catch(() => []),
    ai.brain.getSnapshot(tenantId).catch(() => null),
  ]);

  const now = Date.now();

  const campaignFacts = recentCampaigns.map((c) => ({
    id: c.id, name: c.name, status: c.status, platform: c.platform,
    metrics: c.metrics ?? null,
  }));

  const stalledDeals = deals
    .filter((d) => !['closed_won', 'closed_lost'].includes(d.stage) &&
      now - new Date(d.updatedAt).getTime() > 3 * DAY)
    .slice(0, 10)
    .map((d) => ({
      id: d.id, title: d.title, stage: d.stage, value: d.value,
      daysSinceUpdate: Math.floor((now - new Date(d.updatedAt).getTime()) / DAY),
      nextAction: d.nextAction,
    }));

  const hotDeals = deals
    .filter((d) => ['proposal', 'negotiation'].includes(d.stage) && d.value && Number(d.value) > 0)
    .slice(0, 10)
    .map((d) => ({ id: d.id, title: d.title, stage: d.stage, value: d.value, currency: d.currency }));

  const marketFacts = scans
    .filter((s) => s.status === 'complete' && s.signals.length > 0)
    .slice(0, 8)
    .map((s) => ({ signals: s.signals.slice(0, 3), recommendedAction: s.recommendedAction }));

  const meetingLearnings = learnings
    .filter((l) => ['win', 'fail', 'insight'].includes(l.category ?? '') &&
      String((l.metricSnapshot as any)?.source ?? '').startsWith('meeting'))
    .slice(0, 10)
    .map((l) => ({ lesson: l.lesson, category: l.category }));

  const brainVoice = snapshot
    ? { brandVoice: snapshot.brandVoice ?? null, personas: (snapshot.personas ?? []).slice(0, 3) }
    : null;

  const linkPrefix = `/${companyId}`;
  const system = `You are the Chief of Staff for a venture-stage CEO running 1Person, an AI OS.
The CEO is a solo founder. Read all surfaces of their business and tell them what to focus on TODAY.

Rules:
- Return STRICT JSON only — no markdown, no prose outside JSON.
- Every action MUST include a "link" from this allowlist:
  ${linkPrefix}/campaigns, ${linkPrefix}/landing-pages, ${linkPrefix}/sales, ${linkPrefix}/market, ${linkPrefix}/brain, ${linkPrefix}/knowledge
- Landing pages are the destination for every ad — if campaigns are live but no landing page exists, recommend creating one.
- Tone: match brand voice if provided; otherwise calm, confident, battle-tested.
- Rank actions by impact x urgency. 3-5 actions max. 2-3 wins, 2-3 alerts.
- Empty arrays are fine — do not invent.`;

  const user = `CEO's business state:\n${JSON.stringify({
    campaigns: campaignFacts, stalledDeals, hotDeals,
    marketSignals: marketFacts, meetingLearnings, brain: brainVoice,
  }, null, 2)}\n\nReturn JSON: { "headline": string, "actions": [{"title","why","impact"?,"link","severity"}], "wins": [{"what","detail"?}], "alerts": [{"what","detail"?,"link"?}] }`;

  const llm = await llmGenerate(
    [{ role: 'system', content: system }, { role: 'user', content: user }],
    {
      featureKey: 'ceo_advisor_brief',
      json: true,
      traceName: 'ceo_advisor.brief',
      metadata: { companyId, tenantId },
    },
  );

  const p = extractJSON(llm.text) ?? {};

  const actions: BriefAction[] = Array.isArray(p.actions)
    ? p.actions.slice(0, 5).map((a: any) => ({
        title: String(a?.title ?? '').slice(0, 200),
        why: String(a?.why ?? '').slice(0, 500),
        impact: a?.impact ? String(a.impact).slice(0, 200) : undefined,
        link: typeof a?.link === 'string' ? a.link : undefined,
        severity: VALID_SEVERITY.has(a?.severity) ? a.severity : 'medium',
      })).filter((a: BriefAction) => a.title && a.why)
    : [];

  const wins: BriefWin[] = Array.isArray(p.wins)
    ? p.wins.slice(0, 3).map((w: any) => ({
        what: String(w?.what ?? '').slice(0, 200),
        detail: w?.detail ? String(w.detail).slice(0, 300) : undefined,
      })).filter((w: BriefWin) => w.what)
    : [];

  const alerts: BriefAlert[] = Array.isArray(p.alerts)
    ? p.alerts.slice(0, 3).map((a: any) => ({
        what: String(a?.what ?? '').slice(0, 200),
        detail: a?.detail ? String(a.detail).slice(0, 300) : undefined,
        link: typeof a?.link === 'string' ? a.link : undefined,
      })).filter((a: BriefAlert) => a.what)
    : [];

  return {
    headline: typeof p.headline === 'string' && p.headline.trim()
      ? p.headline.trim() : 'Here is your brief for today.',
    actions, wins, alerts,
    sourcesUsed: {
      campaignsCount: recentCampaigns.length,
      dealsCount: deals.length,
      marketScansCount: scans.length,
      learningsCount: meetingLearnings.length,
    },
    model: llm.model,
    traceId: llm.traceId ?? null,
  };
}
