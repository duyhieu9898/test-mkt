/**
 * Content Editor API — Block 4 (Real-time Semantic Grader).
 *
 * Endpoints:
 *   POST /content-editor/grade        — grade a draft + persist + return breakdown
 *   GET  /content-editor/grades       — list past grades for company
 *   GET  /content-editor/grades/:id   — fetch a single grade detail
 *
 * All endpoints require auth + a `companyId` query (for read) or in body
 * (for grade). Credit charging uses feature key `content_grade` so the
 * admin can configure the cost via the admin UI.
 */

import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { and, desc, eq } from 'drizzle-orm';
import { db } from '../lib/db';
import { contentGrades } from '@1person/core/db';
import { authMiddleware } from '../middleware/auth';
import { HTTPException } from 'hono/http-exception';
import { ensureSufficientCredits, chargeFixedCredits } from '../lib/credits';
import { gradeContent } from '../services/content-grader';
import { authorizeCompanyAccess, type CompanyPermission } from '../lib/company-access';

const contentEditorRouter = new Hono();
contentEditorRouter.use('*', authMiddleware);

async function assertCompanyAccess(
  companyId: string,
  userId: string,
  permission: CompanyPermission = 'company.view',
) {
  const access = await authorizeCompanyAccess(userId, companyId, permission);
  return access.company;
}

contentEditorRouter.post(
  '/grade',
  zValidator(
    'json',
    z.object({
      companyId: z.string().uuid(),
      content: z.string().min(50, 'Paste at least 50 characters'),
      targetKeyword: z.string().min(2).max(120),
    }),
  ),
  async (c) => {
    const { companyId, content, targetKeyword } = c.req.valid('json');
    const { userId } = c.get('user');
    await assertCompanyAccess(companyId, userId, 'credits.spend');

    // Pre-check credits (5 per grade — admin can override via feature config).
    await ensureSufficientCredits(companyId, 5);

    try {
      const result = await gradeContent({ companyId, contentText: content, targetKeyword });
      // Charge after success so failed grades don't burn credits.
      await chargeFixedCredits(companyId, 5, {
        featureKey: 'content_grade',
        refKind: 'content_grade',
        refId: result.id,
        actor: `user:${userId}`,
      }).catch(() => null);
      return c.json({ success: true, data: result });
    } catch (err: any) {
      console.error('[content-editor] grade failed:', err);
      throw new HTTPException(500, { message: err?.message || 'Could not grade content.' });
    }
  },
);

contentEditorRouter.get('/grades', async (c) => {
  const companyId = c.req.query('companyId');
  const limit = Math.max(1, Math.min(50, Number(c.req.query('limit') || 20)));
  if (!companyId) throw new HTTPException(400, { message: 'companyId is required' });
  const { userId } = c.get('user');
  await assertCompanyAccess(companyId, userId);

  const rows = await db
    .select({
      id: contentGrades.id,
      score: contentGrades.score,
      targetKeyword: contentGrades.targetKeyword,
      breakdown: contentGrades.breakdown,
      createdAt: contentGrades.createdAt,
    })
    .from(contentGrades)
    .where(eq(contentGrades.companyId, companyId))
    .orderBy(desc(contentGrades.createdAt))
    .limit(limit);

  return c.json({
    success: true,
    data: rows.map((r) => ({
      id: r.id,
      score: r.score,
      targetKeyword: r.targetKeyword,
      breakdown: r.breakdown,
      createdAt: r.createdAt.toISOString(),
    })),
  });
});

contentEditorRouter.get('/grades/:id', async (c) => {
  const id = c.req.param('id');
  const companyId = c.req.query('companyId');
  if (!companyId) throw new HTTPException(400, { message: 'companyId is required' });
  const { userId } = c.get('user');
  await assertCompanyAccess(companyId, userId);

  const row = await db.query.contentGrades.findFirst({
    where: and(eq(contentGrades.id, id), eq(contentGrades.companyId, companyId)),
  });
  if (!row) throw new HTTPException(404, { message: 'Grade not found' });

  return c.json({
    success: true,
    data: {
      id: row.id,
      score: row.score,
      targetKeyword: row.targetKeyword,
      contentText: row.contentText,
      breakdown: row.breakdown,
      suggestions: row.suggestions,
      createdAt: row.createdAt.toISOString(),
    },
  });
});

export default contentEditorRouter;
