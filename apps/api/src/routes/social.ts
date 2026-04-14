/**
 * Social Media Management — CRUD + AI-draft for scheduled posts.
 * Platform publish stubbed behind SOCIAL_PUBLISH_ENABLED flag.
 */
import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { sql } from 'drizzle-orm';
import { db } from '../lib/db';
import { authMiddleware } from '../middleware/auth';
import { llmGenerate } from '../lib/llm';
import { buildBusinessContext } from '../services/business-context';

const socialRouter = new Hono();
socialRouter.use('*', authMiddleware);
const PUBLISH_ENABLED = process.env.SOCIAL_PUBLISH_ENABLED === 'true';
const platformEnum = z.enum(['facebook', 'instagram', 'linkedin']);

socialRouter.get('/:companyId/posts', async (c) => {
  const rows: any = await db.execute(sql`
    SELECT * FROM social_posts_scheduled WHERE company_id = ${c.req.param('companyId')}
    ORDER BY COALESCE(scheduled_at, created_at) DESC LIMIT 100`);
  return c.json({ posts: rows.rows ?? rows });
});

socialRouter.post('/:companyId/posts', zValidator('json', z.object({
  content: z.string().min(1).max(5000), platforms: z.array(platformEnum).min(1),
  mediaUrls: z.array(z.string()).optional().default([]), scheduledAt: z.string().optional(),
})), async (c) => {
  const companyId = c.req.param('companyId');
  const b = c.req.valid('json');
  const status = b.scheduledAt ? 'scheduled' : 'draft';
  const rows: any = await db.execute(sql`
    INSERT INTO social_posts_scheduled (company_id, content, platforms, media_urls, scheduled_at, status)
    VALUES (${companyId}, ${b.content}, ${JSON.stringify(b.platforms)}::jsonb,
            ${JSON.stringify(b.mediaUrls)}::jsonb,
            ${b.scheduledAt ? sql`${b.scheduledAt}::timestamp` : sql`NULL`}, ${status})
    RETURNING *`);
  return c.json({ post: (rows.rows ?? rows)[0] }, 201);
});

socialRouter.patch('/:companyId/posts/:id', zValidator('json', z.object({
  content: z.string().min(1).max(5000).optional(), platforms: z.array(platformEnum).optional(),
  mediaUrls: z.array(z.string()).optional(), scheduledAt: z.string().nullable().optional(),
})), async (c) => {
  const { companyId, id } = c.req.param() as { companyId: string; id: string };
  const b = c.req.valid('json');
  const rows: any = await db.execute(sql`
    UPDATE social_posts_scheduled SET
      content = COALESCE(${b.content ?? null}, content),
      platforms = COALESCE(${b.platforms ? JSON.stringify(b.platforms) : null}::jsonb, platforms),
      media_urls = COALESCE(${b.mediaUrls ? JSON.stringify(b.mediaUrls) : null}::jsonb, media_urls),
      scheduled_at = ${b.scheduledAt === null ? sql`NULL` : b.scheduledAt ? sql`${b.scheduledAt}::timestamp` : sql`scheduled_at`},
      status = CASE WHEN ${b.scheduledAt ?? null} IS NOT NULL THEN 'scheduled' ELSE status END,
      updated_at = now()
    WHERE id = ${id} AND company_id = ${companyId} RETURNING *`);
  const post = (rows.rows ?? rows)[0];
  return post ? c.json({ post }) : c.json({ error: 'Post not found' }, 404);
});

socialRouter.delete('/:companyId/posts/:id', async (c) => {
  const { companyId, id } = c.req.param() as { companyId: string; id: string };
  await db.execute(sql`DELETE FROM social_posts_scheduled WHERE id = ${id} AND company_id = ${companyId}`);
  return c.json({ ok: true });
});

socialRouter.post('/:companyId/posts/:id/schedule', zValidator('json', z.object({
  scheduledAt: z.string(),
})), async (c) => {
  const { companyId, id } = c.req.param() as { companyId: string; id: string };
  const rows: any = await db.execute(sql`
    UPDATE social_posts_scheduled SET scheduled_at = ${c.req.valid('json').scheduledAt}::timestamp,
      status = 'scheduled', updated_at = now()
    WHERE id = ${id} AND company_id = ${companyId} RETURNING *`);
  const post = (rows.rows ?? rows)[0];
  return post ? c.json({ post }) : c.json({ error: 'Post not found' }, 404);
});

socialRouter.post('/:companyId/posts/:id/publish-now', async (c) => {
  const { companyId, id } = c.req.param() as { companyId: string; id: string };
  if (PUBLISH_ENABLED) console.log(`[social] Would publish post ${id} to platform APIs`);
  const rows: any = await db.execute(sql`
    UPDATE social_posts_scheduled SET status = 'published', published_at = now(), updated_at = now()
    WHERE id = ${id} AND company_id = ${companyId} RETURNING *`);
  const post = (rows.rows ?? rows)[0];
  if (!post) return c.json({ error: 'Post not found' }, 404);
  if (!PUBLISH_ENABLED) console.log(`[social] Stub-published ${id} to ${JSON.stringify(post.platforms)}`);
  return c.json({ post });
});

socialRouter.post('/:companyId/posts/ai-draft', zValidator('json', z.object({
  topic: z.string().optional(), platforms: z.array(platformEnum).min(1),
})), async (c) => {
  const companyId = c.req.param('companyId');
  const { topic, platforms } = c.req.valid('json');
  const ctx = await buildBusinessContext(companyId);
  const result = await llmGenerate([
    { role: 'system', content: `You are a social media manager. Write a single engaging post for: ${platforms.join(', ')}.\n\nBusiness context:\n${ctx.fullContext}` },
    { role: 'user', content: `${topic ? `Topic: ${topic}` : 'Topic: latest news or promotion from the business'}\n\nWrite a compelling social media post with hashtags. Return ONLY the post text.` },
  ], { featureKey: 'campaign_social_post', maxTokens: 600 });
  return c.json({ draft: result.text, model: result.model, platforms });
});

export default socialRouter;
