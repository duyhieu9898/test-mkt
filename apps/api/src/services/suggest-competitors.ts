/**
 * Suggest Competitors Service
 *
 * Uses the full business context (company profile + knowledge + brand + website
 * analysis) that we already have in memory, plus an LLM call, to suggest 4–6
 * real competitors the user should track. Returns structured suggestions with
 * name, url, keywords, and a short "why" so the CEO can decide quickly.
 */

import { buildBusinessContext, type BusinessContext } from './business-context';
import { llmGenerate, extractJSON } from '../lib/llm';
import { getTenantAI } from '../lib/tenant-ai';
import { db } from '../lib/db';
import { companies, type BusinessPlan } from '@1person/core/db';
import { eq } from 'drizzle-orm';

export interface CompetitorSuggestion {
  name: string;
  url: string | null;
  keywords: string[];
  why: string;
}

export interface SuggestCompetitorsResult {
  suggestions: CompetitorSuggestion[];
  basedOn: {
    companyName: string;
    industry: string;
    productCount: number;
    audienceCount: number;
    hasBrand: boolean;
  };
  model: string;
}

function sanitizeUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  const trimmed = url.trim();
  if (!trimmed) return null;
  // Add protocol if missing
  if (!/^https?:\/\//i.test(trimmed)) {
    return sanitizeUrl(`https://${trimmed}`);
  }
  try {
    return new URL(trimmed).toString();
  } catch {
    return null;
  }
}

function normalizeKeywords(keywords: unknown): string[] {
  if (!Array.isArray(keywords)) return [];
  return keywords
    .map((k) => (typeof k === 'string' ? k.trim() : ''))
    .filter((k) => k.length > 0 && k.length <= 100)
    .slice(0, 5);
}

function fallbackKeywords(ctx: {
  industry?: string;
  businessType?: string;
  products?: string[];
}): string[] {
  const candidates = [
    ctx.industry,
    ctx.businessType,
    ...(ctx.products ?? []).slice(0, 2),
    'pricing',
    'reviews',
    'launches',
  ];
  const seen = new Set<string>();
  return candidates
    .map((value) => String(value ?? '').trim())
    .filter(Boolean)
    .map((value) => value.replace(/[:|].*$/, '').trim())
    .filter((value) => {
      const key = value.toLowerCase();
      if (!key || key.length > 100 || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 3);
}

function fallbackSuggestionsFromBusinessPlan(args: {
  ctx: BusinessContext;
  excludeNames: string[];
}): CompetitorSuggestion[] {
  const excludeSet = new Set(args.excludeNames.map((name) => name.toLowerCase().trim()));
  const seen = new Set<string>();
  const competitors = args.ctx.businessPlan?.competitors ?? [];
  const keywords = fallbackKeywords(args.ctx);

  return competitors
    .map((name) => String(name ?? '').trim())
    .filter((name) => {
      const key = name.toLowerCase();
      if (!key || key.length > 255 || excludeSet.has(key) || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 6)
    .map((name) => ({
      name,
      url: null,
      keywords,
      why: `${name} was found in your existing business analysis, so it is a useful competitor to track and compare against.`,
    }));
}

function basedOnFromContext(ctx: BusinessContext) {
  return {
    companyName: ctx.companyName || 'Unknown',
    industry: ctx.industry || 'Unknown',
    productCount: ctx.products.length,
    audienceCount: ctx.targetAudience.length,
    hasBrand: Array.isArray(ctx.brandVoice) && ctx.brandVoice.length > 0,
  };
}

async function buildSafeBusinessContext(companyId: string): Promise<BusinessContext> {
  try {
    return await buildBusinessContext(companyId, 'admin');
  } catch (error) {
    console.warn('[suggestCompetitors] Business context failed, using minimal company profile:', error);
    const company = await db.query.companies.findFirst({
      where: eq(companies.id, companyId),
      columns: {
        name: true,
        industry: true,
        description: true,
        businessType: true,
        businessPlan: true,
      },
    });
    const businessPlan = company?.businessPlan as BusinessPlan | null | undefined;
    return {
      companyName: company?.name || 'Business',
      industry: company?.industry || 'Unknown',
      description: company?.description || '',
      businessType: company?.businessType || '',
      products: businessPlan?.offerings ?? [],
      pricing: [],
      targetAudience: businessPlan?.targetAudience?.demographics ?? [],
      faqs: [],
      policies: [],
      brandColors: {},
      brandVoice: [],
      brandStyle: '',
      growthPlan: businessPlan?.growthPlan,
      businessPlan: businessPlan ?? undefined,
      strategies: [],
      decisions: [],
      fullContext: [
        `COMPANY: ${company?.name || 'Business'}`,
        `INDUSTRY: ${company?.industry || 'Unknown'}`,
        `DESCRIPTION: ${company?.description || ''}`,
      ].join('\n'),
    };
  }
}

export async function suggestCompetitors(args: {
  companyId: string;
  tenantId: string;
  excludeNames?: string[];
}): Promise<SuggestCompetitorsResult> {
  const { companyId, tenantId, excludeNames = [] } = args;

  // 1. Build the full business context (memory we already have)
  const ctx = await buildSafeBusinessContext(companyId);

  // 2. Pull brain snapshot for extra market positioning data
  let positioning = '';
  let personas: string[] = [];
  try {
    const ai = getTenantAI();
    const snapshot = await ai.brain.getSnapshot(tenantId);
    if (snapshot.marketPosition?.positioningStatement) {
      positioning = snapshot.marketPosition.positioningStatement;
    }
    if (snapshot.personas?.length) {
      personas = snapshot.personas.slice(0, 3).map((p) => p.name ?? '').filter(Boolean);
    }
  } catch {
    // Brain not available — fall through with what we have
  }

  const excludeList = excludeNames.length
    ? `\nDo NOT suggest these (already tracked): ${excludeNames.join(', ')}`
    : '';

  const prompt = `You are a market research analyst helping a CEO identify their top competitors.

Business context:
- Company: ${ctx.companyName || 'Unknown'}
- Industry: ${ctx.industry || 'Unknown'}
- Business type: ${ctx.businessType || 'Unknown'}
- Description: ${ctx.description || 'N/A'}
- Products/services: ${ctx.products.slice(0, 5).join(' | ') || 'N/A'}
- Target audience: ${ctx.targetAudience.slice(0, 5).join(' | ') || 'N/A'}
${positioning ? `- Market positioning: ${positioning}` : ''}
${personas.length ? `- Customer personas: ${personas.join(', ')}` : ''}
${excludeList}

Task: Suggest 5 REAL competitors (not hypothetical, not generic industry leaders unless truly relevant). Pick companies that actually compete for the same customers in the same niche.

For each competitor provide:
- name: the real company name
- url: their primary website URL (with https://). Use your best knowledge; if uncertain, set to null.
- keywords: 3 short keywords (1-2 words each) to track about this competitor (e.g. "pricing", "launch", "funding", "hiring", "reviews"). Avoid generic words.
- why: ONE sentence explaining why this specific competitor matters for this CEO.

Return ONLY a valid JSON array with this exact shape:
[
  {"name": "...", "url": "...", "keywords": ["...", "...", "..."], "why": "..."}
]`;

  const fallbackSuggestions = fallbackSuggestionsFromBusinessPlan({ ctx, excludeNames });
  let response: Awaited<ReturnType<typeof llmGenerate>>;
  try {
    response = await llmGenerate(
      [{ role: 'user', content: prompt }],
      {
        featureKey: 'competitor_suggestions',
        maxTokens: 1500,
      }
    );
  } catch (error) {
    console.warn('[suggestCompetitors] LLM generation failed, returning fallback suggestions:', error);
    return {
      suggestions: fallbackSuggestions,
      basedOn: basedOnFromContext(ctx),
      model: 'fallback',
    };
  }

  // Try array extraction first, fall back to generic
  let parsed: unknown = null;
  const arrayMatch = response.text.match(/\[[\s\S]*\]/);
  if (arrayMatch) {
    try {
      parsed = JSON.parse(arrayMatch[0]);
    } catch {
      parsed = extractJSON(response.text);
    }
  } else {
    parsed = extractJSON(response.text);
  }

  if (!Array.isArray(parsed)) {
    console.warn('[suggestCompetitors] LLM did not return a valid competitor array; returning fallback suggestions.');
    return {
      suggestions: fallbackSuggestions,
      basedOn: basedOnFromContext(ctx),
      model: response.model,
    };
  }

  const excludeSet = new Set(excludeNames.map((n) => n.toLowerCase().trim()));
  const seen = new Set<string>();

  const suggestions: CompetitorSuggestion[] = [];
  for (const raw of parsed) {
    if (!raw || typeof raw !== 'object') continue;
    const item = raw as Record<string, unknown>;
    const name = typeof item.name === 'string' ? item.name.trim() : '';
    if (!name || name.length > 255) continue;

    const lowerName = name.toLowerCase();
    if (excludeSet.has(lowerName) || seen.has(lowerName)) continue;
    seen.add(lowerName);

    const url = sanitizeUrl(typeof item.url === 'string' ? item.url : null);
    const keywords = normalizeKeywords(item.keywords);
    const why = typeof item.why === 'string' ? item.why.trim().slice(0, 500) : '';

    suggestions.push({ name, url, keywords, why });
    if (suggestions.length >= 6) break;
  }

  if (suggestions.length === 0 && fallbackSuggestions.length > 0) {
    return {
      suggestions: fallbackSuggestions,
      basedOn: basedOnFromContext(ctx),
      model: response.model,
    };
  }

  return {
    suggestions,
    basedOn: basedOnFromContext(ctx),
    model: response.model,
  };
}
