/**
 * Admin Setup Readiness routes.
 *
 * GET /api/v1/admin/setup/readiness — full checklist + score.
 *
 * Used by the Setup Readiness admin page and the dashboard banner.
 */
import { Hono } from 'hono';
import { eq } from 'drizzle-orm';
import { db } from '../lib/db';
import { users } from '@1person/core/db';
import { authMiddleware } from '../middleware/auth';
import { getSetupReadiness } from '../services/setup-readiness';

const adminSetupRouter = new Hono();

adminSetupRouter.use('*', authMiddleware);

async function assertAdmin(c: any) {
  const { userId } = c.get('user');
  const u = await db.query.users.findFirst({ where: eq(users.id, userId) });
  if ((u as any)?.role !== 'admin') {
    return c.json({ error: 'Admin access required' }, 403);
  }
  return null;
}

adminSetupRouter.get('/readiness', async (c) => {
  const denied = await assertAdmin(c);
  if (denied) return denied;
  const report = await getSetupReadiness();
  return c.json({ data: report });
});

export default adminSetupRouter;
