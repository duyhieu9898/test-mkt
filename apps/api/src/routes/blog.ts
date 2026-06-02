import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { eq, desc, and } from 'drizzle-orm';
import { db } from '../lib/db';
import { blogPosts, landingPages, landingPageBlogPosts } from '@1person/core/db';
import { authMiddleware } from '../middleware/auth';
import { HTTPException } from 'hono/http-exception';
import { nanoid } from 'nanoid';

const blog = new Hono();

// ============================================
// PUBLIC: Blog endpoints (no auth required)
// ============================================

// List published blog posts
blog.get('/posts', async (c) => {
  const lang = c.req.query('lang');

  const conditions = [eq(blogPosts.status, 'published')];
  if (lang) {
    conditions.push(eq(blogPosts.language, lang));
  }

  const posts = await db.query.blogPosts.findMany({
    where: conditions.length === 1 ? conditions[0] : and(...conditions),
    orderBy: [desc(blogPosts.createdAt)],
    columns: {
      id: true,
      title: true,
      slug: true,
      excerpt: true,
      metaDescription: true,
      keyword: true,
      tags: true,
      language: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  return c.json({ posts });
});

// Get single published post by slug
blog.get('/posts/:slug', async (c) => {
  const slug = c.req.param('slug');

  const post = await db.query.blogPosts.findFirst({
    where: and(eq(blogPosts.slug, slug), eq(blogPosts.status, 'published')),
  });

  if (!post) {
    return c.json({ error: 'Post not found' }, 404);
  }

  return c.json({ post });
});

// ============================================
// ADMIN: Blog management (auth required)
// ============================================

// List all posts (including drafts)
blog.get('/admin/posts', authMiddleware, async (c) => {
  const posts = await db.query.blogPosts.findMany({
    orderBy: [desc(blogPosts.updatedAt)],
    columns: {
      id: true,
      title: true,
      slug: true,
      status: true,
      language: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  return c.json({ posts });
});

// Get single post (admin)
blog.get('/admin/posts/:id', authMiddleware, async (c) => {
  const id = c.req.param('id');
  const post = await db.query.blogPosts.findFirst({
    where: eq(blogPosts.id as any, id),
  });

  if (!post) {
    return c.json({ error: 'Post not found' }, 404);
  }

  return c.json({ post });
});

// Create post
const createPostSchema = z.object({
  title: z.string().min(1),
  slug: z.string().min(1),
  content: z.string().min(1),
  excerpt: z.string().optional(),
  metaDescription: z.string().optional(),
  keyword: z.string().optional(),
  tags: z.array(z.string()).optional(),
  language: z.string().default('en'),
  status: z.string().default('draft'),
});

blog.post('/admin/posts', authMiddleware, zValidator('json', createPostSchema), async (c) => {
  const data = c.req.valid('json');

  // Use a default companyId for admin blog posts (system-level)
  const [post] = await db
    .insert(blogPosts)
    .values({
      companyId: '00000000-0000-0000-0000-000000000000',
      title: data.title,
      slug: data.slug,
      content: data.content,
      excerpt: data.excerpt || null,
      metaDescription: data.metaDescription || null,
      keyword: data.keyword || null,
      tags: data.tags || [],
      language: data.language,
      status: data.status,
      wordCount: data.content.split(/\s+/).length,
    })
    .returning();

  return c.json({ post }, 201);
});

// Update post
blog.patch('/admin/posts/:id', authMiddleware, async (c) => {
  const id = c.req.param('id');
  const data = await c.req.json();

  const updateData: Record<string, any> = { updatedAt: new Date() };
  if (data.title !== undefined) updateData.title = data.title;
  if (data.slug !== undefined) updateData.slug = data.slug;
  if (data.content !== undefined) {
    updateData.content = data.content;
    updateData.wordCount = data.content.split(/\s+/).length;
  }
  if (data.excerpt !== undefined) updateData.excerpt = data.excerpt;
  if (data.metaDescription !== undefined) updateData.metaDescription = data.metaDescription;
  if (data.keyword !== undefined) updateData.keyword = data.keyword;
  if (data.tags !== undefined) updateData.tags = data.tags;
  if (data.language !== undefined) updateData.language = data.language;
  if (data.status !== undefined) updateData.status = data.status;

  const [updated] = await db
    .update(blogPosts)
    .set(updateData)
    .where(eq(blogPosts.id as any, id))
    .returning();

  if (!updated) {
    return c.json({ error: 'Post not found' }, 404);
  }

  return c.json({ post: updated });
});

// Delete post
blog.delete('/admin/posts/:id', authMiddleware, async (c) => {
  const id = c.req.param('id');

  const [deleted] = await db
    .delete(blogPosts)
    .where(eq(blogPosts.id as any, id))
    .returning();

  if (!deleted) {
    return c.json({ error: 'Post not found' }, 404);
  }

  return c.json({ success: true });
});

// LANDING PAGE BLOG (doc 10 §L4)
const B = landingPageBlogPosts;
const slugRe = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const postInput = z.object({
  slug: z.string().min(3).max(200).regex(slugRe, 'lowercase alphanumeric + dashes'),
  title: z.string().min(1).max(300),
  excerpt: z.string().max(2000).optional().nullable(),
  content: z.string().optional().nullable(),
  coverImageUrl: z.string().max(1000).optional().nullable(),
  seo: z.object({ metaTitle: z.string().max(300).optional(), metaDescription: z.string().max(500).optional(), keywords: z.array(z.string()).max(30).optional() }).optional().nullable(),
});

async function ownPage(pid: string, uid: string) {
  const p = await db.query.landingPages.findFirst({ where: eq(landingPages.id, pid), with: { company: true } });
  if (!p) throw new HTTPException(404, { message: 'Landing page not found' });
  if (p.company.ownerId !== uid) throw new HTTPException(403, { message: 'Access denied' });
  return p;
}
async function pubPage(sub: string) {
  const p = await db.query.landingPages.findFirst({ where: and(eq(landingPages.subdomain, sub), eq(landingPages.publishApprovalStatus, 'approved')) });
  if (!p) return null;
  return p;
}

blog.get('/public/:sub', async (c) => {
  const p = await pubPage(c.req.param('sub'));
  if (!p) return c.json({ error: 'Not found' }, 404);
  const posts = await db.select({ id: B.id, slug: B.slug, title: B.title, excerpt: B.excerpt, coverImageUrl: B.coverImageUrl, publishedAt: B.publishedAt })
    .from(B).where(and(eq(B.landingPageId, p.id), eq(B.status, 'published'))).orderBy(desc(B.publishedAt));
  return c.json({ page: { id: p.id, name: p.name, subdomain: p.subdomain }, posts });
});

blog.get('/public/:sub/:slug', async (c) => {
  const p = await pubPage(c.req.param('sub'));
  if (!p) return c.json({ error: 'Not found' }, 404);
  const [post] = await db.select().from(B).where(and(eq(B.landingPageId, p.id), eq(B.slug, c.req.param('slug')), eq(B.status, 'published'))).limit(1);
  if (!post) return c.json({ error: 'Not found' }, 404);
  return c.json({ page: { id: p.id, name: p.name, subdomain: p.subdomain }, post });
});

blog.get('/:pid/posts', authMiddleware, async (c) => {
  const pid = c.req.param('pid') as string; await ownPage(pid, c.get('user').userId);
  const posts = await db.select().from(B).where(eq(B.landingPageId, pid)).orderBy(desc(B.updatedAt));
  return c.json({ posts });
});

blog.post('/:pid/posts', authMiddleware, zValidator('json', postInput), async (c) => {
  const pid = c.req.param('pid') as string; const pg = await ownPage(pid, c.get('user').userId); const d = c.req.valid('json');
  const [dup] = await db.select().from(B).where(and(eq(B.landingPageId, pid), eq(B.slug, d.slug))).limit(1);
  if (dup) throw new HTTPException(409, { message: 'Slug already exists' });
  const [post] = await db.insert(B).values({ landingPageId: pid, companyId: pg.companyId, slug: d.slug, title: d.title, excerpt: d.excerpt || null, content: d.content || null, coverImageUrl: d.coverImageUrl || null, seo: d.seo || null, status: 'draft' }).returning();
  return c.json({ post }, 201);
});

blog.get('/:pid/posts/:id', authMiddleware, async (c) => {
  const pid = c.req.param('pid') as string; await ownPage(pid, c.get('user').userId);
  const [post] = await db.select().from(B).where(and(eq(B.id, c.req.param('id') as string), eq(B.landingPageId, pid))).limit(1);
  if (!post) return c.json({ error: 'Not found' }, 404);
  return c.json({ post });
});

blog.patch('/:pid/posts/:id', authMiddleware, zValidator('json', postInput.partial()), async (c) => {
  const pid = c.req.param('pid') as string; const id = c.req.param('id') as string; await ownPage(pid, c.get('user').userId); const d = c.req.valid('json');
  if (d.slug) { const [cl] = await db.select().from(B).where(and(eq(B.landingPageId, pid), eq(B.slug, d.slug))).limit(1); if (cl && cl.id !== id) throw new HTTPException(409, { message: 'Slug exists' }); }
  const u: Record<string, any> = { updatedAt: new Date() };
  for (const k of ['slug','title','excerpt','content','coverImageUrl','seo'] as const) if (d[k] !== undefined) u[k] = d[k];
  const [post] = await db.update(B).set(u).where(and(eq(B.id, id), eq(B.landingPageId, pid))).returning();
  if (!post) return c.json({ error: 'Not found' }, 404);
  return c.json({ post });
});

blog.delete('/:pid/posts/:id', authMiddleware, async (c) => {
  const pid = c.req.param('pid') as string; await ownPage(pid, c.get('user').userId);
  await db.delete(B).where(and(eq(B.id, c.req.param('id') as string), eq(B.landingPageId, pid)));
  return c.json({ success: true });
});

blog.post('/:pid/posts/:id/publish', authMiddleware, async (c) => {
  const pid = c.req.param('pid') as string; await ownPage(pid, c.get('user').userId);
  const [post] = await db.update(B).set({ status: 'published', publishedAt: new Date(), updatedAt: new Date() }).where(and(eq(B.id, c.req.param('id') as string), eq(B.landingPageId, pid))).returning();
  if (!post) return c.json({ error: 'Not found' }, 404);
  return c.json({ post });
});

blog.post('/:pid/posts/:id/unpublish', authMiddleware, async (c) => {
  const pid = c.req.param('pid') as string; await ownPage(pid, c.get('user').userId);
  const [post] = await db.update(B).set({ status: 'draft', updatedAt: new Date() }).where(and(eq(B.id, c.req.param('id') as string), eq(B.landingPageId, pid))).returning();
  if (!post) return c.json({ error: 'Not found' }, 404);
  return c.json({ post });
});

export default blog;
