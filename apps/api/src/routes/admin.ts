import { Hono } from 'hono';
import { eq, desc, sql, and, or, like } from 'drizzle-orm';
import { db } from '../lib/db';
import { users, sessions, siteConfig } from '@1person/core/db';
import { companies } from '@1person/core/db';
import { blogPosts } from '@1person/core/db';
import { authMiddleware } from '../middleware/auth';

const admin = new Hono();

// Apply auth to all routes
admin.use('*', authMiddleware);

// Helper: check admin role (avoids repeating the check in every endpoint)
async function requireAdmin(c: any): Promise<Response | null> {
  const { userId } = c.get('user');
  const currentUser = await db.query.users.findFirst({ where: eq(users.id, userId) });
  if ((currentUser as any)?.role !== 'admin') {
    return c.json({ error: 'Admin access required' }, 403);
  }
  return null;
}

// ============================================
// 1. Dashboard Stats
// ============================================

admin.get('/dashboard', async (c) => {
  const denied = await requireAdmin(c);
  if (denied) return denied;

  const [userCount] = await db.select({ count: sql<number>`count(*)` }).from(users);
  const [pendingCount] = await db.select({ count: sql<number>`count(*)` }).from(users).where(eq(users.approvalStatus as any, 'pending'));
  const [activeCount] = await db.select({ count: sql<number>`count(*)` }).from(users).where(eq(users.isActive as any, true));
  const [companyCount] = await db.select({ count: sql<number>`count(*)` }).from(companies);
  const [activeCompanyCount] = await db.select({ count: sql<number>`count(*)` }).from(companies).where(eq(companies.status as any, 'active'));
  const [blogCount] = await db.select({ count: sql<number>`count(*)` }).from(blogPosts);
  const [publishedBlogCount] = await db.select({ count: sql<number>`count(*)` }).from(blogPosts).where(eq(blogPosts.status as any, 'published'));

  return c.json({
    totalUsers: userCount?.count ?? 0,
    pendingUsers: pendingCount?.count ?? 0,
    activeUsers: activeCount?.count ?? 0,
    totalCompanies: companyCount?.count ?? 0,
    activeCompanies: activeCompanyCount?.count ?? 0,
    totalBlogPosts: blogCount?.count ?? 0,
    publishedBlogPosts: publishedBlogCount?.count ?? 0,
  });
});

// ============================================
// 2. Site Config CRUD
// ============================================

// List all site config entries
admin.get('/site-config', async (c) => {
  const denied = await requireAdmin(c);
  if (denied) return denied;

  const section = c.req.query('section');
  const locale = c.req.query('locale');

  const conditions: any[] = [];
  if (section) conditions.push(eq(siteConfig.section as any, section));
  if (locale) conditions.push(eq(siteConfig.locale as any, locale));

  const entries = conditions.length > 0
    ? await db.select().from(siteConfig).where(and(...conditions))
    : await db.select().from(siteConfig);

  return c.json({ data: entries });
});

// Get single site config entry by section+locale
admin.get('/site-config/:section/:locale', async (c) => {
  const denied = await requireAdmin(c);
  if (denied) return denied;

  const section = c.req.param('section');
  const locale = c.req.param('locale');

  const [entry] = await db
    .select()
    .from(siteConfig)
    .where(and(eq(siteConfig.section as any, section), eq(siteConfig.locale as any, locale)));

  if (!entry) {
    return c.json({ error: 'Site config entry not found' }, 404);
  }

  return c.json({ data: entry });
});

// Upsert site config entry
admin.put('/site-config/:section/:locale', async (c) => {
  const denied = await requireAdmin(c);
  if (denied) return denied;

  const { userId } = c.get('user');
  const section = c.req.param('section');
  const locale = c.req.param('locale');
  const body = await c.req.json();
  const { content } = body;

  if (!content) {
    return c.json({ error: 'content is required' }, 400);
  }

  const [result] = await db
    .insert(siteConfig)
    .values({
      section,
      locale,
      content,
      updatedBy: userId,
    } as any)
    .onConflictDoUpdate({
      target: [siteConfig.section, siteConfig.locale],
      set: {
        content,
        updatedBy: userId,
        updatedAt: new Date(),
      } as any,
    })
    .returning();

  return c.json({ data: result });
});

// ============================================
// 3. User Management
// ============================================

// List all users with search/filter/pagination
admin.get('/users', async (c) => {
  const denied = await requireAdmin(c);
  if (denied) return denied;

  const search = c.req.query('search');
  const role = c.req.query('role');
  const status = c.req.query('status');
  const limit = parseInt(c.req.query('limit') || '50', 10);
  const offset = parseInt(c.req.query('offset') || '0', 10);

  const conditions: any[] = [];
  if (search) {
    conditions.push(
      or(
        like(users.name as any, `%${search}%`),
        like(users.email as any, `%${search}%`)
      )
    );
  }
  if (role) {
    conditions.push(eq(users.role as any, role));
  }
  if (status) {
    conditions.push(eq(users.approvalStatus as any, status));
  }

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const [totalResult] = await db
    .select({ count: sql<number>`count(*)` })
    .from(users)
    .where(whereClause as any);

  const userList = await db
    .select()
    .from(users)
    .where(whereClause as any)
    .orderBy(desc(users.createdAt))
    .limit(limit)
    .offset(offset);

  return c.json({ users: userList, total: totalResult?.count ?? 0 });
});

// User stats
admin.get('/users/stats', async (c) => {
  const denied = await requireAdmin(c);
  if (denied) return denied;

  const [total] = await db.select({ count: sql<number>`count(*)` }).from(users);
  const [active] = await db.select({ count: sql<number>`count(*)` }).from(users).where(eq(users.isActive as any, true));
  const [pending] = await db.select({ count: sql<number>`count(*)` }).from(users).where(eq(users.approvalStatus as any, 'pending'));
  const [rejected] = await db.select({ count: sql<number>`count(*)` }).from(users).where(eq(users.approvalStatus as any, 'rejected'));
  const [admins] = await db.select({ count: sql<number>`count(*)` }).from(users).where(eq(users.role as any, 'admin'));

  return c.json({
    total: total?.count ?? 0,
    active: active?.count ?? 0,
    pending: pending?.count ?? 0,
    rejected: rejected?.count ?? 0,
    admins: admins?.count ?? 0,
  });
});

// Update user role
admin.patch('/users/:id/role', async (c) => {
  const denied = await requireAdmin(c);
  if (denied) return denied;

  const id = c.req.param('id');
  const body = await c.req.json();
  const { role } = body;

  if (!role || !['admin', 'user'].includes(role)) {
    return c.json({ error: 'Invalid role. Must be "admin" or "user"' }, 400);
  }

  const [updated] = await db
    .update(users)
    .set({ role, updatedAt: new Date() } as any)
    .where(eq(users.id as any, id))
    .returning();

  if (!updated) {
    return c.json({ error: 'User not found' }, 404);
  }

  return c.json({ data: updated });
});

// Update user status
admin.patch('/users/:id/status', async (c) => {
  const denied = await requireAdmin(c);
  if (denied) return denied;

  const id = c.req.param('id');
  const body = await c.req.json();
  const { approvalStatus, isActive } = body;

  const updateData: any = { updatedAt: new Date() };

  if (approvalStatus !== undefined) {
    if (!['approved', 'rejected', 'pending'].includes(approvalStatus)) {
      return c.json({ error: 'Invalid approvalStatus' }, 400);
    }
    updateData.approvalStatus = approvalStatus;
  }

  if (isActive !== undefined) {
    updateData.isActive = isActive;
  }

  const [updated] = await db
    .update(users)
    .set(updateData)
    .where(eq(users.id as any, id))
    .returning();

  if (!updated) {
    return c.json({ error: 'User not found' }, 404);
  }

  return c.json({ data: updated });
});

// ============================================
// 4. Company Management
// ============================================

// List all companies with owner info
admin.get('/companies', async (c) => {
  const denied = await requireAdmin(c);
  if (denied) return denied;

  const limit = parseInt(c.req.query('limit') || '50', 10);
  const offset = parseInt(c.req.query('offset') || '0', 10);
  const status = c.req.query('status');

  const conditions: any[] = [];
  if (status) {
    conditions.push(eq(companies.status as any, status));
  }

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const [totalResult] = await db
    .select({ count: sql<number>`count(*)` })
    .from(companies)
    .where(whereClause as any);

  const companyList = await db
    .select({
      id: companies.id,
      name: companies.name,
      slug: companies.slug,
      description: companies.description,
      industry: companies.industry,
      status: companies.status,
      createdAt: companies.createdAt,
      updatedAt: companies.updatedAt,
      ownerId: companies.ownerId,
      ownerName: users.name,
      ownerEmail: users.email,
    })
    .from(companies)
    .leftJoin(users, eq(companies.ownerId as any, users.id as any))
    .where(whereClause as any)
    .orderBy(desc(companies.createdAt))
    .limit(limit)
    .offset(offset);

  return c.json({ companies: companyList, total: totalResult?.count ?? 0 });
});

// Company stats
admin.get('/companies/stats', async (c) => {
  const denied = await requireAdmin(c);
  if (denied) return denied;

  const [total] = await db.select({ count: sql<number>`count(*)` }).from(companies);
  const [active] = await db.select({ count: sql<number>`count(*)` }).from(companies).where(eq(companies.status as any, 'active'));
  const [paused] = await db.select({ count: sql<number>`count(*)` }).from(companies).where(eq(companies.status as any, 'paused'));
  const [archived] = await db.select({ count: sql<number>`count(*)` }).from(companies).where(eq(companies.status as any, 'archived'));

  return c.json({
    total: total?.count ?? 0,
    active: active?.count ?? 0,
    paused: paused?.count ?? 0,
    archived: archived?.count ?? 0,
  });
});

// Update company status
admin.patch('/companies/:id/status', async (c) => {
  const denied = await requireAdmin(c);
  if (denied) return denied;

  const id = c.req.param('id');
  const body = await c.req.json();
  const { status } = body;

  if (!status || !['active', 'paused', 'archived'].includes(status)) {
    return c.json({ error: 'Invalid status. Must be "active", "paused", or "archived"' }, 400);
  }

  const [updated] = await db
    .update(companies)
    .set({ status, updatedAt: new Date() } as any)
    .where(eq(companies.id as any, id))
    .returning();

  if (!updated) {
    return c.json({ error: 'Company not found' }, 404);
  }

  return c.json({ data: updated });
});

export default admin;
