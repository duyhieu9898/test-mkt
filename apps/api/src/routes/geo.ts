/**
 * GEO (Generative Engine Optimization) API — Block 1
 *
 * Founder tracks prompts they care about → we replay them against ChatGPT /
 * Claude / etc → return whether the brand was mentioned, where, and which
 * competitors won the slot. Run is manual (button); cron is Block 5+.
 */

import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { and, desc, eq } from 'drizzle-orm';
import { HTTPException } from 'hono/http-exception';
import { db } from '../lib/db';
import { companies, geoMentions, geoPrompts } from '@1person/core/db';
import { authMiddleware } from '../middleware/auth';
import { chargeFixedCredits, ensureSufficientCredits } from '../lib/credits';
import {
  runGeoPrompt,
  getShareOfVoiceTrend,
  listPromptsWithStats,
} from '../services/geo-tracker';

const geoRouter = new Hono();
geoRouter.use('*', authMiddleware);

const RUN_COST = 4; // per-prompt manual run; admin can override in admin/credits UI

async function verifyOwnership(companyId: string, userId: string): Promise<void> {
  const company = await db.query.companies.findFirst({
    where: eq(companies.id, companyId),
    columns: { id: true, ownerId: true },
  });
  if (!company) throw new HTTPException(404, { message: 'Company not found' });
  if (company.ownerId !== userId) {
    throw new HTTPException(403, { message: 'You do not own this company' });
  }
}

// ─── Prompts CRUD ──────────────────────────────────────────────────────

geoRouter.get('/:companyId/prompts', async (c) => {
  const { userId } = c.get('user');
  const companyId = c.req.param('companyId');
  await verifyOwnership(companyId, userId);
  const data = await listPromptsWithStats(companyId);
  return c.json({ data });
});

const promptSchema = z.object({
  promptText: z.string().min(3).max(500),
});

geoRouter.post(
  '/:companyId/prompts',
  zValidator('json', promptSchema),
  async (c) => {
    const { userId } = c.get('user');
    const companyId = c.req.param('companyId');
    await verifyOwnership(companyId, userId);
    const { promptText } = c.req.valid('json');
    const [created] = await db
      .insert(geoPrompts)
      .values({ companyId, promptText: promptText.trim() })
      .returning();
    return c.json(created, 201);
  },
);

geoRouter.delete('/:companyId/prompts/:id', async (c) => {
  const { userId } = c.get('user');
  const companyId = c.req.param('companyId');
  const id = c.req.param('id');
  await verifyOwnership(companyId, userId);
  await db
    .delete(geoPrompts)
    .where(and(eq(geoPrompts.id, id), eq(geoPrompts.companyId, companyId)));
  return c.json({ success: true });
});

// ─── Manual run ────────────────────────────────────────────────────────

geoRouter.post('/:companyId/prompts/:id/run', async (c) => {
  const { userId } = c.get('user');
  const companyId = c.req.param('companyId');
  const promptId = c.req.param('id');
  await verifyOwnership(companyId, userId);

  await ensureSufficientCredits(companyId, RUN_COST);

  try {
    const result = await runGeoPrompt(companyId, promptId);

    // Only charge if at least one provider returned data — otherwise the
    // founder got nothing for their credits and we'd be charging for noise.
    if (result.mentions.length > 0) {
      await chargeFixedCredits(companyId, RUN_COST, {
        featureKey: 'geo_run',
        refKind: 'geo_run',
        refId: promptId,
        actor: `user:${userId}`,
      });
    }

    return c.json({
      success: true,
      data: result,
      charged: result.mentions.length > 0 ? RUN_COST : 0,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new HTTPException(500, { message: `GEO run failed: ${message}` });
  }
});

// ─── Share of voice ────────────────────────────────────────────────────

geoRouter.get('/:companyId/share-of-voice', async (c) => {
  const { userId } = c.get('user');
  const companyId = c.req.param('companyId');
  await verifyOwnership(companyId, userId);

  const days = Math.min(60, Math.max(1, parseInt(c.req.query('days') ?? '7', 10) || 7));
  const data = await getShareOfVoiceTrend(companyId, days);
  return c.json({ data });
});

// ─── Mentions feed ─────────────────────────────────────────────────────

geoRouter.get('/:companyId/mentions', async (c) => {
  const { userId } = c.get('user');
  const companyId = c.req.param('companyId');
  await verifyOwnership(companyId, userId);

  const limit = Math.min(100, Math.max(1, parseInt(c.req.query('limit') ?? '20', 10) || 20));
  const promptId = c.req.query('promptId');

  const where = promptId
    ? and(eq(geoMentions.companyId, companyId), eq(geoMentions.promptId, promptId))
    : eq(geoMentions.companyId, companyId);

  const rows = await db
    .select()
    .from(geoMentions)
    .where(where)
    .orderBy(desc(geoMentions.runAt))
    .limit(limit);

  return c.json({ data: rows });
});

export default geoRouter;
