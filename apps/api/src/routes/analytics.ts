/**
 * Analytics routes — real GA4 reads (P4 / tool T01).
 *
 *   GET  /analytics/:companyId/ga4            -> { googleConnected, propertyId, connected, summary }
 *   POST /analytics/:companyId/ga4/property   -> save the GA4 numeric property id
 *
 * GA4 reuses the founder's existing Google OAuth (the one connected for Search
 * Console) plus a property id stored per-company in knowledge_base. No env keys,
 * no background polling — the UI fetches on demand.
 */
import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { eq, and } from 'drizzle-orm';
import { db } from '../lib/db';
import { companies, knowledgeBase } from '@1person/core/db';
import { authMiddleware } from '../middleware/auth';
import { HTTPException } from 'hono/http-exception';
import { Ga4Client } from '../services/ga4-client';

const analyticsRouter = new Hono();
analyticsRouter.use('*', authMiddleware);

async function verifyOwnership(companyId: string, userId: string) {
  const company = await db.query.companies.findFirst({
    where: eq(companies.id, companyId),
    columns: { id: true, ownerId: true },
  });
  if (!company) throw new HTTPException(404, { message: 'Company not found' });
  if (company.ownerId !== userId) throw new HTTPException(403, { message: 'Access denied' });
}

async function getGoogleRefreshToken(companyId: string): Promise<string | null> {
  const row = await db.query.knowledgeBase.findFirst({
    where: and(eq(knowledgeBase.companyId, companyId), eq(knowledgeBase.category, 'integration_google')),
  });
  if (!row) return null;
  try {
    return JSON.parse(row.content)?.refreshToken ?? null;
  } catch {
    return null;
  }
}

async function getGa4PropertyId(companyId: string): Promise<string | null> {
  const row = await db.query.knowledgeBase.findFirst({
    where: and(eq(knowledgeBase.companyId, companyId), eq(knowledgeBase.category, 'integration_ga4')),
  });
  if (!row) return null;
  try {
    return JSON.parse(row.content)?.propertyId ?? null;
  } catch {
    return null;
  }
}

analyticsRouter.get('/:companyId/ga4', async (c) => {
  const { userId } = c.get('user');
  const companyId = c.req.param('companyId');
  await verifyOwnership(companyId, userId);

  const days = Math.min(Math.max(Number(c.req.query('days') ?? 28), 1), 90);
  const refreshToken = await getGoogleRefreshToken(companyId);
  const propertyId = await getGa4PropertyId(companyId);

  if (!refreshToken) {
    return c.json({ data: { googleConnected: false, propertyId: null, connected: false, summary: null } });
  }
  if (!propertyId) {
    return c.json({ data: { googleConnected: true, propertyId: null, connected: false, summary: null } });
  }

  const client = new Ga4Client(refreshToken);
  const summary = await client.fetchSummary(propertyId, days);
  return c.json({
    data: {
      googleConnected: true,
      propertyId,
      connected: !!summary,
      summary,
    },
  });
});

analyticsRouter.post(
  '/:companyId/ga4/property',
  zValidator('json', z.object({ propertyId: z.string().trim().regex(/^(properties\/)?\d{4,15}$/, 'Enter your numeric GA4 property ID') })),
  async (c) => {
    const { userId } = c.get('user');
    const companyId = c.req.param('companyId');
    await verifyOwnership(companyId, userId);
    const { propertyId } = c.req.valid('json');
    const clean = propertyId.replace(/^properties\//, '');

    const existing = await db.query.knowledgeBase.findFirst({
      where: and(eq(knowledgeBase.companyId, companyId), eq(knowledgeBase.category, 'integration_ga4')),
    });
    const content = JSON.stringify({ propertyId: clean, savedAt: new Date().toISOString() });
    if (existing) {
      await db.update(knowledgeBase).set({ content }).where(eq(knowledgeBase.id, existing.id));
    } else {
      await db.insert(knowledgeBase).values({
        companyId,
        category: 'integration_ga4',
        title: 'GA4 Property',
        content,
        source: 'manual',
      });
    }
    return c.json({ data: { propertyId: clean } });
  },
);

export default analyticsRouter;
