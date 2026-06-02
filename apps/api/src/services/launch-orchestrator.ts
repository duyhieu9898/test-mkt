/**
 * Block 8 — Campaign Launch Orchestrator.
 *
 * Given a keyword + a set of publish targets, this runs end-to-end:
 *   1. Generate the blog post (BlogGenerator)
 *   2. Generate hero + in-content images (blog-image-variations)
 *   3. Persist the blog row
 *   4. Embed for vector RAG (Block 3 hook)
 *   5. If targets.wordpress: upload hero image + publish post as draft
 *   6. If targets.facebook / linkedin: queue social post drafts
 *   7. Seed a GEO tracking prompt for the keyword (Block 1 hook)
 *
 * Each step is recorded on the campaign_launches row's `steps[]` so
 * the UI can render progress in real time and re-run failed steps.
 *
 * Runs synchronously inside the request handler for the MVP — we
 * accept that the founder waits 30-60s on the launch button. A queue
 * move comes in v2 (when we wire Redis Streams for Block 5).
 */
import { eq, and } from 'drizzle-orm';
import { db } from '../lib/db';
import {
  campaignLaunches,
  blogPosts,
  companies,
  socialPosts,
  geoPrompts,
  type LaunchStep,
  type LaunchOverallStatus,
} from '@1person/core/db';
import { BlogGenerator } from './blog-generator';
import { generateBlogImages, readGeneratedImage } from './blog-image-variations';
import { CMSIntegration } from './cms-integration';
import { embedBlogPost } from './embedding-service';
import { decryptMaybe } from '../lib/crypto';

export interface LaunchTargets {
  wordpress: boolean;
  facebook: boolean;
  linkedin: boolean;
  instagram: boolean;
}

export interface StartLaunchArgs {
  companyId: string;
  keyword: string;
  brief?: string;
  targets: LaunchTargets;
  /** Who triggered this — defaults to manual one-click. */
  source?: 'manual' | 'autopilot';
}

const ALL_STEP_KEYS = [
  'blog',
  'images',
  'embed',
  'wordpress',
  'social_fb',
  'social_li',
  'social_ig',
  'geo_seed',
] as const;

type StepKey = (typeof ALL_STEP_KEYS)[number];

function initSteps(targets: LaunchTargets): LaunchStep[] {
  const wanted: Array<{ key: StepKey; label: string }> = [
    { key: 'blog', label: 'Generate blog post' },
    { key: 'images', label: 'Generate hero + in-content images' },
    { key: 'embed', label: 'Index for AI memory' },
  ];
  if (targets.wordpress) wanted.push({ key: 'wordpress', label: 'Publish draft to WordPress' });
  if (targets.facebook) wanted.push({ key: 'social_fb', label: 'Draft Facebook post' });
  if (targets.linkedin) wanted.push({ key: 'social_li', label: 'Draft LinkedIn post' });
  if (targets.instagram) wanted.push({ key: 'social_ig', label: 'Draft Instagram post' });
  wanted.push({ key: 'geo_seed', label: 'Track keyword in AI search (GEO)' });
  return wanted.map((w) => ({ key: w.key, label: w.label, status: 'pending' }));
}

/* ─── Step persistence helpers ──────────────────────────────────── */

async function patchStep(
  launchId: string,
  key: string,
  patch: Partial<LaunchStep>,
): Promise<void> {
  const row = await db.query.campaignLaunches.findFirst({
    where: eq(campaignLaunches.id, launchId),
  });
  if (!row) return;
  const steps = (row.steps ?? []).map((s) => (s.key === key ? { ...s, ...patch } : s));
  await db
    .update(campaignLaunches)
    .set({ steps, updatedAt: new Date() })
    .where(eq(campaignLaunches.id, launchId));
}

async function patchLaunch(launchId: string, patch: Partial<typeof campaignLaunches.$inferInsert>): Promise<void> {
  await db
    .update(campaignLaunches)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(campaignLaunches.id, launchId));
}

async function markStart(launchId: string, key: string) {
  await patchStep(launchId, key, { status: 'running', startedAt: new Date().toISOString() });
}
async function markDone(launchId: string, key: string, result?: Record<string, unknown>, message?: string) {
  await patchStep(launchId, key, {
    status: 'done',
    finishedAt: new Date().toISOString(),
    result,
    message,
  });
}
async function markError(launchId: string, key: string, error: string) {
  await patchStep(launchId, key, { status: 'error', finishedAt: new Date().toISOString(), error });
}
async function markSkip(launchId: string, key: string, message: string) {
  await patchStep(launchId, key, { status: 'skipped', finishedAt: new Date().toISOString(), message });
}

/* ─── Public entry ──────────────────────────────────────────────── */

export async function startLaunch(args: StartLaunchArgs): Promise<{ launchId: string }> {
  const [row] = await db
    .insert(campaignLaunches)
    .values({
      companyId: args.companyId,
      keyword: args.keyword,
      brief: args.brief ?? null,
      targets: args.targets,
      source: args.source ?? 'manual',
      status: 'queued',
      steps: initSteps(args.targets),
    })
    .returning();
  if (!row) throw new Error('Failed to create launch');

  // Fire-and-forget — the caller can poll the row to render progress.
  runLaunch(row.id).catch((e) => {
    console.error('[launch] fatal error in runLaunch:', e);
    void patchLaunch(row.id, { status: 'failed' });
  });

  return { launchId: row.id };
}

/* ─── Internal runner ───────────────────────────────────────────── */

async function runLaunch(launchId: string): Promise<void> {
  const launch = await db.query.campaignLaunches.findFirst({
    where: eq(campaignLaunches.id, launchId),
  });
  if (!launch) return;
  await patchLaunch(launchId, { status: 'running' });

  // 1. Blog
  await markStart(launchId, 'blog');
  let blog: Awaited<ReturnType<BlogGenerator['generateBlogPost']>>;
  try {
    const gen = new BlogGenerator();
    blog = await gen.generateBlogPost(launch.companyId, {
      keyword: launch.keyword,
      searchIntent: 'informational',
      language: 'en',
      targetWordCount: 1800,
    });
  } catch (e) {
    await markError(launchId, 'blog', (e as Error).message);
    await patchLaunch(launchId, { status: 'failed' });
    return;
  }
  // Persist blog row
  const [savedBlog] = await db
    .insert(blogPosts)
    .values({
      companyId: launch.companyId,
      title: blog.title,
      slug: blog.slug,
      metaDescription: blog.metaDescription,
      content: blog.content,
      excerpt: blog.excerpt,
      keyword: launch.keyword,
      searchIntent: 'informational',
      tags: blog.tags,
      faq: blog.faq,
      schemaMarkup: blog.schemaMarkup,
      wordCount: blog.wordCount,
      language: 'en',
      status: 'draft',
    })
    .returning();
  if (!savedBlog) {
    await markError(launchId, 'blog', 'Failed to persist blog row');
    await patchLaunch(launchId, { status: 'failed' });
    return;
  }
  await patchLaunch(launchId, { blogPostId: savedBlog.id });
  await markDone(launchId, 'blog', {
    blogPostId: savedBlog.id,
    title: savedBlog.title,
    wordCount: savedBlog.wordCount,
  });

  // 2. Images
  await markStart(launchId, 'images');
  let imageBundle: Awaited<ReturnType<typeof generateBlogImages>> = { hero: null, inContent: [] };
  try {
    imageBundle = await generateBlogImages({
      companyId: launch.companyId,
      title: savedBlog.title,
      keyword: launch.keyword,
      withHero: true,
      inContentCount: 2,
    });
    await patchLaunch(launchId, { heroImageUrl: imageBundle.hero?.url ?? null });
    await markDone(launchId, 'images', {
      heroUrl: imageBundle.hero?.url ?? null,
      inContentUrls: imageBundle.inContent.map((i) => i.url),
      count: (imageBundle.hero ? 1 : 0) + imageBundle.inContent.length,
    });
  } catch (e) {
    await markError(launchId, 'images', (e as Error).message);
    // Continue — images are non-blocking
  }

  // 3. Embed for vector RAG
  await markStart(launchId, 'embed');
  try {
    await embedBlogPost({
      companyId: launch.companyId,
      postId: savedBlog.id,
      title: savedBlog.title,
      body: savedBlog.content,
    });
    await markDone(launchId, 'embed', { sourceType: 'blog_post' });
  } catch (e) {
    await markError(launchId, 'embed', (e as Error).message);
  }

  // 4. WordPress publish (draft)
  if (launch.targets.wordpress) {
    await markStart(launchId, 'wordpress');
    try {
      const company = await db.query.companies.findFirst({
        where: eq(companies.id, launch.companyId),
      });
      const wp = (company?.settings as any)?.wordpress as
        | { siteUrl?: string; username?: string; appPassword?: string }
        | undefined;
      if (!wp?.siteUrl || !wp?.username || !wp?.appPassword) {
        await markSkip(launchId, 'wordpress', 'No WordPress credentials configured for this company');
      } else {
        const wpPassword = decryptMaybe(wp.appPassword);
        const cms = new CMSIntegration();
        let featuredMediaId: number | undefined;
        if (imageBundle.hero?.url) {
          const bytes = await readGeneratedImage(imageBundle.hero.url);
          if (bytes) {
            try {
              const m = await cms.uploadMedia(
                wp.siteUrl,
                wp.username,
                wpPassword,
                bytes,
                `${savedBlog.slug}-hero.png`,
                'image/png',
                savedBlog.title,
              );
              featuredMediaId = m.id;
            } catch (e) {
              console.warn('[launch] WP media upload failed:', (e as Error).message);
            }
          }
        }
        const wpResult = await cms.publishPost(wp.siteUrl, wp.username, wpPassword, {
          title: savedBlog.title,
          content: savedBlog.content,
          excerpt: savedBlog.excerpt ?? undefined,
          status: 'draft',
          tags: (savedBlog.tags as string[]) ?? undefined,
          featuredMediaId,
        });
        await db
          .update(blogPosts)
          .set({
            status: 'pushed_to_cms',
            cmsPostId: wpResult.id,
            cmsPostUrl: wpResult.url,
            updatedAt: new Date(),
          })
          .where(eq(blogPosts.id, savedBlog.id));
        await markDone(launchId, 'wordpress', {
          wpPostId: wpResult.id,
          wpUrl: wpResult.url,
          featuredMediaId: featuredMediaId ?? null,
        });
      }
    } catch (e) {
      await markError(launchId, 'wordpress', (e as Error).message);
    }
  }

  // 5. Social drafts (each platform = one row in social_posts table)
  const buildSocialDraft = (platform: 'facebook' | 'linkedin' | 'instagram') => {
    const teaser = blog.excerpt ?? blog.metaDescription ?? blog.title;
    const cta = imageBundle.hero?.url ? `\n\nRead more: [link to your blog post]` : '';
    return `${platform === 'linkedin' ? `**${blog.title}**\n\n` : ''}${teaser}${cta}\n\n#${(launch.keyword || '').replace(/\s+/g, '')} #B2B`;
  };

  const socialMap: Array<{ key: string; platform: 'facebook' | 'linkedin' | 'instagram'; enabled: boolean }> = [
    { key: 'social_fb', platform: 'facebook', enabled: launch.targets.facebook },
    { key: 'social_li', platform: 'linkedin', enabled: launch.targets.linkedin },
    { key: 'social_ig', platform: 'instagram', enabled: launch.targets.instagram },
  ];
  for (const s of socialMap) {
    if (!s.enabled) continue;
    await markStart(launchId, s.key);
    try {
      const draftText = buildSocialDraft(s.platform);
      const [inserted] = await db
        .insert(socialPosts)
        .values({
          companyId: launch.companyId,
          platform: s.platform,
          content: draftText,
          mediaUrls: imageBundle.hero?.url ? [imageBundle.hero.url] : [],
          status: 'draft',
        })
        .returning();
      await markDone(launchId, s.key, { socialPostId: inserted?.id, platform: s.platform, draft: draftText });
    } catch (e) {
      await markError(launchId, s.key, (e as Error).message);
    }
  }

  // 6. Seed GEO tracking prompt for the keyword
  await markStart(launchId, 'geo_seed');
  try {
    // Skip duplicates — same prompt text per company
    const promptText = `What are the best ${launch.keyword}? Recommend specific companies.`;
    const existing = await db.query.geoPrompts.findFirst({
      where: and(
        eq(geoPrompts.companyId, launch.companyId),
        eq(geoPrompts.promptText, promptText),
      ),
    });
    if (existing) {
      await markSkip(launchId, 'geo_seed', 'Prompt already tracked');
    } else {
      const [g] = await db
        .insert(geoPrompts)
        .values({ companyId: launch.companyId, promptText, active: true })
        .returning();
      await markDone(launchId, 'geo_seed', { geoPromptId: g?.id, promptText });
    }
  } catch (e) {
    await markError(launchId, 'geo_seed', (e as Error).message);
  }

  // Final status
  const finalRow = await db.query.campaignLaunches.findFirst({
    where: eq(campaignLaunches.id, launchId),
  });
  const steps = finalRow?.steps ?? [];
  const anyError = steps.some((s) => s.status === 'error');
  const allDoneOrSkipped = steps.every((s) => s.status === 'done' || s.status === 'skipped');
  const finalStatus: LaunchOverallStatus = allDoneOrSkipped ? 'completed' : anyError ? 'partial' : 'completed';
  await patchLaunch(launchId, { status: finalStatus });
}

export async function getLaunch(companyId: string, launchId: string) {
  return db.query.campaignLaunches.findFirst({
    where: and(eq(campaignLaunches.id, launchId), eq(campaignLaunches.companyId, companyId)),
  });
}

export async function listLaunches(companyId: string, limit = 20) {
  return db
    .select()
    .from(campaignLaunches)
    .where(eq(campaignLaunches.companyId, companyId))
    .orderBy(campaignLaunches.createdAt)
    .limit(limit);
}
