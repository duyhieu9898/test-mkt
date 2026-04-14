/**
 * Gamification API Routes — CEO Motivation Engine
 *
 * Endpoints for Growth Score, Daily Missions, and Streak tracking.
 */

import { Hono } from 'hono';
import { eq } from 'drizzle-orm';
import { db } from '../lib/db';
import { companies } from '@1person/core/db';
import { authMiddleware, getUserCompanies } from '../middleware/auth';
import { HTTPException } from 'hono/http-exception';
import { ensureTenantForCompany } from '../lib/tenant-ai';
import { computeGrowthScore } from '../services/growth-score';
import {
  getDailyMissions,
  completeMission,
  skipMission,
  getStreak,
} from '../services/daily-missions';

const gamificationRouter = new Hono();
gamificationRouter.use('*', authMiddleware);

// Shared helper — resolve company + verify ownership + get tenant
async function resolveCompany(companyId: string, userId: string) {
  const userCompanies = await getUserCompanies(userId);
  if (!userCompanies.some((co) => co.id === companyId)) {
    throw new HTTPException(403, { message: 'Access denied' });
  }

  const company = await db.query.companies.findFirst({
    where: eq(companies.id, companyId),
    columns: { id: true, name: true },
  });
  if (!company) throw new HTTPException(404, { message: 'Company not found' });
  const tenantId = await ensureTenantForCompany(company.id, company.name);
  return { company, tenantId };
}

// ─── Growth Score ────────────────────────────────────────────────────────

gamificationRouter.get('/:companyId/growth-score', async (c) => {
  const companyId = c.req.param('companyId');
  const { userId } = c.get('user');
  await resolveCompany(companyId, userId);
  const score = await computeGrowthScore(companyId);
  return c.json({ success: true, data: score });
});

// ─── Daily Missions ──────────────────────────────────────────────────────

gamificationRouter.get('/:companyId/missions', async (c) => {
  const companyId = c.req.param('companyId');
  const { userId } = c.get('user');
  const { tenantId } = await resolveCompany(companyId, userId);
  const missions = await getDailyMissions(companyId, tenantId);
  return c.json({ success: true, data: missions });
});

gamificationRouter.post('/:companyId/missions/:missionId/complete', async (c) => {
  const companyId = c.req.param('companyId');
  const missionId = c.req.param('missionId');
  const { userId } = c.get('user');
  await resolveCompany(companyId, userId);
  const result = await completeMission(companyId, missionId);
  return c.json({ success: true, data: result });
});

gamificationRouter.post('/:companyId/missions/:missionId/skip', async (c) => {
  const companyId = c.req.param('companyId');
  const missionId = c.req.param('missionId');
  const { userId } = c.get('user');
  await resolveCompany(companyId, userId);
  const mission = await skipMission(companyId, missionId);
  return c.json({ success: true, data: { mission } });
});

// ─── Streak ──────────────────────────────────────────────────────────────

gamificationRouter.get('/:companyId/streak', async (c) => {
  const companyId = c.req.param('companyId');
  const { userId } = c.get('user');
  await resolveCompany(companyId, userId);
  const streak = await getStreak(companyId);
  return c.json({ success: true, data: streak });
});

export default gamificationRouter;
