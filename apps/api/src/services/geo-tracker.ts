/**
 * GEO Tracker Service — Block 1
 *
 * Runs founder-defined prompts against LLM providers (OpenAI, Anthropic)
 * and detects whether the brand was mentioned + which competitors stole
 * the slot. Manual trigger only (cron is Block 5+). Provider list comes
 * from the existing admin `resolveProvider` config — no new env vars.
 */

import { and, eq, gte, sql } from 'drizzle-orm';
import { db } from '../lib/db';
import { companies, geoPrompts, geoMentions, geoShareOfVoice, type GeoSentiment } from '@1person/core/db';
import { llmGenerate } from '../lib/llm';
import { resolveProvider } from '../lib/config-resolver';
import { getTenantAI, ensureTenantForCompany } from '../lib/tenant-ai';

const SUPPORTED_PROVIDERS = ['openai', 'anthropic'] as const;
type ProviderKey = (typeof SUPPORTED_PROVIDERS)[number];

const PROVIDER_DEFAULT_MODEL: Record<ProviderKey, string> = {
  openai: 'gpt-4o-mini',
  anthropic: 'claude-sonnet-4-20250514',
};

export interface MentionRow {
  id: string;
  promptId: string;
  provider: string;
  runAt: Date;
  responseText: string;
  brandMentioned: boolean;
  mentionPosition: number | null;
  competitorsMentioned: string[];
  sentiment: GeoSentiment;
}

export interface RunResult {
  promptId: string;
  brand: string;
  mentions: MentionRow[];
  providersUsed: string[];
  providersSkipped: Array<{ provider: string; reason: string }>;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Parse the LLM answer for brand + competitor hits. Heuristic — no extra
 * LLM call. mentionPosition counts distinct named entities appearing
 * before the brand (1-based). Sentiment is a 200-char keyword window.
 */
function parseMentions(
  responseText: string,
  brand: string,
  competitors: string[],
): { brandMentioned: boolean; mentionPosition: number | null; competitorsMentioned: string[]; sentiment: GeoSentiment } {
  const lower = responseText.toLowerCase();
  const brandLower = brand.trim().toLowerCase();
  const brandRe = brandLower ? new RegExp(`\\b${escapeRegExp(brandLower)}\\b`, 'i') : null;
  const brandMatch = brandRe ? brandRe.exec(lower) : null;

  let mentionPosition: number | null = null;
  if (brandMatch && brandLower) {
    const allHits: Array<{ name: string; index: number }> = [];
    for (const name of [brand, ...competitors].filter((n) => n && n.trim())) {
      const re = new RegExp(`\\b${escapeRegExp(name.toLowerCase())}\\b`, 'gi');
      let m: RegExpExecArray | null;
      while ((m = re.exec(lower)) !== null) allHits.push({ name: name.toLowerCase(), index: m.index });
    }
    allHits.sort((a, b) => a.index - b.index);
    const seen = new Set<string>();
    for (const h of allHits) {
      if (h.name === brandLower) break;
      seen.add(h.name);
    }
    mentionPosition = seen.size + 1;
  }

  const competitorsMentioned: string[] = [];
  for (const c of competitors) {
    if (!c?.trim()) continue;
    if (new RegExp(`\\b${escapeRegExp(c.toLowerCase())}\\b`, 'i').test(lower)) competitorsMentioned.push(c);
  }

  let sentiment: GeoSentiment = 'unknown';
  if (brandMatch) {
    const w = lower.slice(Math.max(0, brandMatch.index - 200), Math.min(lower.length, brandMatch.index + 200));
    const POS = ['best', 'top', 'leading', 'recommend', 'great', 'excellent', 'popular', 'trusted'];
    const NEG = ['worst', 'bad', 'avoid', 'poor', 'expensive', 'lacking', 'outdated', 'slow'];
    const p = POS.filter((x) => w.includes(x)).length;
    const n = NEG.filter((x) => w.includes(x)).length;
    sentiment = p > n ? 'positive' : n > p ? 'negative' : 'neutral';
  }

  return { brandMentioned: !!brandMatch, mentionPosition, competitorsMentioned, sentiment };
}

/** Replay one prompt across every supported provider that has credentials. */
export async function runGeoPrompt(companyId: string, promptId: string): Promise<RunResult> {
  const prompt = await db.query.geoPrompts.findFirst({
    where: and(eq(geoPrompts.id, promptId), eq(geoPrompts.companyId, companyId)),
  });
  if (!prompt) throw new Error('Prompt not found');

  const company = await db.query.companies.findFirst({
    where: eq(companies.id, companyId),
    columns: { id: true, name: true, industry: true },
  });
  const brand = company?.name?.trim() || 'Unknown Brand';
  const industryHint = company?.industry ? ` (industry: ${company.industry})` : '';

  let competitorNames: string[] = [];
  try {
    const tenantId = await ensureTenantForCompany(companyId, brand);
    const competitors = await getTenantAI().market.listCompetitors(tenantId);
    competitorNames = competitors.map((c) => c.name).filter(Boolean);
  } catch {
    // Market scan not configured — brand-only detection still works.
  }

  const providersUsed: string[] = [];
  const providersSkipped: Array<{ provider: string; reason: string }> = [];
  const inserted: MentionRow[] = [];

  for (const provider of SUPPORTED_PROVIDERS) {
    const resolved = await resolveProvider(provider);
    if (!resolved.apiKey) {
      providersSkipped.push({ provider, reason: 'no api key configured' });
      continue;
    }
    try {
      const sys = `You are a search assistant. Answer the user's question concisely with 3-6 specific named brands/products${industryHint}. List them in order of best fit.`;
      const response = await llmGenerate(
        [
          { role: 'system', content: sys },
          { role: 'user', content: prompt.promptText },
        ],
        {
          featureKey: 'geo_run',
          forceProvider: provider,
          forceModel: PROVIDER_DEFAULT_MODEL[provider],
          maxTokens: 800,
          traceName: `geo.${provider}`,
          metadata: { companyId, promptId },
        },
      );

      const parsed = parseMentions(response.text, brand, competitorNames);
      const [saved] = await db
        .insert(geoMentions)
        .values({
          companyId,
          promptId,
          provider,
          responseText: response.text,
          brandMentioned: parsed.brandMentioned,
          mentionPosition: parsed.mentionPosition,
          competitorsMentioned: parsed.competitorsMentioned,
          sentiment: parsed.sentiment,
        })
        .returning();

      if (!saved) {
        providersSkipped.push({ provider, reason: 'insert returned no row' });
        continue;
      }
      inserted.push({
        id: saved.id,
        promptId: saved.promptId,
        provider: saved.provider,
        runAt: saved.runAt,
        responseText: saved.responseText,
        brandMentioned: saved.brandMentioned,
        mentionPosition: saved.mentionPosition,
        competitorsMentioned: (saved.competitorsMentioned as string[]) ?? [],
        sentiment: (saved.sentiment as GeoSentiment) ?? 'unknown',
      });
      providersUsed.push(provider);
    } catch (err) {
      providersSkipped.push({ provider, reason: err instanceof Error ? err.message : String(err) });
    }
  }

  return { promptId, brand, mentions: inserted, providersUsed, providersSkipped };
}

/** Compute and persist SoV over a rolling window. SoV% = brand / (brand + competitor mentions). */
export async function computeShareOfVoice(companyId: string, periodDays = 7) {
  const since = new Date(Date.now() - periodDays * 86_400_000);
  const rows = await db
    .select({ brandMentioned: geoMentions.brandMentioned, competitorsMentioned: geoMentions.competitorsMentioned })
    .from(geoMentions)
    .where(and(eq(geoMentions.companyId, companyId), gte(geoMentions.runAt, since)));

  let brand = 0;
  let total = 0;
  for (const r of rows) {
    const hits = ((r.competitorsMentioned as string[]) ?? []).length;
    if (r.brandMentioned) brand += 1;
    total += (r.brandMentioned ? 1 : 0) + hits;
  }
  const sov = total > 0 ? (brand / total) * 100 : 0;

  const [saved] = await db
    .insert(geoShareOfVoice)
    .values({ companyId, periodDays, sovPercent: sov, brandMentionsCount: brand, totalMentionsCount: total })
    .returning();

  return saved
    ? {
        sovPercent: saved.sovPercent,
        brandMentionsCount: saved.brandMentionsCount,
        totalMentionsCount: saved.totalMentionsCount,
        computedAt: saved.computedAt,
        periodDays: saved.periodDays,
      }
    : { sovPercent: sov, brandMentionsCount: brand, totalMentionsCount: total, computedAt: new Date(), periodDays };
}

/** Latest SoV vs prior period — for the trend arrow on the dashboard. */
export async function getShareOfVoiceTrend(companyId: string, periodDays = 7) {
  const now = Date.now();
  const currentSince = new Date(now - periodDays * 86_400_000);
  const previousSince = new Date(now - 2 * periodDays * 86_400_000);

  const recent = await db
    .select({
      runAt: geoMentions.runAt,
      brandMentioned: geoMentions.brandMentioned,
      competitorsMentioned: geoMentions.competitorsMentioned,
    })
    .from(geoMentions)
    .where(and(eq(geoMentions.companyId, companyId), gte(geoMentions.runAt, previousSince)));

  const calc = (rs: typeof recent) => {
    let brand = 0;
    let total = 0;
    for (const r of rs) {
      const hits = ((r.competitorsMentioned as string[]) ?? []).length;
      if (r.brandMentioned) brand += 1;
      total += (r.brandMentioned ? 1 : 0) + hits;
    }
    return { brand, total, sovPercent: total > 0 ? (brand / total) * 100 : 0 };
  };

  const current = calc(recent.filter((r) => r.runAt >= currentSince));
  const previous = calc(recent.filter((r) => r.runAt < currentSince));
  return { current, previous, deltaPercent: current.sovPercent - previous.sovPercent, periodDays };
}

/** Prompt list with run stats for the dashboard table. */
export async function listPromptsWithStats(companyId: string) {
  const prompts = await db.query.geoPrompts.findMany({
    where: eq(geoPrompts.companyId, companyId),
    orderBy: (t, { desc }) => [desc(t.createdAt)],
  });
  const counts = await db
    .select({
      promptId: geoMentions.promptId,
      total: sql<number>`count(*)::int`,
      lastRun: sql<Date | null>`max(${geoMentions.runAt})`,
      brandHits: sql<number>`sum(case when ${geoMentions.brandMentioned} then 1 else 0 end)::int`,
    })
    .from(geoMentions)
    .where(eq(geoMentions.companyId, companyId))
    .groupBy(geoMentions.promptId);

  const byPrompt = new Map(counts.map((c) => [c.promptId, c]));
  return prompts.map((p) => {
    const c = byPrompt.get(p.id);
    return {
      id: p.id,
      promptText: p.promptText,
      active: p.active,
      createdAt: p.createdAt,
      runCount: c?.total ?? 0,
      brandHits: c?.brandHits ?? 0,
      lastRunAt: c?.lastRun ?? null,
    };
  });
}
