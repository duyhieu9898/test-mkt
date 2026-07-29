import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { and, eq, ne, sql } from 'drizzle-orm';
import { HTTPException } from 'hono/http-exception';
import { db } from '../lib/db';
import { authMiddleware } from '../middleware/auth';
import { companies, companyMembers, users } from '@1person/core/db';
import {
  authorizeCompanyAccess,
  COMPANY_ROLE_DESCRIPTIONS,
  COMPANY_ROLE_LABELS,
  COMPANY_ROLES,
  getCompanyAccess,
  listRolePermissions,
  normalizeCompanyRole,
} from '../lib/company-access';
import { getCreditTenantIdFromCompanyId } from '../lib/credits';

const accessRouter = new Hono();
accessRouter.use('*', authMiddleware);

const roleSchema = z.enum(COMPANY_ROLES);

const memberCreateSchema = z.object({
  email: z.string().email(),
  role: roleSchema.exclude(['owner']),
});

const memberUpdateSchema = z.object({
  role: roleSchema.exclude(['owner']).optional(),
  status: z.enum(['active', 'suspended']).optional(),
});

function roleCatalog() {
  return COMPANY_ROLES.map((role) => ({
    role,
    label: COMPANY_ROLE_LABELS[role],
    description: COMPANY_ROLE_DESCRIPTIONS[role],
    permissions: listRolePermissions(role),
  }));
}

function publicUser(user: { id: string; name: string; email: string; avatarUrl?: string | null }) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    avatarUrl: user.avatarUrl ?? null,
  };
}

async function getCompanyCreditUsageByUser(companyId: string, userIds: string[]) {
  const usage = new Map<string, number>();
  const uniqueUserIds = Array.from(new Set(userIds.filter(Boolean)));
  if (uniqueUserIds.length === 0) return usage;

  const tenantId = await getCreditTenantIdFromCompanyId(companyId);
  if (!tenantId) return usage;

  try {
    const actors = uniqueUserIds.map((id) => `user:${id}`);
    const actorList = sql.join(actors.map((actor) => sql`${actor}`), sql`, `);
    const result: any = await db.execute(sql`
      SELECT actor, COALESCE(SUM(ABS(amount)), 0)::int AS credits_used
      FROM trustai_credit_transactions
      WHERE tenant_id = ${tenantId}
        AND kind = 'debit'
        AND amount < 0
        AND actor IN (${actorList})
      GROUP BY actor
    `);

    const rows = result.rows ?? result;
    for (const row of rows) {
      const actor = String(row.actor ?? '');
      if (!actor.startsWith('user:')) continue;
      usage.set(actor.slice('user:'.length), Number(row.credits_used ?? 0));
    }
  } catch (error) {
    console.warn('[access] Could not load member credit usage:', error);
  }

  return usage;
}

accessRouter.get('/company/:companyId/me', async (c) => {
  const { userId } = c.get('user');
  const companyId = c.req.param('companyId');
  const access = await getCompanyAccess(userId, companyId);
  if (!access.role) {
    throw new HTTPException(403, { message: 'You do not have access to this company.' });
  }

  return c.json({
    company: { id: access.company.id, name: access.company.name },
    role: access.role,
    roleLabel: COMPANY_ROLE_LABELS[access.role],
    roleDescription: COMPANY_ROLE_DESCRIPTIONS[access.role],
    permissions: access.permissions,
    isOwner: access.isOwner,
    isPlatformAdmin: access.isPlatformAdmin,
    canManageMembers: access.permissions.includes('company.manage_members'),
    roles: roleCatalog(),
  });
});

accessRouter.get('/company/:companyId/members', async (c) => {
  const { userId } = c.get('user');
  const companyId = c.req.param('companyId');
  await authorizeCompanyAccess(userId, companyId, 'company.manage_members');

  const company = await db.query.companies.findFirst({
    where: eq(companies.id, companyId),
    with: { owner: true },
  });
  if (!company) throw new HTTPException(404, { message: 'Company not found' });

  const memberRows = await db
    .select({
      id: companyMembers.id,
      companyId: companyMembers.companyId,
      userId: companyMembers.userId,
      role: companyMembers.role,
      status: companyMembers.status,
      createdAt: companyMembers.createdAt,
      updatedAt: companyMembers.updatedAt,
      userName: users.name,
      userEmail: users.email,
      userAvatarUrl: users.avatarUrl,
    })
    .from(companyMembers)
    .innerJoin(users, eq(companyMembers.userId, users.id))
    .where(and(eq(companyMembers.companyId, companyId), ne(companyMembers.status, 'removed')));

  const owner = company.owner;
  const memberUserIds = [owner.id, ...memberRows.map((row) => row.userId)];
  const creditUsageByUser = await getCompanyCreditUsageByUser(companyId, memberUserIds);
  return c.json({
    roles: roleCatalog(),
    members: [
      {
        id: `owner:${owner.id}`,
        companyId,
        user: publicUser(owner),
        role: 'owner',
        roleLabel: COMPANY_ROLE_LABELS.owner,
        status: 'active',
        isOwner: true,
        editable: false,
        creditsUsed: creditUsageByUser.get(owner.id) ?? 0,
        createdAt: company.createdAt,
        updatedAt: company.updatedAt,
      },
      ...memberRows
        .filter((row) => row.userId !== owner.id)
        .map((row) => {
          const role = normalizeCompanyRole(row.role);
          return {
            id: row.id,
            companyId: row.companyId,
            user: publicUser({
              id: row.userId,
              name: row.userName,
              email: row.userEmail,
              avatarUrl: row.userAvatarUrl,
            }),
            role,
            roleLabel: COMPANY_ROLE_LABELS[role],
            status: row.status,
            isOwner: false,
            editable: true,
            creditsUsed: creditUsageByUser.get(row.userId) ?? 0,
            createdAt: row.createdAt,
            updatedAt: row.updatedAt,
          };
        }),
    ],
  });
});

accessRouter.post('/company/:companyId/members', zValidator('json', memberCreateSchema), async (c) => {
  const { userId } = c.get('user');
  const companyId = c.req.param('companyId');
  const data = c.req.valid('json');
  await authorizeCompanyAccess(userId, companyId, 'company.manage_members');

  const [company, targetUser] = await Promise.all([
    db.query.companies.findFirst({ where: eq(companies.id, companyId), columns: { ownerId: true } }),
    db.query.users.findFirst({
      where: eq(users.email, data.email.trim().toLowerCase()),
      columns: { id: true, name: true, email: true, avatarUrl: true },
    }),
  ]);
  if (!company) throw new HTTPException(404, { message: 'Company not found' });
  if (!targetUser) {
    throw new HTTPException(404, {
      message: 'This email does not have a 1Person account yet. Ask them to sign up first, then add them here.',
    });
  }
  if (targetUser.id === company.ownerId) {
    throw new HTTPException(400, { message: 'The company owner already has full access.' });
  }

  const existing = await db.query.companyMembers.findFirst({
    where: and(eq(companyMembers.companyId, companyId), eq(companyMembers.userId, targetUser.id)),
  });
  const now = new Date();
  const [member] = existing
    ? await db
      .update(companyMembers)
      .set({ role: data.role, status: 'active', updatedAt: now })
      .where(eq(companyMembers.id, existing.id))
      .returning()
    : await db
      .insert(companyMembers)
      .values({
        companyId,
        userId: targetUser.id,
        role: data.role,
        status: 'active',
        invitedBy: userId,
        joinedAt: now,
      })
      .returning();
  if (!member) {
    throw new HTTPException(500, { message: 'Could not save team member access.' });
  }

  const role = normalizeCompanyRole(member.role);
  return c.json({
    member: {
      id: member.id,
      companyId,
      user: publicUser(targetUser),
      role,
      roleLabel: COMPANY_ROLE_LABELS[role],
      status: member.status,
      isOwner: false,
      editable: true,
      createdAt: member.createdAt,
      updatedAt: member.updatedAt,
    },
  }, existing ? 200 : 201);
});

accessRouter.patch('/company/:companyId/members/:memberId', zValidator('json', memberUpdateSchema), async (c) => {
  const { userId } = c.get('user');
  const companyId = c.req.param('companyId');
  const memberId = c.req.param('memberId');
  const data = c.req.valid('json');
  await authorizeCompanyAccess(userId, companyId, 'company.manage_members');

  const existing = await db.query.companyMembers.findFirst({
    where: and(eq(companyMembers.id, memberId), eq(companyMembers.companyId, companyId)),
  });
  if (!existing) throw new HTTPException(404, { message: 'Team member not found' });
  if (existing.userId === userId && data.status === 'suspended') {
    throw new HTTPException(400, { message: 'You cannot suspend your own access.' });
  }

  const [updated] = await db
    .update(companyMembers)
    .set({
      ...(data.role ? { role: data.role } : {}),
      ...(data.status ? { status: data.status } : {}),
      updatedAt: new Date(),
    })
    .where(eq(companyMembers.id, memberId))
    .returning();

  return c.json({ member: updated });
});

accessRouter.delete('/company/:companyId/members/:memberId', async (c) => {
  const { userId } = c.get('user');
  const companyId = c.req.param('companyId');
  const memberId = c.req.param('memberId');
  await authorizeCompanyAccess(userId, companyId, 'company.manage_members');

  const existing = await db.query.companyMembers.findFirst({
    where: and(eq(companyMembers.id, memberId), eq(companyMembers.companyId, companyId)),
  });
  if (!existing) throw new HTTPException(404, { message: 'Team member not found' });
  if (existing.userId === userId) {
    throw new HTTPException(400, { message: 'You cannot remove your own access.' });
  }

  await db
    .update(companyMembers)
    .set({ status: 'removed', updatedAt: new Date() })
    .where(eq(companyMembers.id, memberId));

  return c.json({ success: true });
});

export default accessRouter;
