/**
 * Brain Auto-Extract (P0-B4)
 *
 * Populates the Business Brain from the website crawl / business context
 * during FTUX so new users never see an empty Brain on first login.
 *
 * Extraction strategy: one shot LLM call that returns brandVoice + primary
 * persona + products as a single JSON blob. This keeps FTUX latency low
 * (one extra LLM call, ~2s) while giving the Brain enough substance for
 * downstream agents (banners, campaigns, content) to produce on-brand work.
 *
 * Guards:
 *   - Idempotent: if brand voice already exists for the tenant, we skip.
 *   - Graceful: partial success is fine. If LLM call fails, we still
 *     seed a minimal default brand voice so the Brain is non-empty.
 */

import { buildBusinessContext } from './business-context';
import { ensureTenantForCompany, getTenantAI } from '../lib/tenant-ai';
import { llmGenerate, extractJSON } from '../lib/llm';

export interface BrainAutoExtractResult {
  brandVoice: boolean;
  personas: number;
  products: number;
  skipped?: boolean;
  error?: string;
}

interface ExtractedBrain {
  brandVoice?: {
    tone?: string;
    description?: string;
    wordsToUse?: string[];
    wordsToAvoid?: string[];
  };
  primaryPersona?: {
    name?: string;
    description?: string;
    painPoints?: string[];
    goals?: string[];
    channels?: string[];
  };
  products?: Array<{
    name?: string;
    description?: string;
    features?: string[];
    benefits?: string[];
  }>;
}

const ALLOWED_TONES = new Set([
  'professional',
  'friendly',
  'playful',
  'bold',
  'luxury',
  'educational',
]);

export async function autoExtractBrainFromCompany(
  companyId: string,
  companyName: string,
): Promise<BrainAutoExtractResult> {
  const result: BrainAutoExtractResult = {
    brandVoice: false,
    personas: 0,
    products: 0,
  };

  let tenantId: string;
  try {
    const ctx = await buildBusinessContext(companyId);
    const effectiveName = ctx.companyName || companyName || 'Company';
    tenantId = await ensureTenantForCompany(companyId, effectiveName);
    const ai = getTenantAI();

    // Idempotency guard — if the brain already has a brand voice, assume
    // extraction (or manual edits) have happened and skip.
    const existing = await ai.brain.getBrandVoice(tenantId).catch(() => null);
    if (existing) {
      return { ...result, brandVoice: true, skipped: true };
    }

    // One-shot extraction prompt
    let extracted: ExtractedBrain | null = null;
    try {
      const contextSnippet = (ctx.fullContext || '').substring(0, 2000);
      const { text } = await llmGenerate(
        [
          {
            role: 'system',
            content:
              'You are a brand strategist. Extract structured brand data from business context. Return ONLY valid JSON, no prose.',
          },
          {
            role: 'user',
            content: `From this business context, extract and return ONLY JSON with this shape:
{
  "brandVoice": {
    "tone": "professional|friendly|playful|bold|luxury|educational",
    "description": "1-2 sentence description of how they communicate",
    "wordsToUse": ["3-8 preferred words"],
    "wordsToAvoid": ["3-8 words to avoid based on the brand positioning"]
  },
  "primaryPersona": {
    "name": "Persona name like 'Busy mom in HCMC' or 'Tech-savvy SMB owner'",
    "description": "One sentence description",
    "painPoints": ["3-5 specific pain points"],
    "goals": ["3-5 specific goals"],
    "channels": ["2-4 social/digital channels they use"]
  },
  "products": [
    {
      "name": "Product/service name",
      "description": "One-line description",
      "features": ["2-4 key features"],
      "benefits": ["2-4 benefits"]
    }
  ]
}

Up to 5 products. Return ONLY the JSON object.

Business context:
${contextSnippet}`,
          },
        ],
        {
          featureKey: 'brain_autoextract',
          tier: 'balanced',
          traceName: 'brain.autoExtract',
          metadata: { companyId },
          maxTokens: 1500,
        },
      );
      extracted = extractJSON(text) as ExtractedBrain | null;
    } catch (err) {
      console.warn('[brain-autoextract] LLM extraction failed:', err);
      extracted = null;
    }

    // 1. Brand voice (with fallback to a minimal default)
    try {
      const bv = extracted?.brandVoice;
      const tone = bv?.tone && ALLOWED_TONES.has(bv.tone) ? bv.tone : 'professional';
      await ai.brain.upsertBrandVoice(
        tenantId,
        {
          tone,
          description:
            bv?.description?.trim() || 'Clear, helpful, and trustworthy',
          wordsToUse: Array.isArray(bv?.wordsToUse) ? bv!.wordsToUse!.slice(0, 8) : [],
          wordsToAvoid: Array.isArray(bv?.wordsToAvoid)
            ? bv!.wordsToAvoid!.slice(0, 8)
            : [],
        },
        extracted ? 'system:ftux-autoextract' : 'system:ftux-default',
      );
      result.brandVoice = true;
    } catch (err) {
      console.warn('[brain-autoextract] upsertBrandVoice failed:', err);
    }

    // 2. Primary persona
    if (extracted?.primaryPersona?.name) {
      try {
        const p = extracted.primaryPersona;
        await ai.brain.createPersona(
          tenantId,
          {
            name: p.name!,
            description: p.description ?? null,
            attributes: {
              painPoints: Array.isArray(p.painPoints) ? p.painPoints.slice(0, 5) : [],
              goals: Array.isArray(p.goals) ? p.goals.slice(0, 5) : [],
              channels: Array.isArray(p.channels) ? p.channels.slice(0, 4) : [],
            },
            isPrimary: true,
          },
          'system:ftux-autoextract',
        );
        result.personas += 1;
      } catch (err) {
        console.warn('[brain-autoextract] createPersona failed:', err);
      }
    }

    // 3. Products (up to 5)
    if (Array.isArray(extracted?.products)) {
      for (const prod of extracted!.products!.slice(0, 5)) {
        if (!prod?.name) continue;
        try {
          await ai.brain.createProduct(
            tenantId,
            {
              name: prod.name,
              description: prod.description ?? null,
              attributes: {
                features: Array.isArray(prod.features) ? prod.features.slice(0, 4) : [],
                benefits: Array.isArray(prod.benefits) ? prod.benefits.slice(0, 4) : [],
              },
            },
            'system:ftux-autoextract',
          );
          result.products += 1;
        } catch (err) {
          console.warn('[brain-autoextract] createProduct failed:', err);
        }
      }
    }

    return result;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn('[brain-autoextract] fatal:', message);
    return { ...result, error: message };
  }
}
