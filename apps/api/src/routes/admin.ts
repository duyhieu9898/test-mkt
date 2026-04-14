import { Hono } from 'hono';
import { eq, desc, sql, and, or, like, gte } from 'drizzle-orm';
import { db } from '../lib/db';
import { users, sessions, siteConfig } from '@1person/core/db';
import { companies } from '@1person/core/db';
import { blogPosts, campaigns } from '@1person/core/db';
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

// ============================================
// 5. Founder Metrics (P0-D4)
// ============================================
// Single-pane-of-glass metrics dashboard for the founder. Each block is wrapped
// in its own try/catch so a single failing query does NOT break the response.

async function safeCount(fn: () => Promise<any>): Promise<number> {
  try {
    const r = await fn();
    return Number(r?.count ?? r?.[0]?.count ?? 0) || 0;
  } catch {
    return 0;
  }
}

admin.get('/metrics/overview', async (c) => {
  const denied = await requireAdmin(c);
  if (denied) return denied;

  const now = new Date();
  const d7 = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const d1 = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const m5 = new Date(now.getTime() - 5 * 60 * 1000);

  // --- Users ---
  const usersTotal = await safeCount(async () => {
    const [r] = await db.select({ count: sql<number>`count(*)` }).from(users);
    return r;
  });
  const usersNew7d = await safeCount(async () => {
    const [r] = await db.select({ count: sql<number>`count(*)` }).from(users).where(gte(users.createdAt as any, d7));
    return r;
  });
  const usersNew24h = await safeCount(async () => {
    const [r] = await db.select({ count: sql<number>`count(*)` }).from(users).where(gte(users.createdAt as any, d1));
    return r;
  });
  let usersActiveNow = 0;
  try {
    const r: any = await db.execute(sql`
      SELECT COUNT(DISTINCT t.external_id)::int AS count
      FROM trustai_query_history q
      JOIN trustai_tenants t ON t.id = q.tenant_id
      WHERE q.created_at > ${m5.toISOString()}
    `);
    usersActiveNow = Number(r?.rows?.[0]?.count ?? r?.[0]?.count ?? 0) || 0;
  } catch {
    usersActiveNow = 0;
  }

  // --- Companies ---
  const companiesTotal = await safeCount(async () => {
    const [r] = await db.select({ count: sql<number>`count(*)` }).from(companies);
    return r;
  });
  // "Onboarded fully" = no longer in 'setup' state
  const companiesOnboarded = await safeCount(async () => {
    const [r] = await db
      .select({ count: sql<number>`count(*)` })
      .from(companies)
      .where(sql`${companies.status} <> 'setup'`);
    return r;
  });

  // --- Campaigns ---
  const campaignsTotal = await safeCount(async () => {
    const [r] = await db.select({ count: sql<number>`count(*)` }).from(campaigns);
    return r;
  });
  const campaignsGenerated7d = await safeCount(async () => {
    const [r] = await db
      .select({ count: sql<number>`count(*)` })
      .from(campaigns)
      .where(gte(campaigns.createdAt as any, d7));
    return r;
  });
  const campaignsLaunched7d = await safeCount(async () => {
    const [r] = await db
      .select({ count: sql<number>`count(*)` })
      .from(campaigns)
      .where(and(
        gte(campaigns.createdAt as any, d7),
        sql`${campaigns.status} IN ('launching','live')`,
      ));
    return r;
  });
  const campaignsFailed7d = await safeCount(async () => {
    const [r] = await db
      .select({ count: sql<number>`count(*)` })
      .from(campaigns)
      .where(and(
        gte(campaigns.createdAt as any, d7),
        eq(campaigns.status as any, 'failed'),
      ));
    return r;
  });
  const campaignsLive = await safeCount(async () => {
    const [r] = await db
      .select({ count: sql<number>`count(*)` })
      .from(campaigns)
      .where(eq(campaigns.status as any, 'live'));
    return r;
  });

  // --- LLM (from trustai_query_history via raw SQL) ---
  let traceCount7d = 0;
  let estimatedCostUsd7d = 0;
  let avgLatencyMs = 0;
  try {
    const r: any = await db.execute(sql`
      SELECT
        COUNT(*)::int AS trace_count,
        COALESCE(SUM(COALESCE(prompt_tokens,0) + COALESCE(completion_tokens,0)),0)::bigint AS total_tokens,
        COALESCE(AVG(inference_time_ms),0)::float AS avg_latency
      FROM trustai_query_history
      WHERE created_at > ${d7.toISOString()}
    `);
    const row: any = r?.rows?.[0] ?? r?.[0] ?? {};
    traceCount7d = Number(row.trace_count ?? 0) || 0;
    const totalTokens = Number(row.total_tokens ?? 0) || 0;
    // Rough gpt-4o-mini blended rate ~ $0.000005 per token
    estimatedCostUsd7d = Math.round(totalTokens * 0.000005 * 100) / 100;
    avgLatencyMs = Math.round(Number(row.avg_latency ?? 0) || 0);
  } catch {
    // table may not exist yet — leave zeros
  }

  // --- Errors ---
  // TODO: wire to Sentry when P0-E Sentry agent lands. For MVP try the
  // trustai_audit_log error actions, fall back to 0 on any failure.
  let errorsCount24h = 0;
  let errorsCount7d = 0;
  try {
    const r: any = await db.execute(sql`
      SELECT
        COUNT(*) FILTER (WHERE timestamp > ${d1.toISOString()})::int AS c24,
        COUNT(*) FILTER (WHERE timestamp > ${d7.toISOString()})::int AS c7
      FROM trustai_audit_log
      WHERE action LIKE '%error%' OR action LIKE '%fail%'
    `);
    const row: any = r?.rows?.[0] ?? r?.[0] ?? {};
    errorsCount24h = Number(row.c24 ?? 0) || 0;
    errorsCount7d = Number(row.c7 ?? 0) || 0;
  } catch {
    // leave zeros
  }

  // --- Health ---
  // Postgres is up (we got here). Langfuse ping with 2s timeout.
  let langfuseUp = false;
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 2000);
    const resp = await fetch('http://localhost:5050/api/public/health', { signal: ctrl.signal });
    clearTimeout(t);
    langfuseUp = resp.ok;
  } catch {
    langfuseUp = false;
  }

  return c.json({
    users: {
      total: usersTotal,
      new7d: usersNew7d,
      new24h: usersNew24h,
      activeNow: usersActiveNow,
    },
    companies: {
      total: companiesTotal,
      onboardedFully: companiesOnboarded,
    },
    campaigns: {
      total: campaignsTotal,
      generated7d: campaignsGenerated7d,
      launched7d: campaignsLaunched7d,
      failed7d: campaignsFailed7d,
      live: campaignsLive,
    },
    llm: {
      traceCount7d,
      estimatedCostUsd7d,
      avgLatencyMs,
    },
    errors: {
      count24h: errorsCount24h,
      count7d: errorsCount7d,
    },
    health: {
      apiUptime: '100%',
      postgresUp: true,
      langfuseUp,
    },
  });
});

export default admin;
