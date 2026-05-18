/**
 * Block 8 — Campaign Launcher routes.
 *
 *   POST /launches/{cid}      — start a new launch
 *   GET  /launches/{cid}      — list past launches
 *   GET  /launches/{cid}/{id} — poll one launch (UI re-fetches every 2s)
 */
import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { eq, desc } from 'drizzle-orm';
import { db } from '../lib/db';
import { companies, campaignLaunches } from '@1person/core/db';
import { authMiddleware } from '../middleware/auth';
import { HTTPException } from 'hono/http-exception';
import { startLaunch, getLaunch } from '../services/launch-orchestrator';

const launchesRouter = new Hono();

launchesRouter.use('*', authMiddleware);

async function verifyOwnership(companyId: string, userId: string) {
  const company = await db.query.companies.findFirst({
    where: eq(companies.id, companyId),
    columns: { id: true, ownerId: true },
  });
  if (!company) throw new HTTPException(404, { message: 'Company not found' });
  if (company.ownerId !== userId) throw new HTTPException(403, { message: 'Access denied' });
}

launchesRouter.post(
  '/:companyId',
  zValidator(
    'json',
    z.object({
      keyword: z.string().min(3).max(200),
      brief: z.string().max(2000).optional(),
      targets: z.object({
        wordpress: z.boolean().default(false),
        facebook: z.boolean().default(false),
        linkedin: z.boolean().default(false),
        instagram: z.boolean().default(false),
      }),
    }),
  ),
  async (c) => {
    const { userId } = c.get('user');
    const companyId = c.req.param('companyId');
    await verifyOwnership(companyId, userId);
    const body = c.req.valid('json');
    const result = await startLaunch({
      companyId,
      keyword: body.keyword,
      brief: body.brief,
      targets: body.targets,
    });
    return c.json({ data: result });
  },
);

launchesRouter.get('/:companyId', async (c) => {
  const { userId } = c.get('user');
  const companyId = c.req.param('companyId');
  await verifyOwnership(companyId, userId);
  const rows = await db
    .select()
    .from(campaignLaunches)
    .where(eq(campaignLaunches.companyId, companyId))
    .orderBy(desc(campaignLaunches.createdAt))
    .limit(50);
  return c.json({ data: rows });
});

launchesRouter.get('/:companyId/:id', async (c) => {
  const { userId } = c.get('user');
  const companyId = c.req.param('companyId');
  const id = c.req.param('id');
  await verifyOwnership(companyId, userId);
  const row = await getLaunch(companyId, id);
  if (!row) throw new HTTPException(404, { message: 'Launch not found' });
  return c.json({ data: row });
});

export default launchesRouter;
