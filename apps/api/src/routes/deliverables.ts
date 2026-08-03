import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import { and, desc, eq } from 'drizzle-orm';
import { deliverables, tasks } from '@1person/core/db';
import { HTTPException } from 'hono/http-exception';
import { db } from '../lib/db';
import { authMiddleware } from '../middleware/auth';
import { authorizeCompanyAccess } from '../lib/company-access';

const deliverablesRouter = new Hono();
deliverablesRouter.use('*', authMiddleware);

const deliverableStatuses = [
  'suggested',
  'generating',
  'ready_for_review',
  'approved',
  'published',
  'archived',
  'failed',
] as const;

deliverablesRouter.get('/company/:companyId', async (c) => {
  const { userId } = c.get('user');
  const companyId = c.req.param('companyId');
  await authorizeCompanyAccess(userId, companyId, 'deliverable.view');

  const status = c.req.query('status');
  const limit = Math.min(Math.max(Number(c.req.query('limit') || 50), 1), 100);
  const rows = await db
    .select()
    .from(deliverables)
    .where(status && deliverableStatuses.includes(status as typeof deliverableStatuses[number])
      ? and(
          eq(deliverables.companyId, companyId),
          eq(deliverables.status, status as typeof deliverableStatuses[number]),
        )
      : eq(deliverables.companyId, companyId))
    .orderBy(desc(deliverables.createdAt))
    .limit(limit);

  return c.json({ data: rows });
});

deliverablesRouter.get('/:id', async (c) => {
  const { userId } = c.get('user');
  const item = await db.query.deliverables.findFirst({
    where: eq(deliverables.id, c.req.param('id')),
  });
  if (!item) throw new HTTPException(404, { message: 'Deliverable not found' });
  await authorizeCompanyAccess(userId, item.companyId, 'deliverable.view');
  return c.json({ data: item });
});

deliverablesRouter.patch(
  '/:id/status',
  zValidator('json', z.object({
    status: z.enum(['ready_for_review', 'approved', 'archived']),
  })),
  async (c) => {
    const { userId } = c.get('user');
    const id = c.req.param('id');
    const { status } = c.req.valid('json');
    const item = await db.query.deliverables.findFirst({
      where: eq(deliverables.id, id),
    });
    if (!item) throw new HTTPException(404, { message: 'Deliverable not found' });
    await authorizeCompanyAccess(userId, item.companyId, 'deliverable.review');

    const now = new Date();
    const [updated] = await db
      .update(deliverables)
      .set({
        status,
        approvedByUserId: status === 'approved' ? userId : null,
        approvedAt: status === 'approved' ? now : null,
        updatedAt: now,
      })
      .where(eq(deliverables.id, id))
      .returning();

    if (item.taskId) {
      await db
        .update(tasks)
        .set({
          status: status === 'approved'
            ? 'completed'
            : status === 'archived'
              ? 'cancelled'
              : 'waiting_approval',
          completedAt: status === 'approved' ? now : null,
          updatedAt: now,
        })
        .where(eq(tasks.id, item.taskId));
    }

    return c.json({ data: updated });
  },
);

export default deliverablesRouter;
