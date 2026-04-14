/**
 * Competitor Brief Service
 *
 * Generates a CEO-level deep brief on a specific competitor:
 * their strengths/weaknesses, how they position, and 3 concrete
 * actions the CEO should take this week to win against them.
 *
 * Uses: business context + competitor data + latest signals.
 */

import { buildBusinessContext } from './business-context';
import { llmGenerate, extractJSON } from '../lib/llm';
import { getTenantAI } from '../lib/tenant-ai';

export interface CompetitorBrief {
  headline: string;
  summary: string;
  theirStrengths: string[];
  theirWeaknesses: string[];
  yourAdvantage: string;
  threeActions: Array<{
    title: string;
    why: string;
    link?: string;
  }>;
  generatedAt: string;
  model: string;
}

export async function generateCompetitorBrief(args: {
  companyId: string;
  tenantId: string;
  competitorId: string;
}): Promise<CompetitorBrief> {
  const { companyId, tenantId, competitorId } = args;
  const ai = getTenantAI();

  const competitor = await ai.market.getCompetitor(tenantId, competitorId);
  if (!competitor) throw new Error('Competitor not found');

  const ctx = await buildBusinessContext(companyId, 'admin');

  const signalsBlob = competitor.latestSignals.length
    ? competitor.latestSignals
        .slice(0, 8)
        .map((s) => `- [${s.type}] ${s.text}`)
        .join('\n')
    : '(no scan signals yet)';

  const prefix = `/${companyId}`;

  const prompt = `You are a strategy advisor briefing a CEO on a specific competitor.

YOUR COMPANY:
- Name: ${ctx.companyName || 'Unknown'}
- Industry: ${ctx.industry || 'Unknown'}
- Description: ${ctx.description || 'N/A'}
- Products: ${ctx.products.slice(0, 5).join(' | ') || 'N/A'}
- Target audience: ${ctx.targetAudience.slice(0, 5).join(' | ') || 'N/A'}
- Brand voice: ${ctx.brandVoice.slice(0, 3).join(', ') || 'N/A'}

COMPETITOR TO BRIEF ON:
- Name: ${competitor.name}
- Website: ${competitor.url || 'unknown'}
- Tracked keywords: ${competitor.keywords.join(', ') || 'none'}
- Notes: ${competitor.notes || 'none'}
- Latest signals from scans:
${signalsBlob}

Task: Produce a tight, executable brief the CEO can act on this week.

Return ONLY valid JSON with this exact shape:
{
  "headline": "1-sentence description of who this competitor is and why they matter to us",
  "summary": "2-3 sentence narrative summary of the current competitive situation",
  "theirStrengths": ["strength 1", "strength 2", "strength 3"],
  "theirWeaknesses": ["weakness 1", "weakness 2", "weakness 3"],
  "yourAdvantage": "1-2 sentences: what you have that they don't, grounded in your business context",
  "threeActions": [
    {"title": "Short action title", "why": "1 sentence why this action matters now", "link": "${prefix}/campaigns"},
    {"title": "...", "why": "...", "link": "${prefix}/landing-pages"},
    {"title": "...", "why": "...", "link": "${prefix}/knowledge"}
  ]
}

Valid link values: ${prefix}/campaigns, ${prefix}/landing-pages, ${prefix}/knowledge, ${prefix}/blog, ${prefix}/market, ${prefix}/insights, ${prefix}/brain.`;

  const response = await llmGenerate(
    [{ role: 'user', content: prompt }],
    { featureKey: 'competitor_brief', maxTokens: 2000 }
  );

  const parsed = extractJSON(response.text);
  if (!parsed || typeof parsed !== 'object') {
    throw new Error('LLM did not return a valid brief');
  }

  const brief = parsed as Record<string, unknown>;
  const stringArr = (v: unknown) =>
    Array.isArray(v) ? v.filter((x) => typeof x === 'string' && x.trim()).slice(0, 5) : [];

  return {
    headline: typeof brief.headline === 'string' ? brief.headline : '',
    summary: typeof brief.summary === 'string' ? brief.summary : '',
    theirStrengths: stringArr(brief.theirStrengths),
    theirWeaknesses: stringArr(brief.theirWeaknesses),
    yourAdvantage: typeof brief.yourAdvantage === 'string' ? brief.yourAdvantage : '',
    threeActions: Array.isArray(brief.threeActions)
      ? brief.threeActions
          .filter((a: any) => a && typeof a.title === 'string')
          .slice(0, 3)
          .map((a: any) => ({
            title: String(a.title),
            why: typeof a.why === 'string' ? a.why : '',
            link: typeof a.link === 'string' ? a.link : undefined,
          }))
      : [],
    generatedAt: new Date().toISOString(),
    model: response.model,
  };
}
