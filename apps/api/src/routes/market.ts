/**
 * Market & Competitors API (doc 10 §5). 5 credits per scan.
 */
import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { db } from '../lib/db';
import { companies } from '@1person/core/db';
import { authMiddleware } from '../middleware/auth';
import { HTTPException } from 'hono/http-exception';
import { getTenantAI, ensureTenantForCompany } from '../lib/tenant-ai';
import { ensureSufficientCredits, chargeFixedCredits } from '../lib/credits';
import { authorizeCompanyAccess, type CompanyPermission } from '../lib/company-access';
import { scanCompetitor } from '../services/market-scan';
import { suggestCompetitors } from '../services/suggest-competitors';
import { generateCompetitorBrief } from '../services/competitor-brief';
import { generateComparisonPage } from '../services/competitor-comparison';
import { generateMarketDigest } from '../services/market-digest';
import { generatePositioningMap } from '../services/positioning-map';
import { saveScanToBrain } from '../services/market-memory';
import { generateAndSaveCeoBrief } from '../services/ceo-advisor';
import { buildBusinessContext } from '../services/business-context';

const marketRouter = new Hono();
marketRouter.use('*', authMiddleware);
const SCAN_COST = 5;

async function verifyMarketAccess(
  companyId: string,
  userId: string,
  permission: CompanyPermission = 'market.view',
): Promise<string> {
  const access = await authorizeCompanyAccess(userId, companyId, permission);
  return ensureTenantForCompany(access.company.id, access.company.name);
}

async function listCompetitorsSafe(tenantId: string): Promise<Array<{ name: string }>> {
  try {
    return await getTenantAI().market.listCompetitors(tenantId);
  } catch (error) {
    console.warn('[market] Could not list competitors; continuing with empty list:', error);
    return [];
  }
}

const competitorSchema = z.object({
  name: z.string().min(1).max(255),
  url: z.string().url().max(1000).nullable().optional(),
  keywords: z.array(z.string().min(1).max(100)).max(10).optional(),
  notes: z.string().max(2000).nullable().optional(),
});

marketRouter.get('/:companyId/competitors', async (c) => {
  const { userId } = c.get('user');
  const tenantId = await verifyMarketAccess(c.req.param('companyId'), userId);
  const data = await listCompetitorsSafe(tenantId);
  return c.json({ data });
});

marketRouter.post('/:companyId/competitors', zValidator('json', competitorSchema), async (c) => {
  const { userId } = c.get('user');
  const tenantId = await verifyMarketAccess(c.req.param('companyId'), userId, 'market.scan');
  const competitor = await getTenantAI().market.createCompetitor(tenantId, c.req.valid('json'), `user:${userId}`);
  return c.json(competitor, 201);
});

marketRouter.patch('/:companyId/competitors/:id', zValidator('json', competitorSchema.partial()), async (c) => {
  const { userId } = c.get('user');
  const tenantId = await verifyMarketAccess(c.req.param('companyId'), userId, 'market.scan');
  const competitor = await getTenantAI().market.updateCompetitor(
    tenantId, c.req.param('id'), c.req.valid('json'), `user:${userId}`,
  );
  return c.json(competitor);
});

marketRouter.delete('/:companyId/competitors/:id', async (c) => {
  const { userId } = c.get('user');
  const tenantId = await verifyMarketAccess(c.req.param('companyId'), userId, 'market.scan');
  await getTenantAI().market.deleteCompetitor(tenantId, c.req.param('id'), `user:${userId}`);
  return c.json({ success: true });
});

// ─── Suggestion endpoints ────────────────────────────────────────────────

marketRouter.post('/:companyId/competitors/suggest', async (c) => {
  const { userId } = c.get('user');
  const companyId = c.req.param('companyId');
  const tenantId = await verifyMarketAccess(companyId, userId, 'market.scan');

  // Exclude already-tracked competitors so suggestions are fresh
  const existing = await listCompetitorsSafe(tenantId);
  const excludeNames = existing.map((co) => co.name);

  const result = await suggestCompetitors({ companyId, tenantId, excludeNames });
  return c.json({ success: true, data: result });
});

const bulkAddSchema = z.object({
  competitors: z.array(competitorSchema).min(1).max(10),
});

marketRouter.post(
  '/:companyId/competitors/bulk',
  zValidator('json', bulkAddSchema),
  async (c) => {
    const { userId } = c.get('user');
    const companyId = c.req.param('companyId');
    const tenantId = await verifyMarketAccess(companyId, userId, 'market.scan');

    const { competitors } = c.req.valid('json');
    const ai = getTenantAI();
    const created = [];
    for (const input of competitors) {
      const saved = await ai.market.createCompetitor(tenantId, input, `user:${userId}`);
      created.push(saved);
    }
    return c.json({ success: true, data: created }, 201);
  }
);

marketRouter.post('/:companyId/competitors/:id/scan', async (c) => {
  const { userId } = c.get('user');
  const companyId = c.req.param('companyId');
  const competitorId = c.req.param('id');
  const tenantId = await verifyMarketAccess(companyId, userId, 'market.scan');
  await authorizeCompanyAccess(userId, companyId, 'credits.spend');
  const ai = getTenantAI();
  const competitor = await ai.market.getCompetitor(tenantId, competitorId);
  if (!competitor) throw new HTTPException(404, { message: 'Competitor not found' });

  await ensureSufficientCredits(companyId, SCAN_COST);
  const scan = await ai.market.startScan(tenantId, competitorId);
  try {
    const businessContext = await buildBusinessContext(companyId).catch(() => null);
    const result = await scanCompetitor({
      id: competitor.id,
      name: competitor.name,
      url: competitor.url,
      keywords: competitor.keywords,
      companyName: businessContext?.companyName ?? null,
      industry: businessContext?.industry ?? null,
      products: businessContext?.products ?? [],
      audiences: businessContext?.targetAudience ?? [],
      language: businessContext?.language ?? null,
    });
    if (result.resolvedUrl && result.resolvedUrl !== competitor.url) {
      await ai.market.updateCompetitor(
        tenantId,
        competitor.id,
        { url: result.resolvedUrl },
        'system:market-scan',
      );
    }
    await ai.market.completeScan(scan.id, {
      status: 'completed',
      sources: result.sources, signals: result.signals,
      aiSummary: result.aiSummary, recommendedAction: result.recommendedAction,
    });
    await ai.market.updateCompetitorAfterScan(competitor.id, result.signals);

    // Memory loop: save signals to Brain so CEO Advisor + content generator pick them up
    await saveScanToBrain({
      companyId,
      tenantId,
      competitorId: competitor.id,
      competitorName: competitor.name,
      signals: result.signals,
      aiSummary: result.aiSummary,
      recommendedAction: result.recommendedAction,
      scanId: scan.id,
    });

    await chargeFixedCredits(companyId, SCAN_COST, {
      featureKey: 'market_scan', refKind: 'market_scan', refId: scan.id, actor: `user:${userId}`,
    });
    try {
      const company = await db.query.companies.findFirst({
        where: eq(companies.id, companyId),
        columns: { name: true },
      });
      await generateAndSaveCeoBrief({
        companyId,
        companyName: company?.name ?? 'Company',
        actor: 'system:market-intelligence',
        chargeCredits: false,
      });
    } catch (advisorError) {
      console.warn('[market.scan] CEO Advisor auto-refresh failed:', advisorError);
    }
    return c.json({ id: scan.id, status: 'completed', ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await ai.market.completeScan(scan.id, { status: 'failed', errorMessage: message });
    throw new HTTPException(500, { message: `Scan failed: ${message}` });
  }
});

// ─── Deep workflow endpoints (Layer 2-4) ─────────────────────────────────

marketRouter.post('/:companyId/competitors/:id/brief', async (c) => {
  const { userId } = c.get('user');
  const companyId = c.req.param('companyId');
  const competitorId = c.req.param('id');
  const tenantId = await verifyMarketAccess(companyId, userId, 'market.scan');

  const brief = await generateCompetitorBrief({ companyId, tenantId, competitorId });
  return c.json({ success: true, data: brief });
});

marketRouter.post('/:companyId/competitors/:id/comparison-page', async (c) => {
  const { userId } = c.get('user');
  const companyId = c.req.param('companyId');
  const competitorId = c.req.param('id');
  const tenantId = await verifyMarketAccess(companyId, userId, 'market.scan');

  const page = await generateComparisonPage({ companyId, tenantId, competitorId });
  return c.json({ success: true, data: { pageId: page.id, slug: page.slug, name: page.name } });
});

marketRouter.get('/:companyId/digest', async (c) => {
  const { userId } = c.get('user');
  const companyId = c.req.param('companyId');
  const tenantId = await verifyMarketAccess(companyId, userId);
  const windowDays = Math.min(30, Math.max(1, parseInt(c.req.query('days') ?? '7', 10) || 7));

  const digest = await generateMarketDigest({ companyId, tenantId, windowDays });
  return c.json({ success: true, data: digest });
});

marketRouter.get('/:companyId/positioning', async (c) => {
  const { userId } = c.get('user');
  const companyId = c.req.param('companyId');
  const tenantId = await verifyMarketAccess(companyId, userId);

  const map = await generatePositioningMap({ companyId, tenantId });
  return c.json({ success: true, data: map });
});

export default marketRouter;
