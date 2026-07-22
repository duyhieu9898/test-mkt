/**
 * Block 8 — Campaign Launch Orchestrator.
 *
 * Given a keyword + a set of publish targets, this runs end-to-end:
 *   1. Generate the blog post (BlogGenerator)
 *   2. Generate hero + in-content images (blog-image-variations)
 *   3. Persist the blog row
 *   4. Embed for vector RAG (Block 3 hook)
 *   5. If targets.facebook / linkedin: queue social post drafts
 *   6. Seed a GEO tracking prompt for the keyword (Block 1 hook)
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
  campaigns,
  banners,
  socialPosts,
  geoPrompts,
  assetLibrary,
} from '@1person/core/db';
import { BlogGenerator } from './blog-generator';
import { generateBlogImages, type BlogImageVariation } from './blog-image-variations';
import { embedBlogPost } from './embedding-service';
import { llmGenerate, extractJSON } from '../lib/llm';
import { renderBannerImage } from './imgly-banner-renderer';
import { CAMPAIGN_BANNER_PALETTE } from './campaign-banner-creative';
import {
  applyBrandKitToBannerTheme,
  brandCreativeKitSnapshot,
  buildBrandCreativeKit,
  buildBrandFitSummary,
  renderBrandCreativeKitPrompt,
  type BrandCreativeKit,
} from './brand-creative-kit';
import {
  generateCampaignSocialPosts,
  type SocialPlatform,
} from './campaign-social-generator';
import {
  buildContentLanguageInstruction,
  localizedDefault,
  normalizeContentLanguage,
  resolveCompanyLanguage,
} from '../lib/language';
import { createCampaignVideoProject } from './campaign-video-creative';

export interface LaunchTargets {
  wordpress: boolean;
  facebook: boolean;
  linkedin: boolean;
  instagram: boolean;
  video?: boolean;
  language?: string;
  imageMode?: 'ai' | 'uploaded';
  uploadedAssetIds?: string[];
}

export interface StartLaunchArgs {
  companyId: string;
  keyword: string;
  brief?: string;
  targets: LaunchTargets;
  imageMode?: 'ai' | 'uploaded';
  assetIds?: string[];
  language?: string;
  /** Who triggered this — defaults to manual one-click. */
  source?: 'manual' | 'autopilot';
}

const ALL_STEP_KEYS = [
  'blog',
  'images',
  'embed',
  'social_fb',
  'social_li',
  'social_ig',
  'video',
  'geo_seed',
  'banner_campaign',
  'banners',
] as const;

type StepKey = (typeof ALL_STEP_KEYS)[number];
type LaunchStepStatus = 'pending' | 'running' | 'done' | 'skipped' | 'error';
type LaunchOverallStatus = 'queued' | 'running' | 'completed' | 'partial' | 'failed';

interface LaunchStep {
  key: string;
  label: string;
  status: LaunchStepStatus;
  startedAt?: string;
  finishedAt?: string;
  message?: string;
  result?: Record<string, unknown>;
  error?: string;
}

function initSteps(targets: LaunchTargets): LaunchStep[] {
  const wanted: Array<{ key: StepKey; label: string }> = [
    { key: 'blog', label: 'Generate blog post' },
    { key: 'images', label: 'Generate hero + in-content images' },
    { key: 'embed', label: 'Index for AI memory' },
    { key: 'banner_campaign', label: 'Plan advertising banner campaign' },
    { key: 'banners', label: 'Generate advertising banners' },
  ];
  if (targets.facebook) wanted.push({ key: 'social_fb', label: 'Draft Facebook campaign post' });
  if (targets.linkedin) wanted.push({ key: 'social_li', label: 'Draft LinkedIn campaign post' });
  if (targets.instagram) wanted.push({ key: 'social_ig', label: 'Draft Instagram campaign post' });
  if (targets.video) wanted.push({ key: 'video', label: 'Generate campaign video' });
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
  const steps = ((row.steps ?? []) as LaunchStep[]).map((s: LaunchStep) => (
    s.key === key ? { ...s, ...patch } : s
  ));
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

async function finalizeLaunchStatus(launchId: string): Promise<void> {
  const finalRow = await db.query.campaignLaunches.findFirst({
    where: eq(campaignLaunches.id, launchId),
  });
  const steps = (finalRow?.steps ?? []) as LaunchStep[];
  const anyError = steps.some((s: LaunchStep) => s.status === 'error');
  const allDoneOrSkipped = steps.every((s: LaunchStep) => s.status === 'done' || s.status === 'skipped');
  const finalStatus: LaunchOverallStatus = allDoneOrSkipped ? 'completed' : anyError ? 'partial' : 'completed';
  await patchLaunch(launchId, { status: finalStatus });
}

/* ─── Public entry ──────────────────────────────────────────────── */

export async function startLaunch(args: StartLaunchArgs): Promise<{ launchId: string }> {
  const language = normalizeContentLanguage(args.language ?? await resolveCompanyLanguage(args.companyId));
  const targets: LaunchTargets = {
    wordpress: false,
    facebook: args.targets.facebook === true,
    linkedin: args.targets.linkedin === true,
    instagram: args.targets.instagram === true,
    video: args.targets.video === true,
    language,
    imageMode: args.imageMode === 'uploaded' && args.assetIds?.length ? 'uploaded' : 'ai',
    uploadedAssetIds: args.assetIds?.slice(0, 3),
  };
  const [row] = await db
    .insert(campaignLaunches)
    .values({
      companyId: args.companyId,
      keyword: args.keyword,
      brief: args.brief ?? null,
      targets,
      source: args.source ?? 'manual',
      status: 'queued',
      steps: initSteps(targets),
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

type BannerVariant = {
  headline: string;
  subheadline?: string;
  cta: string;
  angle?: string;
  reasoning?: string;
  visualDirection?: string;
};

function fallbackBannerVariants(keyword: string, language?: string): BannerVariant[] {
  const lang = normalizeContentLanguage(language);
  const bannerTopic = truncateAtWord(keyword, 70);
  const discover = localizedDefault(lang, 'discover');
  const learnMore = localizedDefault(lang, 'learnMore');
  const getStarted = localizedDefault(lang, 'getStarted');
  const exploreNow = localizedDefault(lang, 'exploreNow');
  return [
    {
      headline: lang === 'en' ? `Discover ${bannerTopic}` : `${discover} ${bannerTopic}`,
      subheadline: lang === 'ja'
        ? '関心を行動につなげる、顧客に合った明確な提案です。'
        : 'Turn interest into action with a clear offer built for your audience.',
      cta: learnMore,
      angle: 'benefit',
      visualDirection: 'Clean premium social banner with strong contrast and a clear call to action.',
    },
    {
      headline: lang === 'ja'
        ? `${bannerTopic}をもっと簡単に`
        : `Make ${bannerTopic} easier`,
      subheadline: lang === 'ja'
        ? 'より速く、わかりやすい次の一歩を求める人への実用的なメッセージです。'
        : 'A practical message for people who want a faster, simpler next step.',
      cta: getStarted,
      angle: 'pain',
      visualDirection: 'Bold problem-solution layout with energetic accent color and direct CTA.',
    },
    {
      headline: lang === 'ja'
        ? `今選ぶ${bannerTopic}`
        : `${bannerTopic} made for today`,
      subheadline: lang === 'ja'
        ? '注目とクリックを生むための、わかりやすいキャンペーンバナーです。'
        : 'A direct campaign banner designed to create attention and clicks.',
      cta: exploreNow,
      angle: 'aspiration',
      visualDirection: 'Aspirational campaign creative with confident typography and modern visual rhythm.',
    },
  ];
}

function truncateAtWord(value: string, maxLength: number): string {
  const normalized = value.replace(/\s+/g, ' ').trim();
  if (normalized.length <= maxLength) return normalized;
  const candidate = normalized.slice(0, Math.max(0, maxLength - 1));
  const lastSpace = candidate.lastIndexOf(' ');
  const trimmed = (lastSpace > Math.floor(maxLength * 0.6)
    ? candidate.slice(0, lastSpace)
    : candidate
  ).trim();
  return `${trimmed}...`;
}

function escapeHtmlAttribute(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function buildLaunchBlogFigure(imageUrl: string, alt: string): string {
  return [
    '<figure class="campaign-blog-image">',
    `<img src="${escapeHtmlAttribute(imageUrl)}" alt="${escapeHtmlAttribute(alt)}" loading="lazy" />`,
    '</figure>',
  ].join('');
}

function insertLaunchImagesIntoBlogContent(html: string, imageUrls: string[], title: string): string {
  const usableImageUrls = imageUrls.filter(Boolean).slice(0, 2);
  if (usableImageUrls.length === 0) return html;

  const h2Matches = [...html.matchAll(/<h2\b[^>]*>[\s\S]*?<\/h2>/gi)];
  if (h2Matches.length === 0) {
    return `${buildLaunchBlogFigure(usableImageUrls[0]!, title)}\n\n${html}`;
  }

  let output = html;
  const insertionIndexes = usableImageUrls.length === 1
    ? [h2Matches[Math.min(1, h2Matches.length - 1)]?.index ?? h2Matches[0]?.index ?? 0]
    : [
      h2Matches[0]?.index ?? 0,
      h2Matches[Math.max(1, Math.floor(h2Matches.length / 2))]?.index ?? h2Matches[h2Matches.length - 1]?.index ?? 0,
    ];

  const inserts = usableImageUrls
    .map((imageUrl, index) => ({
      imageUrl,
      index: insertionIndexes[index] ?? 0,
      alt: `${title} supporting image ${index + 1}`,
    }))
    .sort((a, b) => b.index - a.index);

  for (const insert of inserts) {
    output = `${output.slice(0, insert.index)}${buildLaunchBlogFigure(insert.imageUrl, insert.alt)}\n\n${output.slice(insert.index)}`;
  }

  return output;
}

async function getUploadedLaunchImages(
  companyId: string,
  assetIds?: string[] | null,
): Promise<BlogImageVariation[]> {
  const uniqueIds = [...new Set((assetIds ?? []).filter(Boolean))].slice(0, 3);
  if (uniqueIds.length === 0) return [];

  const rows = await Promise.all(uniqueIds.map((assetId) => (
    db.query.assetLibrary.findFirst({
      where: and(
        eq(assetLibrary.id, assetId),
        eq(assetLibrary.companyId, companyId),
      ),
    })
  )));

  const allowedMimeTypes = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
  const images = rows
    .filter((asset): asset is NonNullable<typeof asset> => Boolean(asset))
    .filter((asset) => (
      asset.type === 'image'
      && !!asset.url
      && (!asset.mimeType || allowedMimeTypes.has(asset.mimeType))
    ))
    .map((asset, index) => ({
      url: asset.url,
      prompt: `User-uploaded campaign image: ${asset.name}`,
      size: index === 0 ? 'uploaded-hero' : 'uploaded-supporting',
    }));

  if (images.length !== uniqueIds.length) {
    throw new Error('Some uploaded campaign images are missing or are not supported image assets.');
  }
  return images;
}

async function generateBannerVariants(
  launch: typeof campaignLaunches.$inferSelect,
  brandKit?: BrandCreativeKit | null,
  language?: string,
): Promise<BannerVariant[]> {
  try {
    const normalizedLanguage = normalizeContentLanguage(language);
    const brandCreativePrompt = renderBrandCreativeKitPrompt(brandKit);
    const response = await llmGenerate(
      [
        {
          role: 'system',
          content: [
            'You are a senior performance creative strategist.',
            'Create concise advertising banner copy variants for social ads.',
            'Return strict JSON only: {"variants":[{"headline":"","subheadline":"","cta":"","angle":"","reasoning":"","visualDirection":""}]}',
            'Headlines must be short enough for a 1200x628 banner.',
            'visualDirection describes the banner layout, mood, visual hierarchy, and imagery direction.',
            buildContentLanguageInstruction(normalizedLanguage),
          ].join('\n'),
        },
        {
          role: 'user',
          content: [
            `Campaign topic: ${launch.keyword}`,
            buildContentLanguageInstruction(normalizedLanguage),
            brandCreativePrompt,
            launch.brief ? `Source context and user brief:\n${launch.brief}` : '',
            'Create exactly 3 distinct banner variants. Make each variant relevant to the source context and consistent with the Brand Creative Kit.',
          ].filter(Boolean).join('\n\n'),
        },
      ],
      {
        featureKey: 'campaign_banner_copy',
        traceName: 'launch.generateBannerVariants',
        metadata: { companyId: launch.companyId, launchId: launch.id, language: normalizedLanguage },
        json: true,
        maxTokens: 1200,
      },
    );
    const parsed = extractJSON(response.text) as { variants?: BannerVariant[] } | null;
    const variants = Array.isArray(parsed?.variants) ? parsed!.variants : [];
    const cleaned = variants
      .filter((v) => v?.headline && v?.cta)
      .slice(0, 3)
      .map((v) => ({
        headline: String(v.headline).slice(0, 90),
        subheadline: v.subheadline ? String(v.subheadline).slice(0, 160) : undefined,
        cta: String(v.cta).slice(0, 30),
        angle: v.angle ? String(v.angle).slice(0, 50) : 'benefit',
        reasoning: v.reasoning ? String(v.reasoning).slice(0, 240) : undefined,
        visualDirection: v.visualDirection ? String(v.visualDirection).slice(0, 280) : undefined,
      }));
    return cleaned.length === 3 ? cleaned : fallbackBannerVariants(launch.keyword, normalizedLanguage);
  } catch (e) {
    console.warn('[launch] banner variant generation failed:', (e as Error).message);
    return fallbackBannerVariants(launch.keyword, language);
  }
}

async function runBannerLaunch(
  launchId: string,
  launch: typeof campaignLaunches.$inferSelect,
  options: { blogPostId?: string; finalize?: boolean; bannerBackgroundUrls?: string[] } = {},
): Promise<string | null> {
  const language = normalizeContentLanguage((launch.targets as LaunchTargets).language);
  await markStart(launchId, 'banner_campaign');
  let campaign: typeof campaigns.$inferSelect | undefined;
  try {
    const [created] = await db
      .insert(campaigns)
      .values({
        companyId: launch.companyId,
        name: truncateAtWord(`Launch: ${launch.keyword}`, 255),
        goal: 'traffic',
        platform: 'manual',
        status: 'ready',
        targeting: {
          keywords: [launch.keyword],
          source: 'campaign_launcher',
          blogPostId: options.blogPostId ?? launch.blogPostId ?? null,
        } as any,
        aiMode: true,
      })
      .returning();
    campaign = created;
    if (!campaign) throw new Error('Failed to create banner campaign');
    await markDone(
      launchId,
      'banner_campaign',
      {
        campaignId: campaign.id,
        blogPostId: options.blogPostId ?? launch.blogPostId ?? null,
      },
      'Advertising banner campaign draft created.',
    );
  } catch (e) {
    await markError(launchId, 'banner_campaign', (e as Error).message);
    await patchLaunch(launchId, { status: 'failed' });
    return null;
  }

  await markStart(launchId, 'banners');
  const createdBanners: Array<typeof banners.$inferSelect> = [];
  try {
    const brandKit = await buildBrandCreativeKit(launch.companyId);
    const variants = await generateBannerVariants(launch, brandKit, language);
    const usesUploadedImages = (launch.targets as LaunchTargets).imageMode === 'uploaded';
    for (const [index, variant] of variants.entries()) {
      const theme = applyBrandKitToBannerTheme(
        CAMPAIGN_BANNER_PALETTE[index % CAMPAIGN_BANNER_PALETTE.length]!,
        brandKit,
        index,
      );
      const backgroundImageUrl = options.bannerBackgroundUrls?.length
        ? options.bannerBackgroundUrls[index % options.bannerBackgroundUrls.length]
        : undefined;
      const baseDesign = {
        layout: theme.layout,
        backgroundType: backgroundImageUrl ? ('image' as const) : ('gradient' as const),
        backgroundValue: backgroundImageUrl ?? theme.backgroundValue,
        ...(usesUploadedImages && backgroundImageUrl ? {
          backgroundImageProvider: 'uploaded_assets',
          backgroundOnly: true,
        } : {}),
        colorTheme: theme.colors,
        brandKit: brandCreativeKitSnapshot(brandKit),
        brandFit: buildBrandFitSummary(brandKit, false),
        ...(variant.visualDirection ? { visualDirection: variant.visualDirection } : {}),
        typography: {
          headlineSize: index === 0 ? 'xl' : 'lg',
          headlineWeight: 800,
          alignment: theme.layout === 'split' ? 'left' : 'center',
        },
      };
      const copy = {
        headline: variant.headline,
        ...(variant.subheadline ? { subheadline: variant.subheadline } : {}),
        cta: variant.cta,
        ...(variant.reasoning ? { reasoning: variant.reasoning } : {}),
        brandColor: theme.colors.primary,
      };
      const [created] = await db
        .insert(banners)
        .values({
          companyId: launch.companyId,
          campaignId: campaign.id,
          name: `${variant.headline}`.slice(0, 255),
          size: '1200x628',
          status: 'draft',
          copy,
          concept: truncateAtWord(`${launch.keyword} banner ${index + 1}`, 255),
          angle: variant.angle ?? 'benefit',
          design: baseDesign as any,
          strategyTag: variant.angle ?? 'benefit',
        })
        .returning();
      if (created) {
        try {
          if (usesUploadedImages && backgroundImageUrl) {
            const [updated] = await db
              .update(banners)
              .set({
                imageUrl: backgroundImageUrl,
                design: {
                  ...baseDesign,
                  renderedImageUrl: backgroundImageUrl,
                  renderProvider: 'uploaded-asset',
                  renderedAt: new Date().toISOString(),
                } as any,
                updatedAt: new Date(),
              })
              .where(eq(banners.id, created.id))
              .returning();
            createdBanners.push(updated ?? created);
            continue;
          }

          const rendered = await renderBannerImage({
            backgroundImageUrl,
            bannerId: created.id,
            companyId: launch.companyId,
            size: created.size,
            keyword: launch.keyword,
            headline: variant.headline,
            subheadline: variant.subheadline,
            cta: variant.cta,
            layout: theme.layout,
            colors: theme.colors,
            visualDirection: variant.visualDirection,
            brandKit,
          });
          const [updated] = await db
            .update(banners)
            .set({
              imageUrl: rendered.imageUrl,
              design: {
                ...baseDesign,
                ...(backgroundImageUrl ? {
                  backgroundImageProvider:
                    (launch.targets as LaunchTargets).imageMode === 'uploaded'
                      ? 'uploaded_assets'
                      : 'launch_generated_images',
                } : {}),
                imglyScene: rendered.imglyScene,
                renderedImageUrl: rendered.imageUrl,
                renderProvider: rendered.renderer,
                brandFit: buildBrandFitSummary(brandKit, Boolean(rendered.brandLogoApplied)),
                renderedAt: new Date().toISOString(),
              } as any,
              updatedAt: new Date(),
            })
            .where(eq(banners.id, created.id))
            .returning();
          createdBanners.push(updated ?? created);
        } catch (renderError) {
          console.warn('[launch] banner render failed:', (renderError as Error).message);
          createdBanners.push(created);
        }
      }
    }
    await markDone(
      launchId,
      'banners',
      {
        campaignId: campaign.id,
        bannerIds: createdBanners.map((b) => b.id),
        banners: createdBanners.map((b) => ({ id: b.id, name: b.name, status: b.status, imageUrl: b.imageUrl })),
      },
      `${createdBanners.length} banner drafts are ready for review.`,
    );
  } catch (e) {
    await markError(launchId, 'banners', (e as Error).message);
  }

  const socialMap: Array<{ key: string; platform: 'facebook' | 'linkedin' | 'instagram'; enabled: boolean }> = [
    { key: 'social_fb', platform: 'facebook', enabled: launch.targets.facebook },
    { key: 'social_li', platform: 'linkedin', enabled: launch.targets.linkedin },
    { key: 'social_ig', platform: 'instagram', enabled: launch.targets.instagram },
  ];
  const enabledSocial = socialMap.filter((item) => item.enabled);
  let generatedSocialPosts = new Map<SocialPlatform, {
    content: string;
    hashtags: string[];
  }>();
  if (enabledSocial.length > 0) {
    try {
      const blogPostId = options.blogPostId ?? launch.blogPostId ?? undefined;
      const blogPost = blogPostId
        ? await db.query.blogPosts.findFirst({ where: eq(blogPosts.id, blogPostId) })
        : undefined;
      const generated = await generateCampaignSocialPosts({
        companyId: launch.companyId,
        campaignId: campaign.id,
        topic: launch.keyword,
        goal: 'Drive qualified traffic and engagement',
        context: [
          launch.brief ? `USER BRIEF AND SOURCE MATERIAL:\n${launch.brief}` : '',
          blogPost?.title ? `CAMPAIGN BLOG TITLE: ${blogPost.title}` : '',
          blogPost?.excerpt ? `CAMPAIGN BLOG SUMMARY: ${blogPost.excerpt}` : '',
          blogPost?.content ? `CAMPAIGN BLOG CONTENT:\n${blogPost.content.slice(0, 3500)}` : '',
        ].filter(Boolean).join('\n\n'),
        platforms: enabledSocial.map((item) => item.platform),
        language,
        traceName: 'launch.generateSocialPosts',
      });
      generatedSocialPosts = new Map(
        generated.posts.map((post) => [
          post.platform,
          { content: post.content, hashtags: post.hashtags },
        ]),
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Social post generation failed';
      for (const item of enabledSocial) {
        await markError(launchId, item.key, message);
      }
    }
  }

  for (const s of socialMap) {
    if (!s.enabled) continue;
    const generatedPost = generatedSocialPosts.get(s.platform);
    if (!generatedPost) continue;
    await markStart(launchId, s.key);
    try {
      const [inserted] = await db
        .insert(socialPosts)
        .values({
          companyId: launch.companyId,
          campaignId: campaign.id,
          platform: s.platform,
          content: generatedPost.content,
          hashtags: generatedPost.hashtags,
          // Keep drafts text-only until the user explicitly chooses banners
          // and applies them from Campaign detail.
          mediaUrls: [],
          status: 'draft',
        })
        .returning();
      await markDone(launchId, s.key, {
        socialPostId: inserted?.id,
        campaignId: campaign.id,
        blogPostId: options.blogPostId ?? launch.blogPostId ?? null,
        platform: s.platform,
      });
    } catch (e) {
      await markError(launchId, s.key, (e as Error).message);
    }
  }

  if (options.finalize !== false) {
    await finalizeLaunchStatus(launchId);
  }
  return campaign.id;
}

async function runLaunch(launchId: string): Promise<void> {
  const launch = await db.query.campaignLaunches.findFirst({
    where: eq(campaignLaunches.id, launchId),
  });
  if (!launch) return;
  const launchTargets = launch.targets as LaunchTargets;
  const language = normalizeContentLanguage(launchTargets.language);
  await patchLaunch(launchId, { status: 'running' });

  // 1. Blog
  await markStart(launchId, 'blog');
  let blog: Awaited<ReturnType<BlogGenerator['generateBlogPost']>>;
  try {
    const gen = new BlogGenerator();
    blog = await gen.generateBlogPost(launch.companyId, {
      keyword: launch.keyword,
      searchIntent: 'informational',
      language,
      targetWordCount: 1800,
      sourceContext: launch.brief ?? undefined,
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
      language,
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
  let blogContentForEmbedding = savedBlog.content;
  let launchGeneratedImageUrls: string[] = [];

  // 2. Images
  await markStart(launchId, 'images');
  let imageBundle: Awaited<ReturnType<typeof generateBlogImages>> = { hero: null, inContent: [] };
  try {
    const uploadedImages = launchTargets.imageMode === 'uploaded'
      ? await getUploadedLaunchImages(launch.companyId, launchTargets.uploadedAssetIds)
      : [];

    if (uploadedImages.length > 0) {
      imageBundle = {
        hero: uploadedImages[0] ?? null,
        inContent: uploadedImages.slice(1, 3),
      };
    } else {
      imageBundle = await generateBlogImages({
        companyId: launch.companyId,
        title: savedBlog.title,
        keyword: launch.keyword,
        withHero: true,
        inContentCount: 2,
        excerpt: savedBlog.excerpt ?? undefined,
        contentHtml: savedBlog.content,
      });
      const generatedCount = (imageBundle.hero ? 1 : 0) + imageBundle.inContent.length;
      if (generatedCount === 0) {
        throw new Error('No images were generated. Configure an image provider or use the local fallback.');
      }
    }
    launchGeneratedImageUrls = [
      imageBundle.hero?.url,
      ...imageBundle.inContent.map((image) => image.url),
    ].filter((url): url is string => Boolean(url));
    const blogIllustrationUrls = [
      ...imageBundle.inContent.map((image) => image.url),
      ...launchGeneratedImageUrls.filter((url) => !imageBundle.inContent.some((image) => image.url === url)),
    ].slice(0, 2);
    if (blogIllustrationUrls.length > 0) {
      const contentWithImages = insertLaunchImagesIntoBlogContent(
        savedBlog.content,
        blogIllustrationUrls,
        savedBlog.title,
      );
      try {
        await db
          .update(blogPosts)
          .set({ content: contentWithImages, updatedAt: new Date() })
          .where(eq(blogPosts.id, savedBlog.id));
        blogContentForEmbedding = contentWithImages;
      } catch (contentError) {
        console.warn('[launch] failed to attach generated images to blog content:', (contentError as Error).message);
      }
    }
    await patchLaunch(launchId, { heroImageUrl: imageBundle.hero?.url ?? null });
    await markDone(launchId, 'images', {
      heroUrl: imageBundle.hero?.url ?? null,
      inContentUrls: imageBundle.inContent.map((i) => i.url),
      count: (imageBundle.hero ? 1 : 0) + imageBundle.inContent.length,
      source: uploadedImages.length > 0 ? 'uploaded_assets' : 'ai_generated',
    }, uploadedImages.length > 0 ? 'Using uploaded images for the blog and banner backgrounds.' : undefined);
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
      body: blogContentForEmbedding,
    });
    await markDone(launchId, 'embed', { sourceType: 'blog_post' });
  } catch (e) {
    await markError(launchId, 'embed', (e as Error).message);
  }

  // 4. Campaign + IMG.LY advertising banners + social drafts linked to that campaign
  const campaignId = await runBannerLaunch(launchId, launch, {
    blogPostId: savedBlog.id,
    finalize: false,
    bannerBackgroundUrls: launchGeneratedImageUrls.slice(0, 3),
  });
  if (!campaignId) return;

  if (launchTargets.video) {
    await markStart(launchId, 'video');
    try {
      const video = await createCampaignVideoProject({
        companyId: launch.companyId,
        campaignId,
        format: '15s',
        aspectRatio: '9:16',
      });
      await markDone(launchId, 'video', {
        campaignId,
        videoProjectId: video.id,
        status: video.status,
        outputUrl: video.outputUrl,
      }, 'One campaign video is ready for review.');
    } catch (e) {
      await markError(launchId, 'video', (e as Error).message);
    }
  }

  // 5. Seed GEO tracking prompt for the keyword
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

  await finalizeLaunchStatus(launchId);
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
