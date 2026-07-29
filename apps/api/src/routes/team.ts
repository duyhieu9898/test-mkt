/**
 * Team routes — Block 3.
 *
 *   GET  /team/{companyId}              -> list employees + KPI snapshots
 *   GET  /team/{companyId}/{slug}       -> employee detail + KPIs + thread
 *   POST /team/{companyId}/{slug}/chat  -> send message, get reply
 */
import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { authMiddleware } from '../middleware/auth';
import { HTTPException } from 'hono/http-exception';
import { authorizeCompanyAccess } from '../lib/company-access';
import {
  listEmployees,
  getEmployeeBySlug,
  resolveEmployeeKpis,
  sendMessageToEmployee,
  getThread,
  getEmployeeSpecialties,
} from '../services/team-service';
import { countChunks } from '../services/embedding-service';

const teamRouter = new Hono();

teamRouter.use('*', authMiddleware);

/* ─── List ──────────────────────────────────────────────────────── */

teamRouter.get('/:companyId', async (c) => {
  const { userId } = c.get('user');
  const companyId = c.req.param('companyId');
  await authorizeCompanyAccess(userId, companyId, 'company.view');

  const employees = await listEmployees(companyId);
  const memory = await countChunks(companyId);

  const enriched = await Promise.all(
    employees.map(async (e) => ({
      id: e.id,
      slug: e.slug,
      name: e.name,
      role: e.role,
      roleTitle: e.roleTitle,
      department: e.department,
      avatarEmoji: e.avatarEmoji,
      accentColor: e.accentColor,
      intro: e.intro,
      status: e.status,
      supervisorId: e.supervisorId,
      responsibilities: e.responsibilities,
      specialties: getEmployeeSpecialties(e.templateSlug),
      kpis: await resolveEmployeeKpis(companyId, e),
    })),
  );

  return c.json({ data: { employees: enriched, memory } });
});

/* ─── Detail ────────────────────────────────────────────────────── */

teamRouter.get('/:companyId/:slug', async (c) => {
  const { userId } = c.get('user');
  const companyId = c.req.param('companyId');
  const slug = c.req.param('slug');
  await authorizeCompanyAccess(userId, companyId, 'company.view');

  const employee = await getEmployeeBySlug(companyId, slug);
  if (!employee) throw new HTTPException(404, { message: 'Employee not found' });

  const kpis = await resolveEmployeeKpis(companyId, employee);
  const thread = await getThread(companyId, slug);

  return c.json({
    data: {
      id: employee.id,
      slug: employee.slug,
      name: employee.name,
      role: employee.role,
      roleTitle: employee.roleTitle,
      department: employee.department,
      avatarEmoji: employee.avatarEmoji,
      accentColor: employee.accentColor,
      intro: employee.intro,
      status: employee.status,
      supervisorId: employee.supervisorId,
      responsibilities: employee.responsibilities,
      specialties: getEmployeeSpecialties(employee.templateSlug),
      kpis,
      thread,
    },
  });
});

/* ─── Chat ──────────────────────────────────────────────────────── */

teamRouter.post(
  '/:companyId/:slug/chat',
  zValidator('json', z.object({ message: z.string().min(1).max(4000) })),
  async (c) => {
    const { userId } = c.get('user');
    const companyId = c.req.param('companyId');
    const slug = c.req.param('slug');
    await authorizeCompanyAccess(userId, companyId, 'company.view');
    const { message } = c.req.valid('json');

    try {
      const result = await sendMessageToEmployee(companyId, slug, message);
      return c.json({ data: result });
    } catch (e) {
      throw new HTTPException(400, { message: (e as Error).message });
    }
  },
);

export default teamRouter;
