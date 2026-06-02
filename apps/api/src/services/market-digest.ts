/**
 * Market Digest Service
 *
 * Aggregates competitor signals from the past N days into a single
 * weekly brief: "What's new in your market this week + what to do."
 *
 * Pure aggregation + one LLM call to synthesize the narrative.
 */

import { buildBusinessContext } from './business-context';
import { llmGenerate, extractJSON } from '../lib/llm';
import { getTenantAI } from '../lib/tenant-ai';

export interface DigestSignalItem {
  competitorId: string;
  competitorName: string;
  type: string;
  text: string;
  url?: string;
  date?: string;
}

export interface MarketDigest {
  windowDays: number;
  generatedAt: string;
  totalSignals: number;
  headline: string;
  summary: string;
  topThemes: string[];
  threeActions: Array<{ title: string; why: string; link?: string }>;
  byCompetitor: Array<{
    competitorId: string;
    competitorName: string;
    signalCount: number;
    topSignals: DigestSignalItem[];
  }>;
  model: string;
}

export async function generateMarketDigest(args: {
  companyId: string;
  tenantId: string;
  windowDays?: number;
}): Promise<MarketDigest> {
  const { companyId, tenantId, windowDays = 7 } = args;
  const ai = getTenantAI();

  const competitors = await ai.market.listCompetitors(tenantId);
  const cutoff = Date.now() - windowDays * 24 * 60 * 60 * 1000;

  const allSignals: DigestSignalItem[] = [];
  const byCompetitor: MarketDigest['byCompetitor'] = [];

  for (const comp of competitors) {
    const signals = comp.latestSignals.filter((s) => {
      if (!s.date) return true; // include undated signals
      const t = Date.parse(s.date);
      return Number.isFinite(t) ? t >= cutoff : true;
    });
    if (signals.length === 0) continue;

    const items = signals.slice(0, 5).map((s) => ({
      competitorId: comp.id,
      competitorName: comp.name,
      type: s.type,
      text: s.text,
      url: s.url,
      date: s.date,
    }));

    allSignals.push(...items);
    byCompetitor.push({
      competitorId: comp.id,
      competitorName: comp.name,
      signalCount: signals.length,
      topSignals: items,
    });
  }

  const prefix = `/${companyId}`;

  // No signals: return an empty digest that explains why
  if (allSignals.length === 0) {
    return {
      windowDays,
      generatedAt: new Date().toISOString(),
      totalSignals: 0,
      headline: 'No competitor activity in the last ' + windowDays + ' days',
      summary: competitors.length === 0
        ? 'You are not tracking any competitors yet. Add some to start receiving weekly intelligence.'
        : 'Run a scan on your tracked competitors to populate this digest.',
      topThemes: [],
      threeActions: competitors.length === 0
        ? [
            { title: 'Add competitors to track', why: 'Tracking rivals surfaces market signals you can respond to.', link: `${prefix}/market` },
          ]
        : [
            { title: 'Scan your tracked competitors', why: 'A scan pulls their recent site + news changes into this digest.', link: `${prefix}/market` },
          ],
      byCompetitor: [],
      model: '',
    };
  }

  const ctx = await buildBusinessContext(companyId, 'admin');

  const signalsBlob = allSignals
    .slice(0, 20)
    .map((s) => `- [${s.competitorName}/${s.type}] ${s.text}`)
    .join('\n');

  const prompt = `You are a market analyst writing a weekly market digest for a CEO.

YOUR COMPANY:
- ${ctx.companyName || 'Unknown'} in ${ctx.industry || 'unknown industry'}
- ${ctx.description || ''}
- Products: ${ctx.products.slice(0, 3).join(' | ') || 'N/A'}

COMPETITOR SIGNALS FROM THE LAST ${windowDays} DAYS (${allSignals.length} total):
${signalsBlob}

Task: Synthesize the week's competitive landscape into an actionable digest.

Return ONLY valid JSON with this shape:
{
  "headline": "1-sentence headline capturing the dominant theme this week",
  "summary": "2-3 sentence narrative: what's happening in the market right now, who's moving, what it means for the CEO",
  "topThemes": ["theme 1 (2-4 words)", "theme 2", "theme 3"],
  "threeActions": [
    {"title": "Short action", "why": "1 sentence", "link": "${prefix}/campaigns"},
    {"title": "Short action", "why": "1 sentence", "link": "${prefix}/landing-pages"},
    {"title": "Short action", "why": "1 sentence", "link": "${prefix}/knowledge"}
  ]
}

Valid link values: ${prefix}/campaigns, ${prefix}/landing-pages, ${prefix}/knowledge, ${prefix}/blog, ${prefix}/market, ${prefix}/insights, ${prefix}/brain.`;

  const response = await llmGenerate(
    [{ role: 'user', content: prompt }],
    { featureKey: 'market_digest', maxTokens: 2000 }
  );

  const parsed = extractJSON(response.text) as Record<string, unknown> | null;
  if (!parsed) throw new Error('LLM did not return a valid digest');

  const strArr = (v: unknown, max = 5): string[] =>
    Array.isArray(v) ? v.filter((x) => typeof x === 'string' && x.trim()).slice(0, max) : [];

  const threeActions = Array.isArray(parsed.threeActions)
    ? parsed.threeActions
        .filter((a: any) => a && typeof a.title === 'string')
        .slice(0, 3)
        .map((a: any) => ({
          title: String(a.title),
          why: typeof a.why === 'string' ? a.why : '',
          link: typeof a.link === 'string' ? a.link : undefined,
        }))
    : [];

  return {
    windowDays,
    generatedAt: new Date().toISOString(),
    totalSignals: allSignals.length,
    headline: typeof parsed.headline === 'string' ? parsed.headline : '',
    summary: typeof parsed.summary === 'string' ? parsed.summary : '',
    topThemes: strArr(parsed.topThemes, 5),
    threeActions,
    byCompetitor,
    model: response.model,
  };
}
