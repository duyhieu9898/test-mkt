/**
 * Credit charging helpers (Phase B-2).
 *
 * Wraps the TenantAI credit-store with the API-side ergonomics:
 * looking up tenantId from companyId, friendly 402 errors, and a
 * pre-check helper for routes that want to fail fast before doing
 * expensive work.
 *
 * Usage pattern:
 *
 *   // 1. Pre-check (fail fast if obviously insufficient)
 *   await ensureSufficientCredits(companyId, estimatedCost);
 *
 *   // 2. Do the work (LLM call, image gen, etc)
 *   const result = await llmGenerate({ featureKey: 'campaign_banner_copy', tier });
 *
 *   // 3. Charge after success
 *   await chargeForLLMCall(companyId, result, { refKind: 'banner', refId: campaignId });
 */

import { HTTPException } from 'hono/http-exception';
import { OutOfCreditsError } from '@1person/ai-tenant';
import { getTenantAI, ensureTenantForCompany } from './tenant-ai';
import { db } from './db';
import { companies } from '@1person/core/db';
import { eq } from 'drizzle-orm';

async function getTenantIdFromCompanyId(companyId: string): Promise<string | null> {
  try {
    const company = await db.query.companies.findFirst({
      where: eq(companies.id, companyId),
      columns: { id: true, name: true },
    });
    if (!company) return null;
    return await ensureTenantForCompany(company.id, company.name);
  } catch (err) {
    console.warn('[credits] tenant lookup failed:', err);
    return null;
  }
}

/**
 * Throws 402 HTTPException if the tenant doesn't have enough credits.
 * Use this BEFORE doing expensive work to fail fast.
 */
export async function ensureSufficientCredits(
  companyId: string,
  required: number,
): Promise<void> {
  if (required <= 0) return;
  const tenantId = await getTenantIdFromCompanyId(companyId);
  if (!tenantId) return; // No tenant yet — let downstream call create it

  const ai = getTenantAI();
  const balance = await ai.credits.getOrCreateBalance(tenantId);
  if (balance.totalAvailable < required) {
    throw new HTTPException(402, {
      message: `You need ${required} credits but only have ${balance.totalAvailable}. Top up or upgrade your plan.`,
    });
  }
}

/**
 * Charge for a completed LLM call. Reads `creditCost` and `tierUsed`
 * from the LLMResponse object that `llmGenerate` returns. Non-fatal:
 * if charging fails, logs and continues (the work is already done).
 *
 * Returns the new balance for downstream use.
 */
export async function chargeForLLMCall(
  companyId: string,
  llmResponse: {
    creditCost?: number;
    tierUsed?: string;
    traceId?: string;
  },
  context: {
    featureKey?: string;
    refKind?: string;
    refId?: string;
    actor?: string;
  } = {},
): Promise<{ totalAvailable: number; charged: number } | null> {
  const cost = llmResponse.creditCost ?? 0;
  if (cost <= 0) return null;

  const tenantId = await getTenantIdFromCompanyId(companyId);
  if (!tenantId) return null;

  try {
    const ai = getTenantAI();
    const balance = await ai.credits.charge(tenantId, {
      amount: cost,
      featureKey: context.featureKey,
      tier: llmResponse.tierUsed,
      refKind: context.refKind ?? 'llm_call',
      refId: context.refId ?? llmResponse.traceId,
      actor: context.actor ?? 'system',
    });
    return { totalAvailable: balance.totalAvailable, charged: cost };
  } catch (err) {
    if (err instanceof OutOfCreditsError) {
      // Already executed — log but don't break the response. The next
      // call from the same tenant will hit the pre-check and fail.
      console.warn(
        `[credits] tenant ${tenantId} went negative on ${context.featureKey} (post-charge):`,
        (err as Error).message,
      );
      return null;
    }
    console.error('[credits] charge failed:', err);
    return null;
  }
}

/**
 * Charge a fixed amount (for non-LLM actions like image gen, agent
 * runs, tracking refresh, etc.) Throws 402 if insufficient.
 */
export async function chargeFixedCredits(
  companyId: string,
  amount: number,
  context: {
    featureKey?: string;
    tier?: string;
    refKind?: string;
    refId?: string;
    actor?: string;
    note?: string;
  } = {},
): Promise<{ totalAvailable: number; charged: number } | null> {
  if (amount <= 0) return null;
  const tenantId = await getTenantIdFromCompanyId(companyId);
  if (!tenantId) return null;

  try {
    const ai = getTenantAI();
    const balance = await ai.credits.charge(tenantId, {
      amount,
      featureKey: context.featureKey,
      tier: context.tier,
      refKind: context.refKind,
      refId: context.refId,
      actor: context.actor ?? 'system',
      note: context.note,
    });
    return { totalAvailable: balance.totalAvailable, charged: amount };
  } catch (err) {
    if (err instanceof OutOfCreditsError) {
      throw new HTTPException(402, { message: (err as Error).message });
    }
    throw err;
  }
}
