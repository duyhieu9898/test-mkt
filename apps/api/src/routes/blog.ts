import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { eq, desc, and } from 'drizzle-orm';
import { db } from '../lib/db';
import { blogPosts } from '@1person/core/db';
import { authMiddleware } from '../middleware/auth';
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

export default blog;
