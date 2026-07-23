/**
 * Credit charging helpers (Phase B-2).
 *
 * Wraps the TenantAI credit-store with the API-side ergonomics:
 * looking up the account wallet from companyId, friendly 402 errors, and a
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
import { getTenantAI, ensureTenantForAccount } from './tenant-ai';
import { db } from './db';
import { companies, users } from '@1person/core/db';
import { eq, sql } from 'drizzle-orm';
import { CREDIT_SUPPORT_MESSAGE } from './credit-costs';

async function adoptLegacyCompanyWalletIfNeeded(args: {
  accountTenantId: string;
  companyId: string;
}): Promise<void> {
  try {
    await db.transaction(async (tx) => {
      const accountRows = await tx.execute(sql`
        SELECT id FROM trustai_credit_balances
        WHERE tenant_id = ${args.accountTenantId}
        LIMIT 1
      `);
      if ((accountRows as any[])[0]) return;

      const legacyTenantRows = await tx.execute(sql`
        SELECT id FROM trustai_tenants
        WHERE external_id = ${args.companyId}
        LIMIT 1
      `);
      const legacyTenantId = (legacyTenantRows as any[])[0]?.id as string | undefined;
      if (!legacyTenantId || legacyTenantId === args.accountTenantId) return;

      const legacyBalanceRows = await tx.execute(sql`
        SELECT id FROM trustai_credit_balances
        WHERE tenant_id = ${legacyTenantId}
        LIMIT 1
      `);
      if (!(legacyBalanceRows as any[])[0]) return;

      // One-time compatibility path: before credits became account-level,
      // balances were company-scoped. Move the first existing company wallet
      // into the account wallet so users do not get a second free grant.
      await tx.execute(sql`
        UPDATE trustai_credit_balances
        SET tenant_id = ${args.accountTenantId}, updated_at = NOW()
        WHERE tenant_id = ${legacyTenantId}
      `);
      await tx.execute(sql`
        UPDATE trustai_credit_transactions
        SET tenant_id = ${args.accountTenantId}
        WHERE tenant_id = ${legacyTenantId}
      `);
    });
  } catch (err) {
    console.warn('[credits] legacy company wallet adoption skipped:', err);
  }
}

export async function getCreditTenantIdFromCompanyId(companyId: string): Promise<string | null> {
  try {
    const company = await db.query.companies.findFirst({
      where: eq(companies.id, companyId),
      columns: { id: true, ownerId: true },
    });
    if (!company) return null;
    const owner = await db.query.users.findFirst({
      where: eq(users.id, company.ownerId),
      columns: { id: true, name: true, email: true },
    });
    const label = owner
      ? `${owner.name || owner.email}'s credits`
      : `Account ${company.ownerId}`;
    const accountTenantId = await ensureTenantForAccount(company.ownerId, label);
    await adoptLegacyCompanyWalletIfNeeded({ accountTenantId, companyId: company.id });
    return accountTenantId;
  } catch (err) {
    console.warn('[credits] account wallet lookup failed:', err);
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
  const tenantId = await getCreditTenantIdFromCompanyId(companyId);
  if (!tenantId) return; // No tenant yet — let downstream call create it

  const ai = getTenantAI();
  const balance = await ai.credits.getOrCreateBalance(tenantId);
  if (balance.totalAvailable < required) {
    throw new HTTPException(402, {
      message: `You need ${required} credits but only have ${balance.totalAvailable}. ${CREDIT_SUPPORT_MESSAGE}`,
    });
  }
}

/**
 * Charge for a completed LLM call against the account wallet that owns
 * the company. Reads `creditCost` and `tierUsed`
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

  const tenantId = await getCreditTenantIdFromCompanyId(companyId);
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
  const tenantId = await getCreditTenantIdFromCompanyId(companyId);
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
      throw new HTTPException(402, {
        message: `You need ${err.required} credits but only have ${err.available}. ${CREDIT_SUPPORT_MESSAGE}`,
      });
    }
    throw err;
  }
}
