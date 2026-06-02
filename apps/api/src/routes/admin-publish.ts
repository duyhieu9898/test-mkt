/**
 * Admin Publish Queue API — doc 10 §L3 (Đợt 5)
 * Route: /api/v1/admin/publish/*   Auth: admin role required.
 */
import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { HTTPException } from 'hono/http-exception';
import { and, asc, eq } from 'drizzle-orm';
import { db } from '../lib/db';
import { companies, landingPages, users } from '@1person/core/db';
import { authMiddleware } from '../middleware/auth';

const adminPublishRouter = new Hono();
adminPublishRouter.use('*', authMiddleware);

async function requireAdmin(c: any, next: any) {
  const { userId } = c.get('user');
  const user = await db.query.users.findFirst({ where: eq(users.id, userId), columns: { id: true, role: true } });
  if (!user || user.role !== 'admin') throw new HTTPException(403, { message: 'Admin access required' });
  return next();
}
adminPublishRouter.use('*', requireAdmin);

// GET /queue — pending pages
adminPublishRouter.get('/queue', async (c) => {
  const rows = await db.select({
    id: landingPages.id, name: landingPages.name, subdomain: landingPages.subdomain,
    seo: landingPages.seo, primaryColor: landingPages.primaryColor,
    publishSubmittedAt: landingPages.publishSubmittedAt,
    companyId: landingPages.companyId, companyName: companies.name,
  }).from(landingPages)
    .leftJoin(companies, eq(companies.id, landingPages.companyId))
    .where(eq(landingPages.publishApprovalStatus, 'pending_approval'))
    .orderBy(asc(landingPages.publishSubmittedAt));
  return c.json({ items: rows, count: rows.length });
});

// POST /queue/:pageId/approve
adminPublishRouter.post('/queue/:pageId/approve', async (c) => {
  const { userId } = c.get('user') as { userId: string };
  const pageId = c.req.param('pageId');
  const page = await db.query.landingPages.findFirst({
    where: and(eq(landingPages.id, pageId), eq(landingPages.publishApprovalStatus, 'pending_approval')),
    columns: { id: true, subdomain: true },
  });
  if (!page) return c.json({ error: 'Page not pending review' }, 404);
  const now = new Date();
  const [updated] = await db.update(landingPages).set({
    publishApprovalStatus: 'approved', publishApprovedAt: now,
    publishApprovedBy: userId, publishRejectReason: null,
    status: 'published', publishedAt: now,
    publishedUrl: `/pages/${page.subdomain}`, updatedAt: now,
  }).where(eq(landingPages.id, pageId)).returning();
  return c.json({ success: true, page: updated });
});

// POST /queue/:pageId/reject
adminPublishRouter.post('/queue/:pageId/reject',
  zValidator('json', z.object({ reason: z.string().min(1).max(2000) })),
  async (c) => {
    const pageId = c.req.param('pageId');
    const { reason } = c.req.valid('json');
    const page = await db.query.landingPages.findFirst({
      where: and(eq(landingPages.id, pageId), eq(landingPages.publishApprovalStatus, 'pending_approval')),
      columns: { id: true },
    });
    if (!page) return c.json({ error: 'Page not pending review' }, 404);
    const [updated] = await db.update(landingPages).set({
      publishApprovalStatus: 'rejected', publishRejectReason: reason, updatedAt: new Date(),
    }).where(eq(landingPages.id, pageId)).returning();
    return c.json({ success: true, page: updated });
  },
);

export default adminPublishRouter;
