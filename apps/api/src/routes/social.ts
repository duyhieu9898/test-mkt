/**
 * Social Media Management — CRUD + AI-draft for scheduled posts.
 * Facebook organic publish is LIVE (T04) when a Page is connected via Channels;
 * Instagram / LinkedIn remain draft-only until their connectors ship.
 */
import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { sql } from 'drizzle-orm';
import { db } from '../lib/db';
import { authMiddleware } from '../middleware/auth';
import { llmGenerate } from '../lib/llm';
import { buildBusinessContext } from '../services/business-context';
import { findActiveFbConnection, publishPagePost } from '../services/channels/fb-messenger';
import { chargeFixedCredits, ensureSufficientCredits } from '../lib/credits';
import { FIXED_CREDIT_COSTS } from '../lib/credit-costs';
import { authorizeCompanyAccess } from '../lib/company-access';

const socialRouter = new Hono();
socialRouter.use('*', authMiddleware);
const platformEnum = z.enum(['facebook', 'instagram', 'linkedin']);

let socialScheduleTableReady = false;

async function ensureSocialScheduleTable() {
  if (socialScheduleTableReady) return;

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS social_posts_scheduled (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      content text NOT NULL,
      platforms jsonb NOT NULL DEFAULT '[]'::jsonb,
      media_urls jsonb NOT NULL DEFAULT '[]'::jsonb,
      scheduled_at timestamp,
      published_at timestamp,
      status varchar(20) NOT NULL DEFAULT 'draft',
      platform_post_ids jsonb NOT NULL DEFAULT '{}'::jsonb,
      metrics jsonb NOT NULL DEFAULT '{}'::jsonb,
      ai_generated boolean NOT NULL DEFAULT false,
      created_at timestamp NOT NULL DEFAULT now(),
      updated_at timestamp NOT NULL DEFAULT now()
    )
  `);

  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS social_posts_scheduled_company_idx
    ON social_posts_scheduled(company_id)
  `);
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS social_posts_scheduled_status_idx
    ON social_posts_scheduled(status)
  `);

  socialScheduleTableReady = true;
}

socialRouter.get('/:companyId/posts', async (c) => {
  await ensureSocialScheduleTable();
  const { userId } = c.get('user');
  const companyId = c.req.param('companyId');
  await authorizeCompanyAccess(userId, companyId, 'campaign.view');

  const rows: any = await db.execute(sql`
    SELECT * FROM social_posts_scheduled WHERE company_id = ${companyId}
    ORDER BY COALESCE(scheduled_at, created_at) DESC LIMIT 100`);
  return c.json({ posts: rows.rows ?? rows });
});

socialRouter.post('/:companyId/posts', zValidator('json', z.object({
  content: z.string().min(1).max(5000), platforms: z.array(platformEnum).min(1),
  mediaUrls: z.array(z.string()).optional().default([]), scheduledAt: z.string().nullable().optional(),
})), async (c) => {
  await ensureSocialScheduleTable();
  const { userId } = c.get('user');
  const companyId = c.req.param('companyId');
  await authorizeCompanyAccess(userId, companyId, 'campaign.edit');

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
  await ensureSocialScheduleTable();
  const { userId } = c.get('user');
  const { companyId, id } = c.req.param() as { companyId: string; id: string };
  await authorizeCompanyAccess(userId, companyId, 'campaign.edit');

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
  await ensureSocialScheduleTable();
  const { userId } = c.get('user');
  const { companyId, id } = c.req.param() as { companyId: string; id: string };
  await authorizeCompanyAccess(userId, companyId, 'campaign.edit');

  await db.execute(sql`DELETE FROM social_posts_scheduled WHERE id = ${id} AND company_id = ${companyId}`);
  return c.json({ ok: true });
});

socialRouter.post('/:companyId/posts/:id/schedule', zValidator('json', z.object({
  scheduledAt: z.string(),
})), async (c) => {
  await ensureSocialScheduleTable();
  const { userId } = c.get('user');
  const { companyId, id } = c.req.param() as { companyId: string; id: string };
  await authorizeCompanyAccess(userId, companyId, 'campaign.launch');

  const rows: any = await db.execute(sql`
    UPDATE social_posts_scheduled SET scheduled_at = ${c.req.valid('json').scheduledAt}::timestamp,
      status = 'scheduled', updated_at = now()
    WHERE id = ${id} AND company_id = ${companyId} RETURNING *`);
  const post = (rows.rows ?? rows)[0];
  return post ? c.json({ post }) : c.json({ error: 'Post not found' }, 404);
});

socialRouter.post('/:companyId/posts/:id/publish-now', async (c) => {
  await ensureSocialScheduleTable();
  const { userId } = c.get('user');
  const { companyId, id } = c.req.param() as { companyId: string; id: string };
  await authorizeCompanyAccess(userId, companyId, 'campaign.publish_social');
  await authorizeCompanyAccess(userId, companyId, 'credits.spend');

  // Load the post first.
  const found: any = await db.execute(sql`
    SELECT * FROM social_posts_scheduled WHERE id = ${id} AND company_id = ${companyId} LIMIT 1`);
  const post = (found.rows ?? found)[0];
  if (!post) return c.json({ error: 'Post not found' }, 404);

  const platforms: string[] = Array.isArray(post.platforms)
    ? post.platforms
    : JSON.parse(post.platforms ?? '[]');
  const link = Array.isArray(post.media_urls) ? undefined : undefined; // media handling = fast-follow
  const facebookPublishCount = platforms.includes('facebook') ? 1 : 0;
  await ensureSufficientCredits(
    companyId,
    facebookPublishCount * FIXED_CREDIT_COSTS.socialPostPublish,
  );

  // Per-platform publish results surfaced back to the founder.
  const results: Array<{ platform: string; ok: boolean; externalId?: string; error?: string }> = [];

  for (const platform of platforms) {
    if (platform === 'facebook') {
      const conn = await findActiveFbConnection(companyId);
      if (!conn) {
        results.push({ platform, ok: false, error: 'No Facebook Page connected — connect one in Channels or Social Distribution.' });
        continue;
      }
      try {
        const { externalId } = await publishPagePost(conn, post.content, link);
        await chargeFixedCredits(companyId, FIXED_CREDIT_COSTS.socialPostPublish, {
          featureKey: 'social_post_publish',
          tier: 'facebook',
          refKind: 'scheduled_social_post',
          refId: id,
          actor: `user:${userId}`,
          note: 'Published scheduled social post to Facebook',
        }).catch((error) => {
          console.error('[social.publish-now] credit charge failed after Facebook publish:', error);
        });
        results.push({ platform, ok: true, externalId });
      } catch (e) {
        results.push({ platform, ok: false, error: (e as Error).message });
      }
    } else {
      // instagram / linkedin connectors not shipped yet.
      results.push({ platform, ok: false, error: `${platform} publishing is not connected yet.` });
    }
  }

  const anyLivePublished = results.some((r) => r.ok);
  // Mark published if anything went live; otherwise keep it as a draft and report why.
  const newStatus = anyLivePublished ? 'published' : post.status;
  const updated: any = await db.execute(sql`
    UPDATE social_posts_scheduled
    SET status = ${newStatus},
        published_at = ${anyLivePublished ? sql`now()` : sql`published_at`},
        updated_at = now()
    WHERE id = ${id} AND company_id = ${companyId} RETURNING *`);

  return c.json({ post: (updated.rows ?? updated)[0], results, published: anyLivePublished });
});

socialRouter.post('/:companyId/posts/ai-draft', zValidator('json', z.object({
  topic: z.string().optional(), platforms: z.array(platformEnum).min(1),
})), async (c) => {
  const { userId } = c.get('user');
  const companyId = c.req.param('companyId');
  await authorizeCompanyAccess(userId, companyId, 'campaign.generate_ai');
  await authorizeCompanyAccess(userId, companyId, 'credits.spend');

  const { topic, platforms } = c.req.valid('json');
  const ctx = await buildBusinessContext(companyId);
  const result = await llmGenerate([
    { role: 'system', content: `You are a social media manager. Write a single engaging post for: ${platforms.join(', ')}.\n\nBusiness context:\n${ctx.fullContext}` },
    { role: 'user', content: `${topic ? `Topic: ${topic}` : 'Topic: latest news or promotion from the business'}\n\nWrite a compelling social media post with hashtags. Return ONLY the post text.` },
  ], { featureKey: 'campaign_social_post', maxTokens: 600 });
  return c.json({ draft: result.text, model: result.model, platforms });
});

export default socialRouter;
