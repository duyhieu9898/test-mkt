/**
 * Admin Credits API (Phase B)
 *
 * Plan management + cross-tenant credit monitoring for the admin
 * dashboard. Mounted at /api/v1/admin/credits/*
 */

import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { eq, desc, sql } from 'drizzle-orm';
import { HTTPException } from 'hono/http-exception';
import { db } from '../lib/db';
import { users } from '@1person/core/db';
import { authMiddleware } from '../middleware/auth';
import { getTenantAI } from '../lib/tenant-ai';

const adminCreditsRouter = new Hono();
adminCreditsRouter.use('*', authMiddleware);

async function requireAdmin(c: any, next: any) {
  const { userId } = c.get('user');
  const user = await db.query.users.findFirst({
    where: eq(users.id, userId),
    columns: { id: true, role: true },
  });
  if (!user || user.role !== 'admin') {
    throw new HTTPException(403, { message: 'Admin access required' });
  }
  return next();
}
adminCreditsRouter.use('*', requireAdmin);

// ─── Plans CRUD ─────────────────────────────────────────────────────

const planSchema = z.object({
  key: z.string().min(1).max(30),
  label: z.string().min(1).max(100),
  description: z.string().nullable().optional(),
  monthlyPriceCents: z.number().int().min(0),
  yearlyPriceCents: z.number().int().min(0),
  monthlyGrant: z.number().int().min(0),
  rolloverMonths: z.number().int().min(0).default(1),
  seats: z.number().int().min(1).default(1),
  byoKeyDiscountPct: z.number().int().min(0).max(100).default(0),
  features: z.array(z.string()).default([]),
  stripePriceIdMonthly: z.string().nullable().optional(),
  stripePriceIdYearly: z.string().nullable().optional(),
  enabled: z.boolean().default(true),
  sortOrder: z.number().int().default(0),
});

adminCreditsRouter.get('/plans', async (c) => {
  const ai = getTenantAI();
  const plans = await ai.credits.listPlans();
  return c.json({ data: plans });
});

adminCreditsRouter.put(
  '/plans/:key',
  zValidator('json', planSchema.partial().omit({ key: true })),
  async (c) => {
    const ai = getTenantAI();
    const key = c.req.param('key');
    const body = c.req.valid('json');

    const existing = await ai.credits.getPlan(key);
    const merged = {
      key,
      label: body.label ?? existing?.label ?? key,
      description: body.description ?? existing?.description ?? null,
      monthlyPriceCents: body.monthlyPriceCents ?? existing?.monthlyPriceCents ?? 0,
      yearlyPriceCents: body.yearlyPriceCents ?? existing?.yearlyPriceCents ?? 0,
      monthlyGrant: body.monthlyGrant ?? existing?.monthlyGrant ?? 0,
      rolloverMonths: body.rolloverMonths ?? existing?.rolloverMonths ?? 1,
      seats: body.seats ?? existing?.seats ?? 1,
      byoKeyDiscountPct: body.byoKeyDiscountPct ?? existing?.byoKeyDiscountPct ?? 0,
      features: body.features ?? existing?.features ?? [],
      stripePriceIdMonthly: body.stripePriceIdMonthly ?? existing?.stripePriceIdMonthly ?? null,
      stripePriceIdYearly: body.stripePriceIdYearly ?? existing?.stripePriceIdYearly ?? null,
      enabled: body.enabled ?? existing?.enabled ?? true,
      sortOrder: body.sortOrder ?? existing?.sortOrder ?? 0,
    };
    await ai.credits.upsertPlan(merged);
    const updated = await ai.credits.getPlan(key);
    return c.json(updated);
  },
);

adminCreditsRouter.post('/plans/seed', async (c) => {
  const ai = getTenantAI();
  const result = await ai.credits.seedDefaultPlans();
  return c.json(result);
});

// ─── Cross-tenant monitoring ───────────────────────────────────────

adminCreditsRouter.get('/monitoring/overview', async (c) => {
  // Aggregate stats: total tenants, total credits granted/spent in last 30d,
  // top 10 spending tenants, low-balance alert count
  try {
    const totalTenants = await db.execute(sql`
      SELECT COUNT(*)::int as count FROM trustai_credit_balances
    `);
    const totalSpent30d = await db.execute(sql`
      SELECT COALESCE(SUM(ABS(amount)), 0)::int as total
      FROM trustai_credit_transactions
      WHERE kind = 'debit' AND created_at > NOW() - INTERVAL '30 days'
    `);
    const totalGranted30d = await db.execute(sql`
      SELECT COALESCE(SUM(amount), 0)::int as total
      FROM trustai_credit_transactions
      WHERE kind IN ('grant','topup') AND created_at > NOW() - INTERVAL '30 days'
    `);
    const lowBalance = await db.execute(sql`
      SELECT COUNT(*)::int as count
      FROM trustai_credit_balances
      WHERE (monthly_balance + topup_balance + rollover_balance) < (monthly_grant * 0.1)
    `);
    const topSpenders = await db.execute(sql`
      SELECT
        cb.tenant_id,
        t.name as tenant_name,
        cb.plan,
        cb.monthly_balance + cb.topup_balance + cb.rollover_balance as available,
        COALESCE(spent.total, 0)::int as spent_30d
      FROM trustai_credit_balances cb
      LEFT JOIN trustai_tenants t ON t.id = cb.tenant_id
      LEFT JOIN (
        SELECT tenant_id, SUM(ABS(amount)) as total
        FROM trustai_credit_transactions
        WHERE kind = 'debit' AND created_at > NOW() - INTERVAL '30 days'
        GROUP BY tenant_id
      ) spent ON spent.tenant_id = cb.tenant_id
      ORDER BY spent_30d DESC NULLS LAST
      LIMIT 10
    `);

    return c.json({
      tenants: {
        total: (totalTenants as any[])[0]?.count ?? 0,
        lowBalance: (lowBalance as any[])[0]?.count ?? 0,
      },
      credits: {
        spent30d: (totalSpent30d as any[])[0]?.total ?? 0,
        granted30d: (totalGranted30d as any[])[0]?.total ?? 0,
      },
      topSpenders: (topSpenders as any[]).map((r: any) => ({
        tenantId: r.tenant_id,
        tenantName: r.tenant_name,
        plan: r.plan,
        available: r.available,
        spent30d: r.spent_30d,
      })),
    });
  } catch (err) {
    console.error('[admin-credits] monitoring overview failed:', err);
    return c.json({
      tenants: { total: 0, lowBalance: 0 },
      credits: { spent30d: 0, granted30d: 0 },
      topSpenders: [],
    });
  }
});

// Manual credit grant (admin gives a tenant credits — useful for support)
adminCreditsRouter.post(
  '/grant/:tenantId',
  zValidator(
    'json',
    z.object({
      amount: z.number().int().min(1).max(100000),
      kind: z.enum(['grant', 'topup', 'refund']).default('grant'),
      note: z.string().max(500).optional(),
    }),
  ),
  async (c) => {
    const { userId } = c.get('user');
    const ai = getTenantAI();
    const tenantId = c.req.param('tenantId');
    const { amount, kind, note } = c.req.valid('json');
    const balance = await ai.credits.addCredit(tenantId, amount, kind, {
      actor: `admin:${userId}`,
      refKind: 'manual_grant',
      note,
    });
    return c.json({ balance });
  },
);

export default adminCreditsRouter;
