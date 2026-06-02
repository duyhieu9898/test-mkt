/**
 * Content Autopilot routes (P8).
 *
 *   GET  /autopilot/:companyId            -> { config, history }
 *   PUT  /autopilot/:companyId            -> update config (enable / cadence / keywords / targets)
 *   POST /autopilot/:companyId/run-now    -> generate one post immediately (test / on-demand)
 *
 * Default mode publishes WordPress DRAFTS — the founder approves in WP.
 */
import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { eq, and, desc } from 'drizzle-orm';
import { db } from '../lib/db';
import { companies, campaignLaunches } from '@1person/core/db';
import { authMiddleware } from '../middleware/auth';
import { HTTPException } from 'hono/http-exception';
import { getAutopilot, upsertAutopilot, runAutopilotOnce } from '../services/content-autopilot';

const autopilotRouter = new Hono();
autopilotRouter.use('*', authMiddleware);

async function verifyOwnership(companyId: string, userId: string) {
  const company = await db.query.companies.findFirst({
    where: eq(companies.id, companyId),
    columns: { id: true, ownerId: true },
  });
  if (!company) throw new HTTPException(404, { message: 'Company not found' });
  if (company.ownerId !== userId) throw new HTTPException(403, { message: 'Access denied' });
}

async function recentAutopilotLaunches(companyId: string) {
  return db
    .select({
      id: campaignLaunches.id,
      keyword: campaignLaunches.keyword,
      status: campaignLaunches.status,
      steps: campaignLaunches.steps,
      createdAt: campaignLaunches.createdAt,
    })
    .from(campaignLaunches)
    .where(and(eq(campaignLaunches.companyId, companyId), eq(campaignLaunches.source, 'autopilot')))
    .orderBy(desc(campaignLaunches.createdAt))
    .limit(20);
}

autopilotRouter.get('/:companyId', async (c) => {
  const { userId } = c.get('user');
  const companyId = c.req.param('companyId');
  await verifyOwnership(companyId, userId);
  const config = await getAutopilot(companyId);
  const history = await recentAutopilotLaunches(companyId);
  return c.json({ data: { config, history } });
});

const targetsSchema = z.object({
  wordpress: z.boolean(),
  facebook: z.boolean(),
  linkedin: z.boolean(),
  instagram: z.boolean(),
});

autopilotRouter.put(
  '/:companyId',
  zValidator(
    'json',
    z.object({
      enabled: z.boolean().optional(),
      postsPerDay: z.number().int().min(1).max(4).optional(),
      targets: targetsSchema.optional(),
      mode: z.enum(['draft', 'autopublish']).optional(),
      keywordQueue: z.array(z.string().trim().min(2).max(160)).max(200).optional(),
    }),
  ),
  async (c) => {
    const { userId } = c.get('user');
    const companyId = c.req.param('companyId');
    await verifyOwnership(companyId, userId);
    const patch = c.req.valid('json');
    const config = await upsertAutopilot(companyId, patch);
    return c.json({ data: { config } });
  },
);

autopilotRouter.post('/:companyId/run-now', async (c) => {
  const { userId } = c.get('user');
  const companyId = c.req.param('companyId');
  await verifyOwnership(companyId, userId);
  const result = await runAutopilotOnce(companyId, { manual: true });
  if (!result.ran) throw new HTTPException(400, { message: result.reason ?? 'Nothing to run' });
  return c.json({ data: result });
});

export default autopilotRouter;
