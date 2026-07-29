/**
 * User Credits API (Phase B)
 *
 * Per-company credit balance, transaction history, and plan info for
 * the user-facing UI (header badge, settings page, low-balance modal).
 *
 * Route: /api/v1/credits/*
 */

import { Hono } from 'hono';
import { authMiddleware } from '../middleware/auth';
import { HTTPException } from 'hono/http-exception';
import { getTenantAI } from '../lib/tenant-ai';
import { getUsageCreditCosts } from '../lib/credit-costs';
import { getCreditTenantIdFromCompanyId } from '../lib/credits';
import {
  authorizeCompanyAccess,
  roleHasPermission,
  type CompanyPermission,
} from '../lib/company-access';

const creditsRouter = new Hono();
creditsRouter.use('*', authMiddleware);

async function verifyCreditAccessAndGetTenantId(
  companyId: string,
  userId: string,
  permission: CompanyPermission,
) {
  const access = await authorizeCompanyAccess(userId, companyId, permission);
  const tenantId = await getCreditTenantIdFromCompanyId(access.company.id);
  if (!tenantId) throw new HTTPException(404, { message: 'Credit wallet not found' });
  return { tenantId, access };
}

function accessHasPermission(
  access: Awaited<ReturnType<typeof authorizeCompanyAccess>>,
  permission: CompanyPermission,
) {
  return !!access.role && roleHasPermission(access.role, permission);
}

// ─── GET /credits/:companyId — current balance + plan ───────────────

creditsRouter.get('/:companyId', async (c) => {
  const { userId } = c.get('user');
  const { tenantId, access } = await verifyCreditAccessAndGetTenantId(
    c.req.param('companyId'),
    userId,
    'credits.view',
  );
  const ai = getTenantAI();
  const balance = await ai.credits.getOrCreateBalance(tenantId);
  const plan = await ai.credits.getPlan(balance.plan);
  const costs = await getUsageCreditCosts();
  return c.json({
    balance,
    plan,
    costs,
    access: {
      scope: 'company',
      label: 'Company credits',
      canSpend: accessHasPermission(access, 'credits.spend'),
      canManage: accessHasPermission(access, 'credits.manage'),
    },
  });
});

// ─── GET /credits/:companyId/transactions — history ─────────────────

creditsRouter.get('/:companyId/transactions', async (c) => {
  const { userId } = c.get('user');
  const { tenantId } = await verifyCreditAccessAndGetTenantId(
    c.req.param('companyId'),
    userId,
    'credits.manage',
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
