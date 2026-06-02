/**
 * User Credits API (Phase B)
 *
 * Per-tenant credit balance, transaction history, and plan info for
 * the user-facing UI (header badge, settings page, low-balance modal).
 *
 * Route: /api/v1/credits/*
 */

import { Hono } from 'hono';
import { eq } from 'drizzle-orm';
import { db } from '../lib/db';
import { companies } from '@1person/core/db';
import { authMiddleware } from '../middleware/auth';
import { HTTPException } from 'hono/http-exception';
import { getTenantAI, ensureTenantForCompany } from '../lib/tenant-ai';

const creditsRouter = new Hono();
creditsRouter.use('*', authMiddleware);

async function verifyOwnershipAndGetTenantId(
  companyId: string,
  userId: string,
): Promise<string> {
  const company = await db.query.companies.findFirst({
    where: eq(companies.id, companyId),
    columns: { id: true, name: true, ownerId: true },
  });
  if (!company) throw new HTTPException(404, { message: 'Company not found' });
  if (company.ownerId !== userId) {
    throw new HTTPException(403, { message: 'You do not own this company' });
  }
  return ensureTenantForCompany(company.id, company.name);
}

// ─── GET /credits/:companyId — current balance + plan ───────────────

creditsRouter.get('/:companyId', async (c) => {
  const { userId } = c.get('user');
  const tenantId = await verifyOwnershipAndGetTenantId(
    c.req.param('companyId'),
    userId,
  );
  const ai = getTenantAI();
  const balance = await ai.credits.getBalance(tenantId);
  const plan = await ai.credits.getPlan(balance.plan);
  return c.json({ balance, plan });
});

// ─── GET /credits/:companyId/transactions — history ─────────────────

creditsRouter.get('/:companyId/transactions', async (c) => {
  const { userId } = c.get('user');
  const tenantId = await verifyOwnershipAndGetTenantId(
    c.req.param('companyId'),
    userId,
  );
  const ai = getTenantAI();
  const limit = Math.min(Number(c.req.query('limit') ?? '50'), 200);
  const offset = Number(c.req.query('offset') ?? '0');
  const transactions = await ai.credits.listTransactions(tenantId, limit, offset);
  return c.json({ data: transactions });
});

// ─── GET /credits/plans — list available plans (no auth needed in
// theory but we keep it auth-required to throttle scrapers) ──────────

creditsRouter.get('/plans/list', async (c) => {
  const ai = getTenantAI();
  const plans = await ai.credits.listPlans();
  return c.json({ data: plans.filter((p) => p.enabled) });
});

export default creditsRouter;
