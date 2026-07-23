// =============================================================================
// @1person/ai-tenant — Credit Store (Phase B)
// =============================================================================
// Per-tenant subscription state + atomic credit deduction. Powers the
// pricing/credit model from docs/architecture/09-pricing-and-credits.md.
//
// Atomicity: every charge runs inside a Postgres transaction with
// SELECT FOR UPDATE so concurrent requests can't double-spend.
//
// Charge order:
//   1. monthly_balance (current period grant) — drained first
//   2. rollover_balance (last month leftover, max 1 period rollover)
//   3. topup_balance (paid top-ups, never expire)
//
// If total < cost → throw OutOfCreditsError so the route returns 402.
// =============================================================================

import { eq, and, sql, desc } from 'drizzle-orm';
import { creditBalances, creditTransactions, creditPlans } from './schema.js';
import type { Database } from './db.js';

const INITIAL_FREE_CREDITS = 1000;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type CreditTransactionKind =
  | 'debit'
  | 'grant'
  | 'topup'
  | 'refund'
  | 'rollover'
  | 'expire';

export interface CreditBalance {
  id: string;
  tenantId: string;
  plan: string;
  monthlyGrant: number;
  monthlyBalance: number;
  topupBalance: number;
  rolloverBalance: number;
  totalAvailable: number;
  billingPeriodStart: Date;
  billingPeriodEnd: Date;
  byoKeyDiscount: boolean;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  updatedAt: Date;
}

export interface CreditTransaction {
  id: string;
  tenantId: string;
  kind: CreditTransactionKind;
  amount: number;
  balanceAfter: number;
  featureKey: string | null;
  tier: string | null;
  refKind: string | null;
  refId: string | null;
  actor: string | null;
  note: string | null;
  createdAt: Date;
}

export interface CreditPlan {
  key: string;
  label: string;
  description: string | null;
  monthlyPriceCents: number;
  yearlyPriceCents: number;
  monthlyGrant: number;
  rolloverMonths: number;
  seats: number;
  byoKeyDiscountPct: number;
  features: string[];
  stripePriceIdMonthly: string | null;
  stripePriceIdYearly: string | null;
  enabled: boolean;
  sortOrder: number;
}

export interface ChargeInput {
  /** How many credits to deduct (must be > 0) */
  amount: number;
  /** Feature key from the admin config (e.g. 'campaign_banner_copy') */
  featureKey?: string;
  /** Quality tier used: fast | balanced | premium */
  tier?: string;
  /** What kind of action ('llm_call' | 'image_gen' | 'agent_run' | 'tracking') */
  refKind?: string;
  /** Trace id, campaign id, etc. */
  refId?: string;
  /** Actor that triggered (user id, system, etc.) */
  actor?: string;
  /** Optional human-readable note */
  note?: string;
}

export class OutOfCreditsError extends Error {
  readonly available: number;
  readonly required: number;
  constructor(available: number, required: number) {
    super(
      `Out of credits — you have ${available}, this action needs ${required}. Top up or upgrade your plan.`,
    );
    this.name = 'OutOfCreditsError';
    this.available = available;
    this.required = required;
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function rowToBalance(row: any): CreditBalance {
  const totalAvailable =
    (row.monthlyBalance ?? 0) + (row.topupBalance ?? 0) + (row.rolloverBalance ?? 0);
  return {
    id: row.id,
    tenantId: row.tenantId,
    plan: row.plan,
    monthlyGrant: row.monthlyGrant,
    monthlyBalance: row.monthlyBalance,
    topupBalance: row.topupBalance,
    rolloverBalance: row.rolloverBalance,
    totalAvailable,
    billingPeriodStart: row.billingPeriodStart,
    billingPeriodEnd: row.billingPeriodEnd,
    byoKeyDiscount: !!row.byoKeyDiscount,
    stripeCustomerId: row.stripeCustomerId ?? null,
    stripeSubscriptionId: row.stripeSubscriptionId ?? null,
    updatedAt: row.updatedAt,
  };
}

function nextMonthEnd(): Date {
  const d = new Date();
  d.setMonth(d.getMonth() + 1);
  return d;
}

// ---------------------------------------------------------------------------
// Plan management (admin)
// ---------------------------------------------------------------------------

export async function listPlans(db: Database): Promise<CreditPlan[]> {
  const rows = await db.select().from(creditPlans).orderBy(creditPlans.sortOrder);
  return rows.map((r) => ({
    key: r.key,
    label: r.label,
    description: r.description ?? null,
    monthlyPriceCents: r.monthlyPriceCents,
    yearlyPriceCents: r.yearlyPriceCents,
    monthlyGrant: r.monthlyGrant,
    rolloverMonths: r.rolloverMonths,
    seats: r.seats,
    byoKeyDiscountPct: r.byoKeyDiscountPct,
    features: (r.features as string[]) ?? [],
    stripePriceIdMonthly: r.stripePriceIdMonthly ?? null,
    stripePriceIdYearly: r.stripePriceIdYearly ?? null,
    enabled: r.enabled,
    sortOrder: r.sortOrder,
  }));
}

export async function getPlan(db: Database, key: string): Promise<CreditPlan | null> {
  const rows = await db.select().from(creditPlans).where(eq(creditPlans.key, key)).limit(1);
  const r = rows[0];
  if (!r) return null;
  return (await listPlans(db)).find((p) => p.key === key) ?? null;
}

export async function upsertPlan(db: Database, plan: Omit<CreditPlan, 'sortOrder'> & { sortOrder?: number }): Promise<void> {
  const existing = await getPlan(db, plan.key);
  if (existing) {
    await db
      .update(creditPlans)
      .set({
        label: plan.label,
        description: plan.description,
        monthlyPriceCents: plan.monthlyPriceCents,
        yearlyPriceCents: plan.yearlyPriceCents,
        monthlyGrant: plan.monthlyGrant,
        rolloverMonths: plan.rolloverMonths,
        seats: plan.seats,
        byoKeyDiscountPct: plan.byoKeyDiscountPct,
        features: plan.features as any,
        stripePriceIdMonthly: plan.stripePriceIdMonthly,
        stripePriceIdYearly: plan.stripePriceIdYearly,
        enabled: plan.enabled,
        sortOrder: plan.sortOrder ?? existing.sortOrder,
        updatedAt: new Date(),
      })
      .where(eq(creditPlans.key, plan.key));
  } else {
    await db.insert(creditPlans).values({
      key: plan.key,
      label: plan.label,
      description: plan.description,
      monthlyPriceCents: plan.monthlyPriceCents,
      yearlyPriceCents: plan.yearlyPriceCents,
      monthlyGrant: plan.monthlyGrant,
      rolloverMonths: plan.rolloverMonths,
      seats: plan.seats,
      byoKeyDiscountPct: plan.byoKeyDiscountPct,
      features: plan.features as any,
      stripePriceIdMonthly: plan.stripePriceIdMonthly,
      stripePriceIdYearly: plan.stripePriceIdYearly,
      enabled: plan.enabled,
      sortOrder: plan.sortOrder ?? 0,
    });
  }
}

// ---------------------------------------------------------------------------
// Balance management
// ---------------------------------------------------------------------------

/**
 * Get the tenant's balance, creating a Free-plan row if none exists.
 * Idempotent — safe to call on every request.
 */
export async function getOrCreateBalance(
  db: Database,
  tenantId: string,
): Promise<CreditBalance> {
  const existing = await db
    .select()
    .from(creditBalances)
    .where(eq(creditBalances.tenantId, tenantId))
    .limit(1);
  if (existing[0]) return rowToBalance(existing[0]);

  // Bootstrap with Free plan defaults
  const freePlan = await getPlan(db, 'free');
  const grant = freePlan?.monthlyGrant ?? INITIAL_FREE_CREDITS;

  const [created] = await db
    .insert(creditBalances)
    .values({
      tenantId,
      plan: 'free',
      monthlyGrant: grant,
      monthlyBalance: grant,
      topupBalance: 0,
      rolloverBalance: 0,
      billingPeriodEnd: nextMonthEnd(),
    })
    .returning();
  if (!created) throw new Error('Failed to create credit balance');

  await db.insert(creditTransactions).values({
    tenantId,
    kind: 'grant',
    amount: grant,
    balanceAfter: grant,
    refKind: 'signup_grant',
    actor: 'system',
    note: 'Initial Free plan credits',
  });

  return rowToBalance(created);
}

export async function getBalance(
  db: Database,
  tenantId: string,
): Promise<CreditBalance> {
  return getOrCreateBalance(db, tenantId);
}

/**
 * Atomically deduct credits from a tenant's balance. Throws
 * OutOfCreditsError if total available < amount.
 *
 * Drain order: monthly → rollover → topup
 */
export async function chargeCredit(
  db: Database,
  tenantId: string,
  input: ChargeInput,
): Promise<CreditBalance> {
  if (!input.amount || input.amount <= 0) {
    return getOrCreateBalance(db, tenantId);
  }

  // Ensure row exists before locking
  await getOrCreateBalance(db, tenantId);

  return await db.transaction(async (tx) => {
    const rows = await tx.execute(sql`
      SELECT * FROM trustai_credit_balances
      WHERE tenant_id = ${tenantId}
      FOR UPDATE
    `);
    const row = (rows as any[])[0];
    if (!row) throw new Error('Credit balance row missing after creation');

    const monthly = Number(row.monthly_balance ?? 0);
    const rollover = Number(row.rollover_balance ?? 0);
    const topup = Number(row.topup_balance ?? 0);
    const total = monthly + rollover + topup;

    if (total < input.amount) {
      throw new OutOfCreditsError(total, input.amount);
    }

    // Drain monthly first, then rollover, then topup
    let remaining = input.amount;
    const fromMonthly = Math.min(monthly, remaining);
    remaining -= fromMonthly;
    const fromRollover = Math.min(rollover, remaining);
    remaining -= fromRollover;
    const fromTopup = remaining; // safe by total check above

    const newMonthly = monthly - fromMonthly;
    const newRollover = rollover - fromRollover;
    const newTopup = topup - fromTopup;
    const newTotal = newMonthly + newRollover + newTopup;

    await tx.execute(sql`
      UPDATE trustai_credit_balances
      SET
        monthly_balance = ${newMonthly},
        rollover_balance = ${newRollover},
        topup_balance = ${newTopup},
        updated_at = NOW()
      WHERE tenant_id = ${tenantId}
    `);

    await tx.insert(creditTransactions).values({
      tenantId,
      kind: 'debit',
      amount: -input.amount,
      balanceAfter: newTotal,
      featureKey: input.featureKey ?? null,
      tier: input.tier ?? null,
      refKind: input.refKind ?? null,
      refId: input.refId ?? null,
      actor: input.actor ?? null,
      note: input.note ?? null,
    });

    return {
      id: row.id,
      tenantId,
      plan: row.plan,
      monthlyGrant: Number(row.monthly_grant ?? 0),
      monthlyBalance: newMonthly,
      topupBalance: newTopup,
      rolloverBalance: newRollover,
      totalAvailable: newTotal,
      billingPeriodStart: row.billing_period_start,
      billingPeriodEnd: row.billing_period_end,
      byoKeyDiscount: !!row.byo_key_discount,
      stripeCustomerId: row.stripe_customer_id ?? null,
      stripeSubscriptionId: row.stripe_subscription_id ?? null,
      updatedAt: new Date(),
    };
  });
}

/**
 * Add credits (grant, topup, refund). Used by Stripe webhooks,
 * monthly cron, and manual admin grants.
 */
export async function addCredit(
  db: Database,
  tenantId: string,
  amount: number,
  kind: 'grant' | 'topup' | 'refund' | 'rollover',
  input: Omit<ChargeInput, 'amount'> = {},
): Promise<CreditBalance> {
  if (amount <= 0) return getOrCreateBalance(db, tenantId);
  await getOrCreateBalance(db, tenantId);

  return await db.transaction(async (tx) => {
    const rows = await tx.execute(sql`
      SELECT * FROM trustai_credit_balances
      WHERE tenant_id = ${tenantId}
      FOR UPDATE
    `);
    const row = (rows as any[])[0];
    if (!row) throw new Error('Credit balance row missing');

    const field =
      kind === 'topup'
        ? 'topup_balance'
        : kind === 'rollover'
        ? 'rollover_balance'
        : 'monthly_balance';

    const monthly = Number(row.monthly_balance ?? 0);
    const rollover = Number(row.rollover_balance ?? 0);
    const topup = Number(row.topup_balance ?? 0);

    const newMonthly = field === 'monthly_balance' ? monthly + amount : monthly;
    const newRollover = field === 'rollover_balance' ? rollover + amount : rollover;
    const newTopup = field === 'topup_balance' ? topup + amount : topup;
    const newTotal = newMonthly + newRollover + newTopup;

    await tx.execute(sql`
      UPDATE trustai_credit_balances
      SET
        monthly_balance = ${newMonthly},
        rollover_balance = ${newRollover},
        topup_balance = ${newTopup},
        updated_at = NOW()
      WHERE tenant_id = ${tenantId}
    `);

    await tx.insert(creditTransactions).values({
      tenantId,
      kind,
      amount,
      balanceAfter: newTotal,
      featureKey: input.featureKey ?? null,
      tier: input.tier ?? null,
      refKind: input.refKind ?? null,
      refId: input.refId ?? null,
      actor: input.actor ?? null,
      note: input.note ?? null,
    });

    return {
      id: row.id,
      tenantId,
      plan: row.plan,
      monthlyGrant: Number(row.monthly_grant ?? 0),
      monthlyBalance: newMonthly,
      topupBalance: newTopup,
      rolloverBalance: newRollover,
      totalAvailable: newTotal,
      billingPeriodStart: row.billing_period_start,
      billingPeriodEnd: row.billing_period_end,
      byoKeyDiscount: !!row.byo_key_discount,
      stripeCustomerId: row.stripe_customer_id ?? null,
      stripeSubscriptionId: row.stripe_subscription_id ?? null,
      updatedAt: new Date(),
    };
  });
}

/**
 * Switch a tenant to a different plan (called by Stripe webhook on
 * subscription create/update). Refills monthly balance to the new
 * plan's grant. Existing topup credits are preserved.
 */
export async function changePlan(
  db: Database,
  tenantId: string,
  planKey: string,
  stripeIds?: { customerId?: string; subscriptionId?: string },
): Promise<CreditBalance> {
  const plan = await getPlan(db, planKey);
  if (!plan) throw new Error(`Plan ${planKey} not found`);

  await getOrCreateBalance(db, tenantId);

  return await db.transaction(async (tx) => {
    await tx.execute(sql`
      UPDATE trustai_credit_balances
      SET
        plan = ${planKey},
        monthly_grant = ${plan.monthlyGrant},
        monthly_balance = ${plan.monthlyGrant},
        billing_period_start = NOW(),
        billing_period_end = (NOW() + INTERVAL '1 month'),
        ${stripeIds?.customerId ? sql`stripe_customer_id = ${stripeIds.customerId},` : sql``}
        ${stripeIds?.subscriptionId ? sql`stripe_subscription_id = ${stripeIds.subscriptionId},` : sql``}
        updated_at = NOW()
      WHERE tenant_id = ${tenantId}
    `);

    await tx.insert(creditTransactions).values({
      tenantId,
      kind: 'grant',
      amount: plan.monthlyGrant,
      balanceAfter: plan.monthlyGrant,
      refKind: 'plan_change',
      refId: planKey,
      actor: 'system',
      note: `Switched to ${plan.label}`,
    });

    const rows = await tx.execute(sql`
      SELECT * FROM trustai_credit_balances WHERE tenant_id = ${tenantId}
    `);
    const r = (rows as any[])[0]!;
    return rowToBalance({
      id: r.id,
      tenantId: r.tenant_id,
      plan: r.plan,
      monthlyGrant: r.monthly_grant,
      monthlyBalance: r.monthly_balance,
      topupBalance: r.topup_balance,
      rolloverBalance: r.rollover_balance,
      billingPeriodStart: r.billing_period_start,
      billingPeriodEnd: r.billing_period_end,
      byoKeyDiscount: r.byo_key_discount,
      stripeCustomerId: r.stripe_customer_id,
      stripeSubscriptionId: r.stripe_subscription_id,
      updatedAt: r.updated_at,
    });
  });
}

// ---------------------------------------------------------------------------
// Transaction history
// ---------------------------------------------------------------------------

export async function listTransactions(
  db: Database,
  tenantId: string,
  limit: number = 50,
  offset: number = 0,
): Promise<CreditTransaction[]> {
  const rows = await db
    .select()
    .from(creditTransactions)
    .where(eq(creditTransactions.tenantId, tenantId))
    .orderBy(desc(creditTransactions.createdAt))
    .limit(limit)
    .offset(offset);

  return rows.map((r) => ({
    id: r.id,
    tenantId: r.tenantId,
    kind: r.kind as CreditTransactionKind,
    amount: r.amount,
    balanceAfter: r.balanceAfter,
    featureKey: r.featureKey ?? null,
    tier: r.tier ?? null,
    refKind: r.refKind ?? null,
    refId: r.refId ?? null,
    actor: r.actor ?? null,
    note: r.note ?? null,
    createdAt: r.createdAt,
  }));
}

// ---------------------------------------------------------------------------
// Seed default plans
// ---------------------------------------------------------------------------

export async function seedDefaultPlans(db: Database): Promise<{ created: number; skipped: number }> {
  const seeds: Omit<CreditPlan, 'sortOrder'>[] = [
    {
      key: 'free',
      label: 'Free',
      description: 'Try the system. Generate a few campaigns to see how it works.',
      monthlyPriceCents: 0,
      yearlyPriceCents: 0,
      monthlyGrant: INITIAL_FREE_CREDITS,
      rolloverMonths: 0,
      seats: 1,
      byoKeyDiscountPct: 0,
      features: [
        '1,000 credits per month',
        '1 Business Brain',
        'Cloud mode only',
        'Community support',
      ],
      stripePriceIdMonthly: null,
      stripePriceIdYearly: null,
      enabled: true,
    },
    {
      key: 'pro',
      label: 'Pro',
      description: 'For solopreneurs and freelancers running marketing solo.',
      monthlyPriceCents: 2900,
      yearlyPriceCents: 27900,
      monthlyGrant: 500,
      rolloverMonths: 1,
      seats: 1,
      byoKeyDiscountPct: 30,
      features: [
        '500 credits per month',
        'Bring your own API key (-30% credit cost)',
        '1-month credit rollover',
        'Email support',
        'Cloud + Private Cloud modes',
      ],
      stripePriceIdMonthly: null,
      stripePriceIdYearly: null,
      enabled: true,
    },
    {
      key: 'team',
      label: 'Team',
      description: 'Shared credits across your marketing team.',
      monthlyPriceCents: 9900,
      yearlyPriceCents: 95000,
      monthlyGrant: 2000,
      rolloverMonths: 1,
      seats: 5,
      byoKeyDiscountPct: 30,
      features: [
        '2,000 credits per month (shared pool)',
        '5 team seats',
        'Bring your own API key (-30%)',
        'Priority email support',
        'Cloud + Private Cloud modes',
      ],
      stripePriceIdMonthly: null,
      stripePriceIdYearly: null,
      enabled: true,
    },
    {
      key: 'business',
      label: 'Business',
      description: 'Agency / growing company. On-premise unlocked.',
      monthlyPriceCents: 29900,
      yearlyPriceCents: 287000,
      monthlyGrant: 8000,
      rolloverMonths: 1,
      seats: 15,
      byoKeyDiscountPct: 30,
      features: [
        '8,000 credits per month',
        '15 team seats',
        'On-Premise mode unlocked',
        'Priority phone support',
        'Custom integrations',
        'SLA available',
      ],
      stripePriceIdMonthly: null,
      stripePriceIdYearly: null,
      enabled: true,
    },
    {
      key: 'enterprise',
      label: 'Enterprise',
      description: 'On-prem, custom models, dedicated support, SLA.',
      monthlyPriceCents: 0,
      yearlyPriceCents: 0,
      monthlyGrant: 0,
      rolloverMonths: 0,
      seats: 999,
      byoKeyDiscountPct: 0,
      features: [
        'Unlimited credits (custom compute)',
        'Unlimited seats',
        'On-Premise + custom LLM fine-tuning',
        '99.9% SLA',
        'Dedicated success engineer',
        'White-label option',
      ],
      stripePriceIdMonthly: null,
      stripePriceIdYearly: null,
      enabled: true,
    },
  ];

  let created = 0;
  let skipped = 0;
  for (let i = 0; i < seeds.length; i++) {
    const seed = seeds[i]!;
    const existing = await getPlan(db, seed.key);
    if (existing) {
      skipped++;
      continue;
    }
    await upsertPlan(db, { ...seed, sortOrder: i });
    created++;
  }
  return { created, skipped };
}
