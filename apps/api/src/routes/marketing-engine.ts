/**
 * Marketing Engine API — Campaigns, Banners, Social Posts
 *
 * Every button maps to an API + state transition.
 * All actions have loading, success, error states.
 */

import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { randomUUID } from 'crypto';
import { eq, and, desc } from 'drizzle-orm';
import { db } from '../lib/db';
import { campaigns, banners, socialPosts, knowledgeBase, companies, videoProjects, blogPosts } from '@1person/core/db';
import { authMiddleware } from '../middleware/auth';
import { llmGenerate, extractJSON } from '../lib/llm';
import { buildBusinessContext } from '../services/business-context';
import { generateImage, buildBannerImagePrompt } from '../services/image-generator';
import { buildCampaignBannerBackgroundPrompt } from '../services/campaign-banner-creative';
import {
  applyBrandKitToBannerTheme,
  brandCreativeKitSnapshot,
  buildBrandCreativeKit,
  buildBrandFitSummary,
  renderBrandCreativeKitPrompt,
} from '../services/brand-creative-kit';
import { resolveImageProvider } from '../lib/config-resolver';
import { ensureSufficientCredits, chargeFixedCredits } from '../lib/credits';
import { FIXED_CREDIT_COSTS } from '../lib/credit-costs';
import { getViralFrameworkPrompt, getAdCopySpecPrompt, AIDA_FRAMEWORK, AB_TEST_ANGLES, EMAIL_SEQUENCE_FRAMEWORK, EMAIL_SUBJECT_FORMULAS, KEYWORD_CLUSTER_PROMPT } from '../services/marketing-frameworks';
import { adaptDesignForSize, AD_SIZES } from '../services/creative-adapter';
import { validateBanner } from '../services/creative-quality';
import { generateScript, breakIntoScenes } from '../services/video-engine';
import {
  createCampaignVideoProject,
  UnsupportedVideoReferenceImageError,
} from '../services/campaign-video-creative';
import {
  applyLatestCampaignBannerMedia,
  bannerIdFromMediaUrl,
  removeCampaignBannerMedia,
  replaceAttachedBannerVersion,
} from '../services/campaign-banner-media';
import {
  createSocialBannerVariant,
  normalizeSocialPlatform,
  SOCIAL_BANNER_PRESETS,
  type SocialBannerVariant,
} from '../services/social-banner-variant';
import {
  SOCIAL_PLATFORMS,
  type SocialPlatform,
} from '../services/campaign-social-generator';
import { saveObject } from '../services/object-storage';
import { deleteStoredAssetsIfUnreferenced } from '../services/asset-storage-cleanup';
import { authorizeCompanyAccess, type CompanyPermission } from '../lib/company-access';

const marketingEngineRouter = new Hono();
marketingEngineRouter.use('*', authMiddleware);

const CUSTOM_BANNER_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const CAMPAIGN_VIDEO_MEDIA_PATTERN =
  /\/videos\/([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})\//i;

async function requireCompanyPermission(c: any, permission: CompanyPermission) {
  const { userId } = c.get('user');
  const companyId = c.req.param('companyId');
  await authorizeCompanyAccess(userId, companyId, permission);
  if (permission === 'campaign.generate_ai' || permission === 'campaign.publish_social') {
    await authorizeCompanyAccess(userId, companyId, 'credits.spend');
  }
  return { userId, companyId };
}

function customBannerExtension(file: File): 'jpg' | 'png' | 'webp' {
  if (file.type === 'image/jpeg') return 'jpg';
  if (file.type === 'image/webp') return 'webp';
  return 'png';
}

function collectBannerAssetUrls(value: unknown, urls = new Set<string>()): Set<string> {
  if (typeof value === 'string') {
    if (/^https?:\/\//i.test(value)) urls.add(value);
    return urls;
  }
  if (Array.isArray(value)) {
    value.forEach((item) => collectBannerAssetUrls(item, urls));
    return urls;
  }
  if (value && typeof value === 'object') {
    Object.values(value as Record<string, unknown>)
      .forEach((item) => collectBannerAssetUrls(item, urls));
  }
  return urls;
}

function videoIdFromMediaUrl(url: string): string | null {
  const decoded = (() => {
    try {
      return decodeURIComponent(url);
    } catch {
      return url;
    }
  })();
  const pathname = (() => {
    try {
      return new URL(decoded, 'http://localhost').pathname;
    } catch {
      return decoded.split('?')[0] ?? decoded;
    }
  })();
  return pathname.match(CAMPAIGN_VIDEO_MEDIA_PATTERN)?.[1]?.toLowerCase() ?? null;
}

function uniqueMediaUrls(urls: string[]): string[] {
  return [...new Set(urls.filter(Boolean))];
}

async function readImageSize(buffer: Buffer): Promise<{ width: number; height: number }> {
  try {
    const { loadImage } = await import('@napi-rs/canvas');
    const image = await loadImage(buffer);
    const width = Math.round(image.width);
    const height = Math.round(image.height);
    if (width > 0 && height > 0) {
      const maxDimension = 1800;
      const scale = Math.min(1, maxDimension / Math.max(width, height));
      return {
        width: Math.round(width * scale),
        height: Math.round(height * scale),
      };
    }
  } catch {
    // Fall back to the standard campaign banner shape if the file metadata
    // cannot be read. The user can still crop/resize inside IMG.LY.
  }
  return { width: 1200, height: 628 };
}

// ===============================================================
// CAMPAIGNS
// ===============================================================

// Create campaign
marketingEngineRouter.post(
  '/company/:companyId/campaigns',
  zValidator('json', z.object({
    name: z.string().min(1),
    goal: z.enum(['traffic', 'leads', 'conversions', 'awareness', 'sales']),
    platform: z.enum(['google', 'meta', 'linkedin', 'manual']),
    budgetDaily: z.string().optional(),
    landingPageUrl: z.string().optional(),
    targeting: z.any().optional(),
  })),
  async (c) => {
    const { companyId } = await requireCompanyPermission(c, 'campaign.create');
    const data = c.req.valid('json');

    try {
      const [campaign] = await db.insert(campaigns).values({
        companyId,
        name: data.name,
        goal: data.goal as any,
        platform: data.platform as any,
        budgetDaily: data.budgetDaily,
        landingPageUrl: data.landingPageUrl,
        targeting: data.targeting as any,
        status: 'draft',
      }).returning();

      return c.json(campaign);
    } catch (err) {
      console.error('[Campaign Create] Failed:', err);
      return c.json({ error: 'Could not create campaign. Please try again.' }, 500);
    }
  }
);

// List campaigns
marketingEngineRouter.get('/company/:companyId/campaigns', async (c) => {
  const { companyId } = await requireCompanyPermission(c, 'campaign.view');
  const items = await db.select().from(campaigns)
    .where(eq(campaigns.companyId, companyId))
    .orderBy(desc(campaigns.createdAt));
  return c.json({ data: items });
});

// Get campaign detail
marketingEngineRouter.get('/company/:companyId/campaigns/:id', async (c) => {
  const { companyId } = await requireCompanyPermission(c, 'campaign.view');
  const id = c.req.param('id');
  const campaign = await db.query.campaigns.findFirst({ where: and(eq(campaigns.id, id), eq(campaigns.companyId, companyId)) });
  if (!campaign) return c.json({ error: 'Not found' }, 404);

  const campaignBanners = await db.select().from(banners).where(eq(banners.campaignId, id));
  const campaignPosts = await db.select().from(socialPosts).where(eq(socialPosts.campaignId, id));

  return c.json({ campaign, banners: campaignBanners, posts: campaignPosts });
});

// Launch campaign — Real launch flow with platform integration
marketingEngineRouter.post('/company/:companyId/campaigns/:id/launch', async (c) => {
  const { companyId } = await requireCompanyPermission(c, 'campaign.launch');
  const id = c.req.param('id');

  // Check has approved creatives
  const approvedBanners = await db.select().from(banners)
    .where(and(eq(banners.campaignId, id), eq(banners.status, 'approved')));
  const approvedPosts = await db.select().from(socialPosts)
    .where(and(eq(socialPosts.campaignId, id), eq(socialPosts.status, 'draft')));

  if (approvedBanners.length === 0 && approvedPosts.length === 0) {
    return c.json({ error: 'Cannot launch without approved creatives. Generate banners or posts first.' }, 400);
  }

  // 1. Set status = 'launching'
  await db.update(campaigns)
    .set({ status: 'launching', launchError: null, updatedAt: new Date() })
    .where(eq(campaigns.id, id));

  const campaign = await db.query.campaigns.findFirst({ where: eq(campaigns.id, id) });
  if (!campaign) {
    return c.json({ error: 'Campaign not found' }, 404);
  }

  const publishResults: Array<{ postId: string; platform: string; success: boolean; error?: string }> = [];
  const adResults: Array<{ bannerId: string; success: boolean; error?: string }> = [];

  try {
    // 2. Check platform connections and determine campaign type
    const isPaid = campaign.platform !== 'manual' && approvedBanners.length > 0;

    // 3. For paid campaigns: create on ad platform
    if (isPaid) {
      try {
        const { adsEngine } = await import('../services/ads-engine');
        const { adConnections: adConnTable } = await import('@1person/core/db');

        // Find ad connection for this platform
        const adConnectionResults = await db.select().from(adConnTable)
          .where(eq(adConnTable.companyId, companyId))
          .limit(10);
        const adConnection = adConnectionResults.find(
          (c) => c.platform === campaign!.platform && c.status === 'connected'
        );

        if (adConnection) {
          // a. Create ad campaign on platform
          const adCampaignId = await adsEngine.createCampaign({
            companyId,
            connectionId: adConnection.id,
            name: campaign.name,
            platform: campaign.platform,
            objective: campaign.goal === 'leads' ? 'LEAD_GENERATION' : campaign.goal === 'conversions' || campaign.goal === 'sales' ? 'CONVERSIONS' : 'TRAFFIC',
            dailyBudget: campaign.budgetDaily ? parseFloat(campaign.budgetDaily) : 10,
            startDate: new Date(),
            targetAudience: campaign.targeting as any,
          });

          // b. Create ad set
          const adSetId = await adsEngine.createAdSet({
            campaignId: adCampaignId,
            companyId,
            name: `${campaign.name} - Ad Set`,
            dailyBudget: campaign.budgetDaily ? parseFloat(campaign.budgetDaily) : 10,
            targetAudience: campaign.targeting as any,
          });

          // c. Upload creatives as ads
          for (const banner of approvedBanners) {
            try {
              const copy = banner.copy as any;
              await adsEngine.createAd({
                adSetId,
                campaignId: adCampaignId,
                companyId,
                name: banner.name,
                type: 'image',
                headline: copy?.headline || banner.name,
                primaryText: copy?.subheadline || '',
                callToAction: copy?.cta || 'Learn More',
                destinationUrl: campaign.landingPageUrl || '',
                imageUrl: banner.imageUrl || undefined,
              });
              adResults.push({ bannerId: banner.id, success: true });
            } catch (err) {
              console.error('[Campaign Launch] Ad creation failed:', err);
              adResults.push({ bannerId: banner.id, success: false, error: 'Ad creation failed' });
            }
          }

          // d. Launch the ad campaign
          const launchResult = await adsEngine.launchCampaign(adCampaignId);
          if (!launchResult.success) {
            console.warn(`[Campaign Launch] Ad campaign launch warning: ${launchResult.error}`);
          }
        } else {
          console.log(`[Campaign Launch] No ${campaign.platform} ad connection found — launching organic only`);
        }
      } catch (adErr) {
        console.warn('[Campaign Launch] Ad platform integration error:', adErr);
        // Continue with organic publishing even if ads fail
      }
    }

    // 4. For organic: publish posts via distribution engine
    if (approvedPosts.length > 0) {
      const { socialConnections: scTable } = await import('@1person/core/db');
      const { distributionEngine } = await import('../services/distribution-engine');

      for (const post of approvedPosts) {
        const platform = post.platform || 'facebook';

        const connectionResults = await db.select().from(scTable)
          .where(eq(scTable.companyId, companyId))
          .limit(20);
        const connection = connectionResults.find(
          (c) => c.platform === platform && c.status === 'connected'
        );

        if (!connection) {
          publishResults.push({ postId: post.id, platform, success: false, error: `${platform} not connected` });
          continue;
        }

        try {
          const scheduledPostId = await distributionEngine.createPost({
            companyId,
            connectionId: connection.id,
            platform: platform as any,
            contentText: post.content || '',
            hashtags: (post.hashtags as string[]) || [],
            mediaUrls: (post.mediaUrls as string[]) || [],
            scheduledFor: new Date(),
            campaignId: id,
            campaignName: post.campaignId || undefined,
          });

          const pubResult = await distributionEngine.publishPost(scheduledPostId);
          publishResults.push({ postId: post.id, platform, success: pubResult.success, error: pubResult.error });

          if (pubResult.success) {
            await db.update(socialPosts)
              .set({ status: 'published', publishedAt: new Date() })
              .where(eq(socialPosts.id, post.id));
          }
        } catch (err) {
          console.error(`[Campaign Launch] Post publish failed for ${platform}:`, err);
          publishResults.push({ postId: post.id, platform, success: false, error: 'Publish failed' });
        }
      }
    }

    // 5. Set status = 'live'
    const [updated] = await db.update(campaigns)
      .set({ status: 'live', startDate: new Date(), launchError: null, updatedAt: new Date() })
      .where(eq(campaigns.id, id)).returning();

    const publishedCount = publishResults.filter((r) => r.success).length;
    const failedCount = publishResults.filter((r) => !r.success).length;
    const adsCreated = adResults.filter((r) => r.success).length;

    return c.json({
      ...updated,
      publishing: {
        total: publishResults.length,
        published: publishedCount,
        failed: failedCount,
        results: publishResults,
      },
      ads: {
        total: adResults.length,
        created: adsCreated,
        results: adResults,
      },
    });
  } catch (err) {
    // 6. On any error: set status = 'failed'
    console.error('[Campaign Launch] Failed:', err);
    const internalMessage = err instanceof Error ? err.message : 'Campaign launch failed';
    await db.update(campaigns)
      .set({ status: 'failed', launchError: internalMessage, updatedAt: new Date() })
      .where(eq(campaigns.id, id));

    return c.json({ error: 'Campaign launch failed. Please try again.', status: 'failed' }, 500);
  }
});

// Pause campaign
marketingEngineRouter.post('/company/:companyId/campaigns/:id/pause', async (c) => {
  const { companyId } = await requireCompanyPermission(c, 'campaign.launch');
  const id = c.req.param('id');
  const [updated] = await db.update(campaigns)
    .set({ status: 'paused', updatedAt: new Date() })
    .where(and(eq(campaigns.id, id), eq(campaigns.companyId, companyId))).returning();
  return c.json(updated);
});

// Toggle AI Mode on/off for a campaign
marketingEngineRouter.post('/company/:companyId/campaigns/:id/ai-mode', zValidator('json', z.object({
  enabled: z.boolean(),
})), async (c) => {
  const { companyId } = await requireCompanyPermission(c, 'campaign.edit');
  const id = c.req.param('id');
  const { enabled } = c.req.valid('json');

  const campaign = await db.query.campaigns.findFirst({ where: and(eq(campaigns.id, id), eq(campaigns.companyId, companyId)) });
  if (!campaign) return c.json({ error: 'Not found' }, 404);

  const aiDecisions = (campaign.aiDecisions as any[]) || [];
  aiDecisions.push({
    type: 'ai_mode_toggle',
    reason: enabled ? 'User enabled AI optimization' : 'User switched to manual control',
    action: enabled ? 'AI Mode ON' : 'AI Mode OFF',
    timestamp: new Date().toISOString(),
    applied: true,
  });

  const [updated] = await db.update(campaigns)
    .set({ aiMode: enabled, aiDecisions: aiDecisions as any, updatedAt: new Date() })
    .where(and(eq(campaigns.id, id), eq(campaigns.companyId, companyId))).returning();

  return c.json(updated);
});

// AI Suggestions — returns opportunities detected by Growth Brain
marketingEngineRouter.get('/company/:companyId/campaigns/ai-suggestions', async (c) => {
  const { companyId } = await requireCompanyPermission(c, 'campaign.generate_ai');

  try {
    const ctx = await buildBusinessContext(companyId);

    // Check existing campaigns to avoid duplicates
    const existingCampaigns = await db.select().from(campaigns)
      .where(eq(campaigns.companyId, companyId));
    const existingNames = existingCampaigns.map((c) => c.name.toLowerCase());

    const { text } = await llmGenerate([{
      role: 'system',
      content: 'You are a growth marketing strategist. Analyze the business and suggest campaign opportunities that are not already running.',
    }, {
      role: 'user',
      content: `Suggest 2-3 campaign opportunities for this business.

BUSINESS:
${ctx.fullContext.substring(0, 1000)}

EXISTING CAMPAIGNS (avoid duplicating):
${existingNames.join(', ') || 'None'}

Return ONLY JSON array:
[{
  "name": "Campaign name",
  "goal": "What it achieves for the business",
  "audience": "Who to target",
  "channel": "meta|google|linkedin",
  "suggestedBudget": 10,
  "reason": "Why this opportunity exists now",
  "confidence": "high|medium|low"
}]`,
    }], { maxTokens: 800 });

    const suggestions = extractJSON(text) || [];
    return c.json({ data: Array.isArray(suggestions) ? suggestions : [] });
  } catch {
    return c.json({ data: [] });
  }
});

// Run AI suggestion as autonomous campaign
marketingEngineRouter.post('/company/:companyId/campaigns/ai-suggestions/run', zValidator('json', z.object({
  goal: z.string(),
  audience: z.string(),
  reason: z.string(),
  offer: z.string().max(250).optional(),
  suggestedBudget: z.number().optional(),
  channel: z.string().optional(),
})), async (c) => {
  const { companyId } = await requireCompanyPermission(c, 'campaign.generate_ai');
  const opportunity = c.req.valid('json');

  try {
    const { marketingAutonomous } = await import('../services/marketing-autonomous');
    const campaignId = await marketingAutonomous.createAutonomousCampaign(companyId, opportunity);
    return c.json({ campaignId, status: 'created' });
  } catch (err) {
    console.error('[Campaign] AI suggestion run failed:', err);
    return c.json({ error: 'Could not create campaign. Please try again.' }, 500);
  }
});

// ===============================================================
// BANNERS — Generate + Approve/Reject + Assign
// ===============================================================

// Generate creative set — concept + angle + variants with layout templates
marketingEngineRouter.post(
  '/company/:companyId/banners/generate',
  zValidator('json', z.object({
    campaignId: z.string().uuid().nullish(),
    size: z.string().default('1200x628'),
    variants: z.number().min(1).max(6).default(3),
    language: z.string().default('en'),
  })),
  async (c) => {
    const { companyId } = await requireCompanyPermission(c, 'campaign.generate_ai');
    const { campaignId, size, variants, language } = c.req.valid('json');

    const LANG_NAMES: Record<string, string> = {
      en: 'English', vi: 'Vietnamese (Tiếng Việt)', zh: 'Chinese (中文)',
      ja: 'Japanese (日本語)', ko: 'Korean (한국어)', th: 'Thai (ภาษาไทย)',
      fr: 'French (Français)', es: 'Spanish (Español)',
    };
    const langName = LANG_NAMES[language] || 'English';
    const langInstruction = language !== 'en'
      ? `\n\nCRITICAL: ALL text output (headlines, subheadlines, CTAs) MUST be written in ${langName}. Do NOT write in English. The target audience speaks ${langName}.`
      : '';

    try {
    const ctx = await buildBusinessContext(companyId);
    const brandKit = await buildBrandCreativeKit(companyId);
    const brandPrimary = brandKit.colors.primary || ctx.brandColors.primary || '#6366f1';
    const brandSecondary = brandKit.colors.secondary || ctx.brandColors.secondary || '#8b5cf6';
    const brandCreativePrompt = renderBrandCreativeKitPrompt(brandKit);

    // STEP 1: Generate creative set — concept + variants (NOT images)
    const llmResult = await llmGenerate([{
      role: 'system',
      content: `You are a creative director at a top ad agency. You create ad concepts, NOT images. Your output is structured creative briefs that a designer (or template engine) will render.

CRITICAL RULES:
- Headlines: MAX 8 words. Punchy. Benefit-driven. No filler words.
- Subheadlines: MAX 15 words. Support the headline with proof or detail.
- CTA: 2-4 words. Action verb + specific outcome. NEVER "Learn More" or "Click Here".
- Each variant uses a DIFFERENT angle AND a DIFFERENT layout.
- Reference SPECIFIC offerings from the business context.${langInstruction}`,
    }, {
      role: 'user',
      content: `Create a creative set with ${variants} banner variants.

BUSINESS:
${ctx.fullContext.substring(0, 800)}

${brandCreativePrompt || `BRAND: Voice=${ctx.brandVoice.join(',')}, Colors: ${brandPrimary}, ${brandSecondary}`}

ANGLES (each variant MUST use a different one):
- aspiration: Show the dream outcome the customer wants
- pain: Highlight the problem they face right now
- social-proof: Leverage numbers, testimonials, trust signals
- urgency: Create time pressure or scarcity
- benefit: Focus on a specific feature/benefit

LAYOUTS (assign the best layout for each angle):
- left-text: Text on left 60%, clean right side. Best for: detailed messages
- center: Centered text, bold headline. Best for: short punchy messages
- split: 50/50 split, text left + visual right. Best for: product showcases
- bold-cta: Huge CTA button, minimal text. Best for: urgency/action
- testimonial: Quote style with attribution. Best for: social proof

Return ONLY JSON:
{
  "concept": "The overarching creative theme (1 sentence)",
  "variants": [
    {
      "headline": "Max 8 words",
      "subheadline": "Max 15 words supporting the headline",
      "cta": "Action CTA (2-4 words)",
      "angle": "aspiration|pain|social-proof|urgency|benefit",
      "layout": "left-text|center|split|bold-cta|testimonial",
      "reasoning": "Why this angle + layout combo works"
    }
  ]
}`,
    }], {
      maxTokens: 1500,
      featureKey: 'campaign_banner_copy',
      traceName: 'marketing.banner.generate_creative_set',
      metadata: { companyId, campaignId, requestedSize: size, variants },
    });
    const { text } = llmResult;

    // Build a shared lineage block attached to every banner we create.
    // The `/explain` endpoint returns this so the "Why this output?" panel
    // can show provider/model/tier/sources + deep link into Langfuse.
    const contextSourcesUsed = {
      companyName: ctx.companyName,
      industry: ctx.industry,
      productsCount: ctx.products.length,
      faqsCount: ctx.faqs.length,
      brandVoice: ctx.brandVoice,
      brandStyle: ctx.brandStyle,
      brandColors: ctx.brandColors,
    };
    const lineage = {
      generatedAt: new Date().toISOString(),
      featureKey: 'campaign_banner_copy',
      provider: llmResult.provider,
      model: llmResult.model,
      tierUsed: llmResult.tierUsed,
      configSource: llmResult.configSource,
      creditCost: llmResult.creditCost,
      traceId: llmResult.traceId,
      traceUrl: llmResult.traceUrl,
      sources: contextSourcesUsed,
    };

    const parsed = extractJSON(text) || {};
    const concept = parsed.concept || 'Brand awareness campaign';
    const creativeVariants = (parsed.variants || []).slice(0, variants);

    // STEP 2: Create banners as rich JSON — NO AI image generation by default
    // Background = gradient (instant, professional, always works)
    // AI image = optional enhancement, not the default

    // Color themes per angle
    const angleThemes: Record<string, { primary: string; secondary: string; text: string; ctaBg: string; ctaText: string }> = {
      aspiration: { primary: brandPrimary, secondary: '#10b981', text: '#ffffff', ctaBg: '#ffffff', ctaText: brandPrimary },
      pain: { primary: '#dc2626', secondary: '#f97316', text: '#ffffff', ctaBg: '#fbbf24', ctaText: '#1e293b' },
      'social-proof': { primary: '#1e3a5f', secondary: '#3b82f6', text: '#ffffff', ctaBg: '#3b82f6', ctaText: '#ffffff' },
      urgency: { primary: '#dc2626', secondary: '#7c2d12', text: '#ffffff', ctaBg: '#fbbf24', ctaText: '#1e293b' },
      benefit: { primary: brandPrimary, secondary: brandSecondary, text: '#ffffff', ctaBg: '#ffffff', ctaText: brandPrimary },
    };

    const createdBanners: any[] = [];

    for (const [index, variant] of creativeVariants.entries()) {
      const angle = variant.angle || 'benefit';
      const layout = variant.layout || 'center';
      const theme = applyBrandKitToBannerTheme({
        backgroundValue: '',
        colors: angleThemes[angle] ?? angleThemes.benefit!,
        layout: 'left-text',
      }, brandKit, index);

      const headline = (variant.headline || '').split(' ').slice(0, 8).join(' ');
      const subheadline = (variant.subheadline || '').split(' ').slice(0, 15).join(' ');
      const cta = (variant.cta || 'Get Started').split(' ').slice(0, 4).join(' ');

      const designData = {
        layout: layout as any,
        backgroundType: 'gradient',
        backgroundValue: theme.backgroundValue,
        colorTheme: theme.colors,
        brandKit: brandCreativeKitSnapshot(brandKit),
        brandFit: buildBrandFitSummary(brandKit, false),
        typography: {
          headlineSize: layout === 'bold-cta' ? 'xl' : layout === 'center' ? 'lg' : 'md',
          headlineWeight: 800,
          alignment: layout === 'left-text' || layout === 'split' ? 'left' : 'center',
        },
        overlayOpacity: 0.6,
        lineage,
      };

      const copyData = {
        headline,
        subheadline,
        cta,
        reasoning: variant.reasoning,
        brandColor: brandPrimary,
      };

      try {
        // Try with new columns (concept, angle, design, updatedAt)
        const [banner] = await db.insert(banners).values({
          companyId,
          campaignId: campaignId || undefined,
          name: headline,
          size,
          status: 'draft',
          concept,
          angle,
          copy: copyData as any,
          design: designData as any,
          strategyTag: angle === 'urgency' ? 'urgency' : angle === 'social-proof' ? 'social-proof' : 'value',
        }).returning();

        const qualityReport = validateBanner({ copy: { headline, subheadline, cta }, design: { colorTheme: theme.colors, layout }, size });
        createdBanners.push({ ...banner, qualityScore: qualityReport.score, qualityReport });
      } catch (insertErr) {
        // Fallback: DB might not have new columns yet — insert with only original columns
        try {
          const [banner] = await db.insert(banners).values({
            companyId,
            campaignId: campaignId || undefined,
            name: headline,
            size,
            status: 'draft',
            copy: copyData as any,
            strategyTag: angle === 'urgency' ? 'urgency' : angle === 'social-proof' ? 'social-proof' : 'value',
          }).returning();

          const qualityReport = validateBanner({ copy: { headline, subheadline, cta }, design: { colorTheme: theme.colors, layout }, size });
          createdBanners.push({ ...banner, design: designData, concept, angle, qualityScore: qualityReport.score, qualityReport });
        } catch (fallbackErr) {
          console.error('[Banner] Insert failed:', fallbackErr);
        }
      }
    }

    return c.json({
      concept,
      generated: createdBanners.length,
      banners: createdBanners,
    });
    } catch (err) {
      console.error('[Banner Generate] Failed:', err);
      return c.json({ concept: '', generated: 0, banners: [], error: 'Could not generate banners. Please try again.' });
    }
  }
);

// Generate background image for a specific banner.
//
// Body: { imageProviderKey?: string } — omit to use the cheapest enabled
// provider, or pass one of: "gemini-imagen" | "dalle" | "banana" |
// "banana-pro" to pick a specific quality tier. Admins configure which
// providers are enabled + their credit cost in /admin/llm-config.
marketingEngineRouter.post(
  '/company/:companyId/banners/:bannerId/generate-background',
  async (c) => {
    const { companyId, userId } = await requireCompanyPermission(c, 'campaign.generate_ai');
    const bannerId = c.req.param('bannerId');

    const body = await c.req.json().catch(() => ({}));
    const requestedProviderKey: string | undefined = body.imageProviderKey;

    const banner = await db.select().from(banners)
      .where(and(eq(banners.id, bannerId), eq(banners.companyId, companyId)))
      .limit(1);

    if (!banner[0]) return c.json({ error: 'Banner not found' }, 404);

    // Resolve the requested provider + credit cost BEFORE doing the work
    // so we can fail fast with a friendly 402.
    let creditCost = 0;
    if (requestedProviderKey) {
      const cfg = await resolveImageProvider(requestedProviderKey);
      if (!cfg) {
        return c.json({ success: false, error: 'This image quality tier is not available right now.' }, 400);
      }
      if (!cfg.enabled || !cfg.hasCredentials) {
        return c.json({ success: false, error: `"${cfg.label}" is not ready yet. Ask your admin to enable it.` }, 400);
      }
      creditCost = cfg.creditCost;
      await ensureSufficientCredits(companyId, creditCost);
    }

    const ctx = await buildBusinessContext(companyId);
    const brandKit = await buildBrandCreativeKit(companyId);
    const b = banner[0];
    const design = b.design as any;
    const previousBackgroundObjectUrls = [
      b.imageUrl,
      ...Object.values(
        (design?.socialVariants as Partial<Record<SocialPlatform, SocialBannerVariant>> | undefined) ?? {},
      ).map((variant) => variant?.imageUrl),
    ];
    const campaign = b.campaignId
      ? await db.query.campaigns.findFirst({
        where: and(eq(campaigns.id, b.campaignId), eq(campaigns.companyId, companyId)),
      })
      : null;
    const targeting = (campaign?.targeting ?? {}) as Record<string, any>;
    const linkedBlogId = typeof targeting.blogPostId === 'string' ? targeting.blogPostId : null;
    const linkedBlog = linkedBlogId
      ? await db.query.blogPosts.findFirst({
        where: and(eq(blogPosts.id, linkedBlogId), eq(blogPosts.companyId, companyId)),
      })
      : null;

    try {
      const [wRaw, hRaw] = b.size.split('x').map(Number);
      const w = wRaw ?? 1200;
      const h = hRaw ?? 628;
      const campaignGoal = campaign?.name.replace(/^AI:\s*/i, '').replace(/^Launch:\s*/i, '').trim()
        || campaign?.goal
        || b.name;
      const audience = String(targeting.audience ?? targeting.targetAudience ?? 'the campaign target audience');
      const reason = typeof targeting.source === 'object'
        ? String(targeting.source?.reasoning ?? '')
        : '';
      const campaignContext = [
        ctx.fullContext,
        linkedBlog ? `LINKED BLOG: ${linkedBlog.title}\n${linkedBlog.excerpt ?? ''}` : '',
      ].filter(Boolean).join('\n');
      const imagePrompt = campaign
        ? buildCampaignBannerBackgroundPrompt({
          goal: campaignGoal,
          audience,
          reason,
          businessContext: campaignContext,
          angle: b.angle ?? b.strategyTag ?? undefined,
          visualDirection: design?.visualDirection,
          size: b.size,
          brandKit,
        })
        : buildBannerImagePrompt(
          ctx.fullContext.substring(0, 300),
          'minimal',
          b.strategyTag || 'value',
          b.size,
        );
      const imageResult = await generateImage({
        prompt: imagePrompt,
        width: w,
        height: h,
        providerKey: requestedProviderKey,
      });

      // Charge credits after successful generation. If no provider was
      // requested we still use the resolved cost from the actual result.
      const chargeAmount = creditCost > 0 ? creditCost : imageResult.creditCost;
      if (chargeAmount > 0) {
        await chargeFixedCredits(companyId, chargeAmount, {
          featureKey: 'banner_image',
          tier: imageResult.providerKey,
          refKind: 'banner_bg',
          refId: bannerId,
          actor: `user:${userId}`,
          note: `Banner background via ${imageResult.providerKey}`,
        });
      }

      await db.update(banners).set({
        imageUrl: imageResult.url,
        design: {
          ...design,
          socialVariants: {},
          backgroundType: 'image',
          backgroundValue: imageResult.url,
          backgroundPrompt: imagePrompt,
          imageProvider: imageResult.providerKey,
          backgroundImageProvider: imageResult.providerKey,
          brandKit: design?.brandKit ?? brandCreativeKitSnapshot(brandKit),
          brandFit: buildBrandFitSummary(brandKit, false),
        },
        updatedAt: new Date(),
      }).where(eq(banners.id, bannerId));
      await deleteStoredAssetsIfUnreferenced(previousBackgroundObjectUrls, { companyId });

      return c.json({
        success: true,
        imageUrl: imageResult.url,
        provider: imageResult.providerKey,
        creditsCharged: chargeAmount,
      });
    } catch (err: any) {
      // HTTPException from credit layer bubbles up as its own status
      if (err?.status === 402) {
        return c.json({ success: false, error: err.message || 'Not enough credits.' }, 402);
      }
      console.error('[banner generate-background] failed:', err);
      return c.json({
        success: false,
        error: err?.message || 'Could not generate background image. Please try again.'
      });
    }
  }
);

// "Why this output?" — returns the lineage block stored when the banner
// was generated: provider, model, tier, credit cost, sources used, and
// a Langfuse trace deep-link for full prompt inspection.
marketingEngineRouter.get(
  '/company/:companyId/banners/:bannerId/explain',
  async (c) => {
    const { companyId } = await requireCompanyPermission(c, 'campaign.view');
    const bannerId = c.req.param('bannerId');
    const row = await db
      .select()
      .from(banners)
      .where(and(eq(banners.id, bannerId), eq(banners.companyId, companyId)))
      .limit(1);
    if (!row[0]) return c.json({ error: 'Banner not found' }, 404);
    const design = (row[0].design as any) ?? {};
    const lineage = design.lineage ?? null;
    return c.json({
      bannerId,
      name: row[0].name,
      lineage,
      // Current design also tells us which image provider was used for
      // the background (if any), so the panel can show both LLM and
      // image-gen lineage side-by-side.
      imageProvider: design.imageProvider ?? null,
      backgroundPrompt: design.backgroundPrompt ?? null,
    });
  },
);

// Update banner (edit mode — user changes copy, design, colors)
// Full banner payload is loaded on demand because img.ly scene JSON can be
// large and is not needed by the campaign review list.
marketingEngineRouter.get(
  '/company/:companyId/banners/:bannerId',
  async (c) => {
    const { companyId } = await requireCompanyPermission(c, 'campaign.view');
    const bannerId = c.req.param('bannerId');
    const [banner] = await db.select().from(banners).where(and(
      eq(banners.id, bannerId),
      eq(banners.companyId, companyId),
    )).limit(1);
    if (!banner) return c.json({ error: 'Banner not found' }, 404);
    return c.json(banner);
  },
);

marketingEngineRouter.patch(
  '/company/:companyId/banners/:bannerId',
  async (c) => {
    const { companyId } = await requireCompanyPermission(c, 'campaign.edit');
    const bannerId = c.req.param('bannerId');
    const body = await c.req.json();

    const updates: Record<string, any> = { updatedAt: new Date() };
    if (body.copy) updates.copy = body.copy;
    if (body.design) updates.design = body.design;
    if (body.name) updates.name = body.name;

    const [updated] = await db.update(banners)
      .set(updates)
      .where(and(eq(banners.id, bannerId), eq(banners.companyId, companyId)))
      .returning();

    return c.json(updated);
  }
);

marketingEngineRouter.post('/company/:companyId/campaigns/:campaignId/banners/custom', async (c) => {
  const { companyId } = await requireCompanyPermission(c, 'campaign.edit');
  const campaignId = c.req.param('campaignId');
  const formData = await c.req.formData();
  const file = formData.get('file') as File | null;

  if (!file) return c.json({ error: 'Choose an image to create a banner.' }, 400);
  if (!CUSTOM_BANNER_TYPES.has(file.type)) {
    return c.json({ error: 'Please upload a JPG, PNG, or WebP image.' }, 400);
  }
  if (file.size > 15 * 1024 * 1024) {
    return c.json({ error: 'Image is too large. Please use an image under 15MB.' }, 400);
  }

  const campaign = await db.query.campaigns.findFirst({
    where: and(eq(campaigns.id, campaignId), eq(campaigns.companyId, companyId)),
    columns: { id: true, name: true },
  });
  if (!campaign) return c.json({ error: 'Campaign not found' }, 404);

  const bannerId = randomUUID();
  const bytes = Buffer.from(await file.arrayBuffer());
  const { width, height } = await readImageSize(bytes);
  const extension = customBannerExtension(file);
  const saved = await saveObject({
    key: `campaigns/${companyId}/${campaignId}/banners/${bannerId}/custom-original.${extension}`,
    body: bytes,
    contentType: file.type,
    cacheControl: 'public, max-age=31536000, immutable',
  });
  const fileBaseName = file.name.replace(/\.[^/.]+$/, '').trim() || 'Custom banner';
  const size = `${width}x${height}`;
  const brandKit = await buildBrandCreativeKit(companyId);
  const colorTheme = {
    primary: brandKit.colors.primary,
    secondary: brandKit.colors.secondary,
    text: brandKit.colors.text,
    ctaBg: brandKit.colors.ctaBg,
    ctaText: brandKit.colors.ctaText,
  };
  const design = {
    layout: 'left-text',
    backgroundType: 'image',
    backgroundValue: saved.url,
    backgroundImageProvider: 'uploaded_assets',
    backgroundOnly: true,
    renderedImageUrl: saved.url,
    renderProvider: 'custom-upload',
    renderedAt: new Date().toISOString(),
    colorTheme,
    brandKit: brandCreativeKitSnapshot(brandKit),
    brandFit: buildBrandFitSummary(brandKit, false),
    typography: {
      headlineSize: 'lg',
      headlineWeight: 800,
      alignment: 'left',
    },
  };

  const [banner] = await db.insert(banners).values({
    id: bannerId,
    companyId,
    campaignId,
    name: fileBaseName.slice(0, 255),
    size,
    status: 'draft',
    copy: {
      headline: fileBaseName.slice(0, 80),
      cta: 'Learn More',
      brandColor: colorTheme.primary,
      reasoning: 'Uploaded by the user as a custom campaign banner.',
    },
    concept: `Custom uploaded banner for ${campaign.name}`.slice(0, 255),
    angle: 'custom',
    design: design as any,
    imageUrl: saved.url,
    strategyTag: 'custom',
  }).returning();

  return c.json({ banner }, 201);
});

marketingEngineRouter.delete('/company/:companyId/campaigns/:campaignId/banners/:bannerId', async (c) => {
  const { companyId } = await requireCompanyPermission(c, 'campaign.edit');
  const campaignId = c.req.param('campaignId');
  const bannerId = c.req.param('bannerId');
  const [banner] = await db.select().from(banners).where(and(
    eq(banners.id, bannerId),
    eq(banners.companyId, companyId),
    eq(banners.campaignId, campaignId),
  )).limit(1);

  if (!banner) return c.json({ error: 'Banner not found' }, 404);
  if (banner.status === 'active' || banner.status === 'archived') {
    return c.json({
      error: 'This banner is part of campaign performance history and cannot be deleted.',
    }, 409);
  }

  const assetUrls = [...collectBannerAssetUrls({
    imageUrl: banner.imageUrl,
    design: banner.design,
  })];
  const campaignPosts = await db.select({
    id: socialPosts.id,
    status: socialPosts.status,
    mediaUrls: socialPosts.mediaUrls,
  }).from(socialPosts).where(and(
    eq(socialPosts.companyId, companyId),
    eq(socialPosts.campaignId, campaignId),
  ));

  const changedPosts = campaignPosts
    .filter((post) => post.status !== 'published')
    .map((post) => ({
      id: post.id,
      previousMediaUrls: post.mediaUrls ?? [],
      mediaUrls: removeCampaignBannerMedia({
        mediaUrls: post.mediaUrls ?? [],
        bannerId,
        knownBannerUrls: assetUrls,
      }),
    }))
    .filter((post) => JSON.stringify(post.previousMediaUrls) !== JSON.stringify(post.mediaUrls));

  await db.transaction(async (tx) => {
    for (const post of changedPosts) {
      await tx.update(socialPosts)
        .set({ mediaUrls: post.mediaUrls })
        .where(and(eq(socialPosts.id, post.id), eq(socialPosts.companyId, companyId)));
    }
    await tx.delete(banners).where(and(
      eq(banners.id, bannerId),
      eq(banners.companyId, companyId),
      eq(banners.campaignId, campaignId),
    ));
  });

  // Published posts and reused assets keep their files; only orphaned object-storage
  // objects are deleted after database references have been updated.
  await deleteStoredAssetsIfUnreferenced(assetUrls, { companyId });

  return c.json({
    deleted: true,
    bannerId,
    posts: changedPosts.map(({ id, mediaUrls }) => ({ id, mediaUrls })),
  });
});

marketingEngineRouter.post('/company/:companyId/banners/:bannerId/imgly-export', async (c) => {
  const { companyId } = await requireCompanyPermission(c, 'campaign.edit');
  const bannerId = c.req.param('bannerId');
  const formData = await c.req.formData();
  const file = formData.get('file') as File | null;
  const archive = formData.get('archive') as File | null;
  const scene = formData.get('scene');
  const rawSize = formData.get('size');

  if (!file) return c.json({ error: 'Missing exported banner image.' }, 400);
  if (!file.type.startsWith('image/')) return c.json({ error: 'Export must be an image file.' }, 400);
  if (!archive && (typeof scene !== 'string' || !scene.trim())) {
    return c.json({ error: 'Missing editable banner source.' }, 400);
  }

  const [existing] = await db.select().from(banners)
    .where(and(eq(banners.id, bannerId), eq(banners.companyId, companyId)))
    .limit(1);
  if (!existing) return c.json({ error: 'Banner not found' }, 404);

  const bytes = Buffer.from(await file.arrayBuffer());
  const extension = file.type === 'image/jpeg' ? 'jpg' : file.type === 'image/webp' ? 'webp' : 'png';
  const currentDesign = (existing.design as Record<string, any> | null) ?? {};
  const previousSocialVariants =
    (currentDesign.socialVariants as Partial<Record<SocialPlatform, SocialBannerVariant>> | undefined) ?? {};
  const previousObjectUrls = [
    existing.imageUrl,
    currentDesign.imglyArchiveUrl,
    ...Object.values(previousSocialVariants).map((variant) => variant?.imageUrl),
  ];
  const exportVersion = Date.now();
  const filename = `imgly-banner-${bannerId}-current.${extension}`;
  const savedImage = await saveObject({
    key: `campaigns/${companyId}/${existing.campaignId ?? 'unassigned'}/banners/${bannerId}/${filename}`,
    body: bytes,
    contentType: file.type || 'image/png',
    cacheControl: 'public, max-age=60, must-revalidate',
  });
  const imageUrl = `${savedImage.url}?v=${exportVersion}`;
  const exportedSize = typeof rawSize === 'string' && /^\d+x\d+$/.test(rawSize)
    ? rawSize
    : existing.size;
  const nextDesign: Record<string, any> = {
    ...currentDesign,
    socialVariants: {},
    imglyUpdatedAt: new Date().toISOString(),
  };
  if (archive) {
    const archiveBytes = Buffer.from(await archive.arrayBuffer());
    const archiveFilename = `imgly-banner-${bannerId}-current.cesdk`;
    const savedArchive = await saveObject({
      key: `campaigns/${companyId}/${existing.campaignId ?? 'unassigned'}/banners/${bannerId}/${archiveFilename}`,
      body: archiveBytes,
      contentType: 'application/octet-stream',
      cacheControl: 'public, max-age=60, must-revalidate',
    });
    nextDesign.imglyArchiveUrl = `${savedArchive.url}?v=${exportVersion}`;
    delete nextDesign.imglyScene;
    delete nextDesign.imglySceneImageUrl;
  } else if (typeof scene === 'string' && scene.trim()) {
    delete nextDesign.imglyArchiveUrl;
    nextDesign.imglyScene = scene;
    nextDesign.imglySceneImageUrl = imageUrl;
  }
  let [updated] = await db.update(banners)
    .set({
      imageUrl,
      size: exportedSize,
      design: nextDesign as any,
      updatedAt: new Date(),
    })
    .where(and(eq(banners.id, bannerId), eq(banners.companyId, companyId)))
    .returning();

  if (existing.campaignId) {
    const campaignPosts = await db.select({
      id: socialPosts.id,
      platform: socialPosts.platform,
      status: socialPosts.status,
      mediaUrls: socialPosts.mediaUrls,
    }).from(socialPosts)
      .where(and(
        eq(socialPosts.campaignId, existing.campaignId),
        eq(socialPosts.companyId, companyId),
      ));

    const attachedPosts = campaignPosts.filter((post) =>
      post.status !== 'published'
      && (post.mediaUrls ?? []).some((url) =>
        url === existing.imageUrl || bannerIdFromMediaUrl(url) === bannerId.toLowerCase(),
      ),
    );
    const variants: Partial<Record<SocialPlatform, SocialBannerVariant>> = {};
    const attachedPlatforms = Array.from(new Set<SocialPlatform>(
      attachedPosts
        .map((post) => normalizeSocialPlatform(post.platform))
        .filter((platform): platform is SocialPlatform => Boolean(platform)),
    ));
    const generatedBySize = new Map<string, Promise<SocialBannerVariant>>();

    await Promise.all(attachedPlatforms.map(async (platform) => {
      try {
        const preset = SOCIAL_BANNER_PRESETS[platform];
        let generation = generatedBySize.get(preset.size);
        if (!generation) {
          generation = createSocialBannerVariant({
            bannerId,
            sourceImageUrl: imageUrl,
            platform,
            backgroundColor: currentDesign.colorTheme?.primary ?? existing.copy?.brandColor,
          });
          generatedBySize.set(preset.size, generation);
        }
        variants[platform] = await generation;
      } catch (error) {
        delete variants[platform];
        console.warn(
          `[social-banner] Could not refresh ${platform} variant for banner ${bannerId}:`,
          (error as Error).message,
        );
      }
    }));

    if (attachedPlatforms.length > 0) {
      nextDesign.socialVariants = variants;
      [updated] = await db.update(banners)
        .set({ design: nextDesign as any, updatedAt: new Date() })
        .where(and(eq(banners.id, bannerId), eq(banners.companyId, companyId)))
        .returning();
    }

    await Promise.all(attachedPosts.map((post) => {
      const platform = normalizeSocialPlatform(post.platform);
      const nextImageUrl = platform ? variants[platform]?.imageUrl ?? imageUrl : imageUrl;
      const mediaUrls = replaceAttachedBannerVersion({
        mediaUrls: post.mediaUrls ?? [],
        bannerId,
        previousImageUrl: existing.imageUrl,
        nextImageUrl,
      });
      return db.update(socialPosts)
        .set({ mediaUrls })
        .where(eq(socialPosts.id, post.id));
    }));
  }

  await deleteStoredAssetsIfUnreferenced(previousObjectUrls, { companyId });

  return c.json({ banner: updated, imageUrl });
});

const applyCampaignBannerMediaSchema = z.object({
  bannerIds: z.array(z.string().uuid()).default([]),
  platforms: z.array(z.enum(SOCIAL_PLATFORMS)).optional(),
});

const applyCampaignVideoMediaSchema = z.object({
  videoId: z.string().uuid().optional(),
  platforms: z.array(z.enum(SOCIAL_PLATFORMS)).optional(),
  remove: z.boolean().optional().default(false),
});

marketingEngineRouter.patch(
  '/company/:companyId/campaigns/:campaignId/social-post-media',
  zValidator('json', applyCampaignBannerMediaSchema),
  async (c) => {
    const { companyId } = await requireCompanyPermission(c, 'campaign.edit');
    const campaignId = c.req.param('campaignId');
    const { bannerIds, platforms } = c.req.valid('json');

    const campaign = await db.query.campaigns.findFirst({
      where: and(eq(campaigns.id, campaignId), eq(campaigns.companyId, companyId)),
      columns: { id: true },
    });
    if (!campaign) return c.json({ error: 'Campaign not found' }, 404);

    const campaignBanners = await db.select({
      id: banners.id,
      imageUrl: banners.imageUrl,
      design: banners.design,
      copy: banners.copy,
    }).from(banners).where(and(
      eq(banners.campaignId, campaignId),
      eq(banners.companyId, companyId),
    ));
    const availableIds = new Set(campaignBanners.map((banner) => banner.id));
    const invalidBannerId = bannerIds.find((id) => !availableIds.has(id));
    if (invalidBannerId) {
      return c.json({ error: 'One or more selected banners do not belong to this campaign.' }, 400);
    }

    const campaignPosts = await db.select({
      id: socialPosts.id,
      platform: socialPosts.platform,
      status: socialPosts.status,
      mediaUrls: socialPosts.mediaUrls,
    }).from(socialPosts).where(and(
      eq(socialPosts.campaignId, campaignId),
      eq(socialPosts.companyId, companyId),
    ));

    const editablePosts = campaignPosts.filter((post) => post.status !== 'published');
    const availablePlatforms = Array.from(new Set<SocialPlatform>(
      editablePosts
        .map((post) => normalizeSocialPlatform(post.platform))
        .filter((platform): platform is SocialPlatform => Boolean(platform)),
    ));
    const requestedPlatforms = platforms ?? availablePlatforms;
    const selectedPlatforms = Array.from(new Set<SocialPlatform>(
      requestedPlatforms.filter((platform) => availablePlatforms.includes(platform)),
    ));
    if (selectedPlatforms.length === 0) {
      return c.json({
        error: 'Published posts are read-only. Create or use a draft post to apply banner images.',
      }, 409);
    }
    const selectedPlatformSet = new Set<SocialPlatform>(selectedPlatforms);
    const variantsByBanner = new Map<string, Partial<Record<SocialPlatform, SocialBannerVariant>>>();
    const staleVariantUrls: string[] = [];

    // Resizing involves download + canvas + object storage. Run independent
    // banner/platform work in parallel and reuse an existing variant when its
    // source image has not changed.
    await Promise.all(campaignBanners.map(async (banner) => {
      if (!bannerIds.includes(banner.id) || !banner.imageUrl) return;

      const design = (banner.design as Record<string, any> | null) ?? {};
      const copy = (banner.copy as Record<string, any> | null) ?? {};
      const variants: Partial<Record<SocialPlatform, SocialBannerVariant>> = {
        ...((design.socialVariants as Partial<Record<SocialPlatform, SocialBannerVariant>> | undefined) ?? {}),
      };
      const generatedBySize = new Map<string, Promise<SocialBannerVariant>>();

      await Promise.all(selectedPlatforms.map(async (platform) => {
        const cached = variants[platform];
        const preset = SOCIAL_BANNER_PRESETS[platform];
        if (
          cached?.imageUrl
          && cached.sourceImageUrl === banner.imageUrl
          && cached.size === preset.size
          && cached.paddingMode === 'transparent'
        ) {
          return;
        }
        if (cached?.imageUrl) staleVariantUrls.push(cached.imageUrl);

        const reusableVariant = Object.values(variants).find((variant) =>
          variant?.imageUrl
          && variant.sourceImageUrl === banner.imageUrl
          && variant.size === preset.size
          && variant.paddingMode === 'transparent',
        );
        if (reusableVariant) {
          variants[platform] = reusableVariant;
          return;
        }

        let generation = generatedBySize.get(preset.size);
        if (!generation) {
          generation = createSocialBannerVariant({
            bannerId: banner.id,
            sourceImageUrl: banner.imageUrl!,
            platform,
            backgroundColor: design.colorTheme?.primary ?? copy.brandColor,
          });
          generatedBySize.set(preset.size, generation);
        }
        variants[platform] = await generation;
      }));

      variantsByBanner.set(banner.id, variants);
      await db.update(banners)
        .set({
          design: { ...design, socialVariants: variants } as any,
          updatedAt: new Date(),
        })
        .where(and(eq(banners.id, banner.id), eq(banners.companyId, companyId)));
    }));

    const postsToUpdate = editablePosts.filter((post) => {
      const platform = normalizeSocialPlatform(post.platform);
      return platform ? selectedPlatformSet.has(platform) : false;
    });
    const updatedPosts = await Promise.all(postsToUpdate.map(async (post) => {
      const platform = normalizeSocialPlatform(post.platform)!;
      const platformBanners = campaignBanners.map((banner) => ({
        id: banner.id,
        imageUrl: variantsByBanner.get(banner.id)?.[platform]?.imageUrl ?? banner.imageUrl,
      }));
      const mediaUrls = applyLatestCampaignBannerMedia({
        mediaUrls: post.mediaUrls ?? [],
        campaignBanners: platformBanners,
        selectedBannerIds: bannerIds,
      });
      const [updatedPost] = await db.update(socialPosts)
        .set({ mediaUrls })
        .where(eq(socialPosts.id, post.id))
        .returning({
          id: socialPosts.id,
          platform: socialPosts.platform,
          mediaUrls: socialPosts.mediaUrls,
        });
      return updatedPost;
    }));

    await deleteStoredAssetsIfUnreferenced(staleVariantUrls, { companyId });

    return c.json({
      updated: updatedPosts.length,
      bannerIds,
      platforms: selectedPlatforms,
      posts: updatedPosts,
    });
  },
);

marketingEngineRouter.patch(
  '/company/:companyId/campaigns/:campaignId/social-post-video',
  zValidator('json', applyCampaignVideoMediaSchema),
  async (c) => {
    const { companyId } = await requireCompanyPermission(c, 'campaign.edit');
    const campaignId = c.req.param('campaignId');
    const { videoId, platforms, remove } = c.req.valid('json');

    const campaign = await db.query.campaigns.findFirst({
      where: and(eq(campaigns.id, campaignId), eq(campaigns.companyId, companyId)),
      columns: { id: true },
    });
    if (!campaign) return c.json({ error: 'Campaign not found' }, 404);

    const campaignVideos = await db.select({
      id: videoProjects.id,
      status: videoProjects.status,
      outputUrl: videoProjects.outputUrl,
    }).from(videoProjects).where(and(
      eq(videoProjects.campaignId, campaignId),
      eq(videoProjects.companyId, companyId),
    ));
    const selectedVideo = videoId ? campaignVideos.find((video) => video.id === videoId) : undefined;
    if (!remove) {
      if (!videoId || !selectedVideo) {
        return c.json({ error: 'Selected video does not belong to this campaign.' }, 400);
      }
      if (selectedVideo.status !== 'ready' || !selectedVideo.outputUrl) {
        return c.json({ error: 'Choose a ready video before applying it to social posts.' }, 409);
      }
    }

    const campaignPosts = await db.select({
      id: socialPosts.id,
      platform: socialPosts.platform,
      status: socialPosts.status,
      mediaUrls: socialPosts.mediaUrls,
    }).from(socialPosts).where(and(
      eq(socialPosts.campaignId, campaignId),
      eq(socialPosts.companyId, companyId),
    ));

    const editablePosts = campaignPosts.filter((post) => post.status !== 'published');
    const availablePlatforms = Array.from(new Set<SocialPlatform>(
      editablePosts
        .map((post) => normalizeSocialPlatform(post.platform))
        .filter((platform): platform is SocialPlatform => Boolean(platform)),
    ));
    const requestedPlatforms = platforms ?? availablePlatforms;
    const selectedPlatforms = Array.from(new Set<SocialPlatform>(
      requestedPlatforms.filter((platform) => availablePlatforms.includes(platform)),
    ));
    if (selectedPlatforms.length === 0) {
      return c.json({
        error: 'Published posts are read-only. Create or use a draft post to apply a campaign video.',
      }, 409);
    }

    const selectedPlatformSet = new Set<SocialPlatform>(selectedPlatforms);
    const campaignVideoIds = new Set(campaignVideos.map((video) => video.id.toLowerCase()));
    const campaignVideoUrls = new Set(
      campaignVideos
        .map((video) => video.outputUrl)
        .filter((url): url is string => Boolean(url)),
    );

    const postsToUpdate = editablePosts.filter((post) => {
      const platform = normalizeSocialPlatform(post.platform);
      return platform ? selectedPlatformSet.has(platform) : false;
    });

    const updatedPosts = await Promise.all(postsToUpdate.map(async (post) => {
      // Keep banner images and unrelated media, but replace any older video
      // generated by this campaign with the user's newly selected video.
      const existingMedia = post.mediaUrls ?? [];
      const nonCampaignVideoMedia = existingMedia.filter((url) => {
        const embeddedVideoId = videoIdFromMediaUrl(url);
        return !campaignVideoUrls.has(url)
          && !(embeddedVideoId && campaignVideoIds.has(embeddedVideoId));
      });
      const mediaUrls = remove
        ? nonCampaignVideoMedia
        : uniqueMediaUrls([selectedVideo!.outputUrl!, ...nonCampaignVideoMedia]);
      const [updatedPost] = await db.update(socialPosts)
        .set({ mediaUrls })
        .where(eq(socialPosts.id, post.id))
        .returning({
          id: socialPosts.id,
          platform: socialPosts.platform,
          mediaUrls: socialPosts.mediaUrls,
        });
      return updatedPost;
    }));

    return c.json({
      updated: updatedPosts.length,
      videoId: remove ? null : videoId,
      remove,
      platforms: selectedPlatforms,
      posts: updatedPosts,
    });
  },
);

// List banners
marketingEngineRouter.get('/company/:companyId/banners', async (c) => {
  const { companyId } = await requireCompanyPermission(c, 'campaign.view');
  const campaignId = c.req.query('campaignId');

  const conditions = [eq(banners.companyId, companyId)];
  if (campaignId) conditions.push(eq(banners.campaignId, campaignId));

  const items = await db.select().from(banners)
    .where(and(...conditions))
    .orderBy(desc(banners.createdAt));
  return c.json({ data: items });
});

// Approve/reject banner
marketingEngineRouter.post('/company/:companyId/banners/:id/approve', async (c) => {
  const { companyId } = await requireCompanyPermission(c, 'campaign.edit');
  const [updated] = await db.update(banners)
    .set({ status: 'approved' })
    .where(and(eq(banners.id, c.req.param('id')), eq(banners.companyId, companyId))).returning();
  return c.json(updated);
});

marketingEngineRouter.post('/company/:companyId/banners/:id/reject', async (c) => {
  const { companyId } = await requireCompanyPermission(c, 'campaign.edit');
  const [updated] = await db.update(banners)
    .set({ status: 'rejected' })
    .where(and(eq(banners.id, c.req.param('id')), eq(banners.companyId, companyId))).returning();
  return c.json(updated);
});

// Export banner to all standard ad sizes
marketingEngineRouter.post(
  '/company/:companyId/banners/:bannerId/export-sizes',
  async (c) => {
    const { companyId } = await requireCompanyPermission(c, 'campaign.edit');
    const bannerId = c.req.param('bannerId');

    // Find the source banner
    const sourceBanner = await db.select().from(banners)
      .where(and(eq(banners.id, bannerId), eq(banners.companyId, companyId)))
      .limit(1);

    if (!sourceBanner[0]) return c.json({ error: 'Banner not found' }, 404);

    const src = sourceBanner[0];
    const srcDesign = src.design as any;
    const srcCopy = src.copy as any;
    const srcSize = src.size;

    // Determine which sizes to generate (skip the source size)
    const targetSizes = AD_SIZES.filter((s) => s.size !== srcSize);

    const created: any[] = [];

    for (const target of targetSizes) {
      const { design: adaptedDesign, copy: adaptedCopy } = adaptDesignForSize(
        srcDesign,
        srcSize,
        target.size,
        { headline: srcCopy.headline, subheadline: srcCopy.subheadline, cta: srcCopy.cta },
      );

      try {
        const [banner] = await db.insert(banners).values({
          companyId,
          campaignId: src.campaignId || undefined,
          name: `${srcCopy.headline} (${target.size})`,
          size: target.size,
          status: 'draft',
          concept: src.concept,
          angle: src.angle,
          copy: {
            headline: adaptedCopy.headline,
            subheadline: adaptedCopy.subheadline,
            cta: adaptedCopy.cta,
            reasoning: srcCopy.reasoning,
            brandColor: srcCopy.brandColor,
          } as any,
          design: adaptedDesign as any,
          imageUrl: src.imageUrl,
          strategyTag: src.strategyTag,
        }).returning();
        created.push(banner);
      } catch {
        // Fallback: DB might not have new columns yet
        const [banner] = await db.insert(banners).values({
          companyId,
          campaignId: src.campaignId || undefined,
          name: `${srcCopy.headline} (${target.size})`,
          size: target.size,
          status: 'draft',
          copy: {
            headline: adaptedCopy.headline,
            subheadline: adaptedCopy.subheadline,
            cta: adaptedCopy.cta,
            reasoning: srcCopy.reasoning,
            brandColor: srcCopy.brandColor,
          } as any,
          imageUrl: src.imageUrl,
          strategyTag: src.strategyTag,
        }).returning();
        created.push({ ...banner, design: adaptedDesign, concept: src.concept, angle: src.angle });
      }
    }

    return c.json({ exported: created.length, banners: created });
  }
);

// ===============================================================
// SOCIAL POSTS — Generate + Schedule + Publish
// ===============================================================

// Generate posts
marketingEngineRouter.post(
  '/company/:companyId/posts/generate',
  zValidator('json', z.object({
    campaignId: z.string().uuid().nullish(),
    platforms: z.array(z.string()).default(['facebook', 'instagram', 'linkedin']),
    variants: z.number().min(1).max(5).default(3),
    language: z.string().default('en'),
  })),
  async (c) => {
    const { companyId } = await requireCompanyPermission(c, 'campaign.generate_ai');
    const { campaignId, platforms, variants, language } = c.req.valid('json');

    const LANG_NAMES: Record<string, string> = {
      en: 'English', vi: 'Vietnamese (Tiếng Việt)', zh: 'Chinese (中文)',
      ja: 'Japanese (日本語)', ko: 'Korean (한국어)', th: 'Thai (ภาษาไทย)',
      fr: 'French (Français)', es: 'Spanish (Español)',
    };
    const langName = LANG_NAMES[language] || 'English';
    const langInstruction = language !== 'en'
      ? `\nCRITICAL: ALL post content MUST be written in ${langName}. Do NOT write in English. Hashtags can be bilingual.`
      : '';

    // Load FULL business context
    const ctx = await buildBusinessContext(companyId);

    const { text } = await llmGenerate([{
      role: 'system',
      content: `You are a social media manager. You know this business deeply from their documents, website, and meetings. Write posts using SPECIFIC details — not generic marketing.${langInstruction}`,
    }, {
      role: 'user',
      content: `Generate social media posts for: ${platforms.join(', ')}
${language !== 'en' ? `\nLANGUAGE: Write ALL content in ${langName}.` : ''}

BUSINESS CONTEXT:
${ctx.fullContext}

BRAND VOICE: ${ctx.brandVoice.join(', ')}

VIRAL CONTENT FRAMEWORKS (use one per post):
${platforms.map((p) => getViralFrameworkPrompt(p)).join('\n\n')}

RULES:
- Each post MUST use a DIFFERENT viral framework (Transformation Story, Contrarian Take, Before/After, etc.)
- Reference SPECIFIC products, services, or value propositions from the context
- Each post platform-appropriate (LinkedIn=professional, Instagram=visual+hashtags, Facebook=conversational)
- Hook in first line (reader decides in 1.5 seconds)
- Specific > generic ("saved 4 hours/week" > "great tool")
- Include relevant hashtags based on industry keywords
- 80/20 rule: 80% value content, 20% promotional
${language !== 'en' ? `- Write everything in ${langName}. Hashtags can mix ${langName} and English for reach.` : ''}

Return ONLY JSON array:
[{
  "platform": "facebook|instagram|linkedin",
  "content": "Post caption with specific business details",
  "hashtags": ["#relevant", "#industry"]
}]

Generate ${variants} posts per platform.`,
    }], { maxTokens: 1500 });

    const parsed = extractJSON(text) || [];
    const createdPosts: any[] = [];

    for (const post of parsed.slice(0, variants * platforms.length)) {
      const [created] = await db.insert(socialPosts).values({
        companyId,
        campaignId: campaignId || undefined,
        platform: post.platform,
        content: post.content,
        hashtags: post.hashtags as any,
        mediaUrls: [],
        status: 'draft',
      }).returning();
      createdPosts.push(created);
    }

    return c.json({ generated: createdPosts.length, posts: createdPosts });
  }
);

// List posts
marketingEngineRouter.get('/company/:companyId/posts', async (c) => {
  const { companyId } = await requireCompanyPermission(c, 'campaign.view');
  const items = await db.select().from(socialPosts)
    .where(eq(socialPosts.companyId, companyId))
    .orderBy(desc(socialPosts.createdAt));
  return c.json({ data: items });
});

marketingEngineRouter.patch(
  '/company/:companyId/posts/:id',
  zValidator('json', z.object({
    content: z.string().min(1).max(5000).optional(),
    hashtags: z.array(z.string().min(1).max(80)).max(20).optional(),
    mediaUrls: z.array(z.string()).optional(),
  })),
  async (c) => {
    const { companyId } = await requireCompanyPermission(c, 'campaign.edit');
    const id = c.req.param('id');
    const body = c.req.valid('json');
    const existing = await db.query.socialPosts.findFirst({
      where: and(eq(socialPosts.id, id), eq(socialPosts.companyId, companyId)),
      columns: { id: true, status: true },
    });
    if (!existing) return c.json({ error: 'Post not found' }, 404);
    if (existing.status === 'published') {
      return c.json({
        error: 'Published posts are read-only. Open the post on its social platform to make changes.',
      }, 409);
    }
    const updates: Record<string, any> = {};
    if (body.content !== undefined) updates.content = body.content;
    if (body.hashtags !== undefined) updates.hashtags = body.hashtags;
    if (body.mediaUrls !== undefined) updates.mediaUrls = body.mediaUrls;
    const [updated] = await db.update(socialPosts)
      .set(updates)
      .where(and(eq(socialPosts.id, id), eq(socialPosts.companyId, companyId)))
      .returning();
    return c.json(updated);
  },
);

// Schedule post
marketingEngineRouter.post(
  '/company/:companyId/posts/:id/schedule',
  zValidator('json', z.object({ scheduledAt: z.string() })),
  async (c) => {
    const { companyId } = await requireCompanyPermission(c, 'campaign.launch');
    const { scheduledAt } = c.req.valid('json');
    const [updated] = await db.update(socialPosts)
      .set({ status: 'scheduled', scheduledAt: new Date(scheduledAt) })
      .where(and(eq(socialPosts.id, c.req.param('id')), eq(socialPosts.companyId, companyId))).returning();
    return c.json(updated);
  }
);

// Publish post — actually send to connected platform
marketingEngineRouter.post('/company/:companyId/posts/:id/publish', async (c) => {
  const { companyId } = await requireCompanyPermission(c, 'campaign.publish_social');
  const postId = c.req.param('id');

  // 1. Get the post
  const post = await db.query.socialPosts.findFirst({
    where: and(eq(socialPosts.id, postId), eq(socialPosts.companyId, companyId)),
  });

  if (!post) return c.json({ error: 'Post not found' }, 404);

  // 2. Map platform name (our schema uses 'facebook', 'linkedin', etc.)
  const platform = post.platform || 'facebook';

  const platformNames: Record<string, string> = {
    facebook: 'Facebook', instagram: 'Instagram', linkedin: 'LinkedIn',
    twitter: 'Twitter/X', tiktok: 'TikTok', youtube: 'YouTube',
  };

  // 3. Check if platform is connected
  const { socialConnections } = await import('@1person/core/db');
  const connection = await db.query.socialConnections.findFirst({
    where: and(
      eq(socialConnections.companyId, companyId),
      eq(socialConnections.platform, platform as any),
      eq(socialConnections.status, 'connected')
    ),
  });

  if (!connection) {
    // Platform not connected — tell user where to connect
    return c.json({
      published: false,
      error: `${platformNames[platform] || platform} is not connected. Go to Settings → Integrations to connect it first.`,
    }, 400);
  }

  // 4. Actually publish via distribution engine
  try {
    const { DistributionEngine } = await import('../services/distribution-engine');
    const distributionEngine = new DistributionEngine();

    const scheduledPostId = await distributionEngine.createPost({
      companyId,
      connectionId: connection.id,
      platform: platform as any,
      contentText: post.content || '',
      hashtags: (post.hashtags as string[]) || [],
      mediaUrls: (post.mediaUrls as string[]) || [],
      scheduledFor: new Date(),
    });

    const result = await distributionEngine.publishPost(scheduledPostId);

    if (result.success) {
      // Update social post status
      await db.update(socialPosts).set({
        status: 'published',
        publishedAt: new Date(),
      }).where(eq(socialPosts.id, postId));

      return c.json({
        published: true,
        platformPostId: result.platformPostId,
        platformPostUrl: result.platformPostUrl,
        message: `Published to ${platformNames[platform] || platform}!`,
      });
    } else {
      return c.json({
        published: false,
        error: result.error || 'Could not publish. Please try again.',
      }, 500);
    }
  } catch (err) {
    console.error('[Marketing] Social post publish failed:', err);
    return c.json({
      published: false,
      error: 'Publishing failed. Please try again.',
    }, 500);
  }
});

// ===============================================================
// EMAIL SEQUENCES — Generate 7-email drip sequence
// ===============================================================

marketingEngineRouter.post(
  '/company/:companyId/emails/generate',
  zValidator('json', z.object({
    campaignId: z.string().uuid().nullish(),
    goal: z.string().default('nurture leads'),
  })),
  async (c) => {
    const { companyId } = await requireCompanyPermission(c, 'campaign.generate_ai');
    const { campaignId, goal } = c.req.valid('json');
    const ctx = await buildBusinessContext(companyId);

    const sequenceTemplate = EMAIL_SEQUENCE_FRAMEWORK.map((e) =>
      `Day ${e.day} (${e.type}): ${e.purpose}`
    ).join('\n');

    const subjectFormulas = EMAIL_SUBJECT_FORMULAS.join('\n');

    const { text } = await llmGenerate([{
      role: 'system',
      content: 'You are an email marketing expert. Create a 7-email nurture sequence that converts leads into customers.',
    }, {
      role: 'user',
      content: `Generate a 7-email drip sequence for this business.

BUSINESS CONTEXT:
${ctx.fullContext}

GOAL: ${goal}

SEQUENCE FRAMEWORK:
${sequenceTemplate}

SUBJECT LINE FORMULAS:
${subjectFormulas}

Return ONLY JSON array:
[{
  "day": 0,
  "type": "welcome|value|value_soft|soft_sell|hard_sell|objection|followup",
  "subject": "Email subject line",
  "preview": "Preview text (50 chars)",
  "body": "Full email body (2-4 paragraphs, with CTA)",
  "cta": "CTA button text"
}]

Rules:
- Use SPECIFIC business details from context
- Subject lines must use proven formulas
- Each email builds on the previous
- Include clear CTA in every email
- Tone matches brand voice: ${ctx.brandVoice.join(', ')}`,
    }], { maxTokens: 3000 });

    const emails = extractJSON(text) || [];
    return c.json({ data: emails, count: emails.length });
  }
);

// ===============================================================
// KEYWORD CLUSTERS — Hub-and-Spoke architecture
// ===============================================================

marketingEngineRouter.post(
  '/company/:companyId/keyword-clusters',
  async (c) => {
    const { companyId } = await requireCompanyPermission(c, 'campaign.generate_ai');
    const ctx = await buildBusinessContext(companyId);

    const { text } = await llmGenerate([{
      role: 'system',
      content: 'You are an SEO strategist. Generate a hub-and-spoke keyword architecture for topical authority.',
    }, {
      role: 'user',
      content: `Generate keyword clusters for this business.

BUSINESS CONTEXT:
${ctx.fullContext}

${KEYWORD_CLUSTER_PROMPT}

Return ONLY JSON:
{
  "clusters": [{
    "hub": {"keyword": "broad keyword", "volume": "high", "intent": "commercial", "pageType": "pillar"},
    "spokes": [
      {"keyword": "long-tail keyword", "volume": "medium", "intent": "informational|commercial|transactional", "pageType": "blog|comparison|tutorial"}
    ]
  }]
}

Generate 3 clusters with 4-5 spokes each. Be specific to this business.`,
    }], { maxTokens: 1500 });

    const parsed = extractJSON(text);
    return c.json({ data: parsed?.clusters || [] });
  }
);

// ===============================================================
// AI RECOMMENDATIONS — Pre-built campaign ideas from business context
// ===============================================================

marketingEngineRouter.get('/company/:companyId/recommendations', async (c) => {
  const { companyId } = await requireCompanyPermission(c, 'campaign.generate_ai');

  // Load FULL business context
  const ctx = await buildBusinessContext(companyId);

  try {
    const { text } = await llmGenerate([{
      role: 'system',
      content: 'You are a marketing strategist with deep knowledge of this business. Recommend campaigns based on REAL business data.',
    }, {
      role: 'user',
      content: `Recommend 3 marketing campaigns.

BUSINESS CONTEXT:
${ctx.fullContext}

RULES:
- Campaigns must be specific to THIS business (reference real products/services)
- Include reasoning based on actual business data
- Suggest realistic daily budgets

Return ONLY JSON array:
[{
  "name": "Specific campaign name",
  "goal": "traffic|leads|conversions|awareness",
  "platform": "google|meta|manual",
  "description": "What this campaign does — specific to the business",
  "suggestedBudget": "10",
  "reasoning": "Why this campaign based on business context"
}]`,
    }], { maxTokens: 1000 });

    const recommendations = extractJSON(text) || [];
    return c.json({ data: recommendations });
  } catch {
    return c.json({ data: [] });
  }
});

// ===============================================================
// SYSTEM-GENERATED CAMPAIGNS — from Intelligence + Content Plan
// This is the correct flow: system generates, user approves
// ===============================================================

marketingEngineRouter.post('/company/:companyId/auto-campaigns', async (c) => {
  const { companyId } = await requireCompanyPermission(c, 'campaign.generate_ai');
  const ctx = await buildBusinessContext(companyId);

  // Load landing pages (DEPLOYMENT layer)
  const { landingPages: lpTable } = await import('@1person/core/db');
  const landingPagesList = await db.select()
    .from(lpTable)
    .where(eq(lpTable.companyId, companyId))
    .limit(10);

  // Build page context for LLM
  const pagesContext = landingPagesList.map((p) => {
    const bctx = p.businessContext as any;
    return `- "${p.name}" (keyword: ${bctx?.keyword || 'N/A'}, intent: ${bctx?.searchIntent || 'N/A'}, status: ${p.status})`;
  }).join('\n');

  try {
    const { text } = await llmGenerate([{
      role: 'system',
      content: `You are a marketing strategist. Generate campaigns that are DERIVED from the company's content plan, keywords, and landing pages. Every campaign must trace back to a specific keyword cluster or landing page.`,
    }, {
      role: 'user',
      content: `Generate marketing campaigns based on the EXISTING content and intelligence.

BUSINESS CONTEXT (from Intelligence layer):
${ctx.fullContext}

EXISTING LANDING PAGES (from Deployment layer):
${pagesContext || 'No landing pages yet'}

RULES:
- Each campaign MUST be based on a specific landing page or keyword
- Include "source" field showing what intelligence it's derived from
- Include "landingPageName" linking to the relevant page
- Include "contentCluster" showing the keyword topic
- This is part of an autonomous growth system — campaigns run themselves

Return ONLY JSON array:
[{
  "name": "Campaign name based on content",
  "goal": "traffic|leads|conversions",
  "platform": "google|meta|linkedin",
  "budgetDaily": "10",
  "source": {
    "type": "landing_page|keyword_cluster|knowledge",
    "reference": "Name of the landing page or keyword",
    "reasoning": "Why this campaign exists — what intelligence drove it"
  },
  "landingPageName": "Name of related landing page",
  "contentCluster": "Keyword cluster this targets",
  "audience": "Specific target audience",
  "angles": ["pain", "benefit", "social-proof"]
}]

Generate 2-3 campaigns. Each must be traceable to system intelligence.`,
    }], { maxTokens: 1500 });

    const parsed = extractJSON(text) || [];

    // Create campaigns + auto-generate creatives
    const created = [];
    for (const rec of parsed.slice(0, 3)) {
      // Find matching landing page
      const matchedPage = landingPagesList.find((p) =>
        p.name.toLowerCase().includes((rec.landingPageName || '').toLowerCase().split(' ')[0])
      );

      const [campaign] = await db.insert(campaigns).values({
        companyId,
        name: rec.name,
        goal: (rec.goal || 'traffic') as any,
        platform: (rec.platform || 'meta') as any,
        budgetDaily: rec.budgetDaily || '10',
        targeting: {
          audience: rec.audience,
          source: rec.source,
          contentCluster: rec.contentCluster,
          landingPageId: matchedPage?.id,
        } as any,
        landingPageUrl: matchedPage?.slug ? `/${matchedPage.slug}` : undefined,
        status: 'draft',
      }).returning();
      if (!campaign) continue;

      // Auto-generate banners for this campaign
      try {
        await fetch(`${c.req.url.split('/auto-campaigns')[0]}/company/${companyId}/banners/generate`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': c.req.header('Authorization') || '',
          },
          body: JSON.stringify({ campaignId: campaign.id, size: '1200x628', variants: 3 }),
        });
      } catch {}

      // Auto-generate posts
      try {
        await fetch(`${c.req.url.split('/auto-campaigns')[0]}/company/${companyId}/posts/generate`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': c.req.header('Authorization') || '',
          },
          body: JSON.stringify({ campaignId: campaign.id, platforms: ['facebook', 'linkedin'], variants: 2 }),
        });
      } catch {}

      created.push({ ...campaign, source: rec.source });
    }

    return c.json({ campaigns: created, count: created.length });
  } catch (err) {
    return c.json({ campaigns: [], count: 0, error: 'Failed to generate campaigns' });
  }
});

// ===============================================================
// BANNER QUALITY VALIDATION
// ===============================================================

marketingEngineRouter.post('/company/:companyId/banners/:bannerId/validate', async (c) => {
  const { companyId } = await requireCompanyPermission(c, 'campaign.edit');
  const bannerId = c.req.param('bannerId');

  const banner = await db.select().from(banners)
    .where(and(eq(banners.id, bannerId), eq(banners.companyId, companyId)))
    .limit(1);

  if (!banner[0]) return c.json({ error: 'Banner not found' }, 404);

  const b = banner[0];
  const copy = b.copy as any;
  const design = b.design as any;

  if (!copy || !design) {
    return c.json({ error: 'Banner missing copy or design data' }, 400);
  }

  const report = validateBanner({
    copy: {
      headline: copy.headline || '',
      subheadline: copy.subheadline,
      cta: copy.cta || '',
    },
    design: {
      colorTheme: design.colorTheme || { text: '#ffffff', ctaBg: '#ffffff', primary: '#000000' },
      layout: design.layout || 'center',
    },
    size: b.size,
  });

  return c.json(report);
});

// ===============================================================
// VIDEO ENGINE — Generate + List + Update
// ===============================================================

// Generate video script + auto-break into scenes
marketingEngineRouter.post(
  '/company/:companyId/videos/generate',
  zValidator('json', z.object({
    campaignId: z.string().uuid().nullish(),
    format: z.enum(['15s', '30s', '60s']).default('15s'),
    aspectRatio: z.enum(['9:16', '16:9', '1:1']).default('9:16'),
    render: z.boolean().optional().default(false),
    creativeNotes: z.string().max(1200).optional(),
    forceNew: z.boolean().optional().default(false),
    language: z.string().optional(),
    referenceImage: z.object({
      type: z.enum(['asset', 'google_drive', 'onedrive']),
      assetId: z.string().uuid().optional(),
      fileId: z.string().min(5).max(300).optional(),
      fileName: z.string().max(255).optional(),
    }).optional(),
  })),
  async (c) => {
    const { companyId, userId } = await requireCompanyPermission(c, 'campaign.generate_ai');
    const { campaignId, format, aspectRatio, render, creativeNotes, forceNew, language, referenceImage } = c.req.valid('json');

    try {
      if (render) {
        if (!campaignId) {
          return c.json({ error: 'Campaign is required to render an AI video.' }, 400);
        }
        if (aspectRatio === '1:1') {
          return c.json({ error: 'AI video rendering currently supports 9:16 and 16:9.' }, 400);
        }
        await ensureSufficientCredits(companyId, FIXED_CREDIT_COSTS.campaignVideo);
        const project = await createCampaignVideoProject({
          companyId,
          campaignId,
          userId,
          format,
          aspectRatio,
          creativeNotes,
          forceNew,
          language,
          referenceImage: referenceImage?.type === 'asset' && referenceImage.assetId
            ? { type: 'asset', assetId: referenceImage.assetId }
            : referenceImage?.type === 'google_drive' && referenceImage.fileId
              ? { type: 'google_drive', fileId: referenceImage.fileId, fileName: referenceImage.fileName }
              : referenceImage?.type === 'onedrive' && referenceImage.fileId
                ? { type: 'onedrive', fileId: referenceImage.fileId, fileName: referenceImage.fileName }
                : undefined,
        });
        return c.json(project);
      }

      // Step 1: Generate script
      const { title, script } = await generateScript(companyId, { format, aspectRatio, language });

      // Create video project with script
      const [project] = await db.insert(videoProjects).values({
        companyId,
        campaignId: campaignId || undefined,
        title,
        format,
        aspectRatio,
        status: 'script',
        script: script as any,
        scenes: [] as any,
      }).returning();
      if (!project) {
        throw new Error('Video project could not be created.');
      }

      // Step 2: Auto-break into scenes
      const scenes = await breakIntoScenes(script, format);

      const [updated] = await db.update(videoProjects)
        .set({
          status: 'scenes',
          scenes: scenes as any,
          updatedAt: new Date(),
        })
        .where(eq(videoProjects.id, project.id))
        .returning();

      return c.json(updated);
    } catch (err) {
      if (err instanceof HTTPException) throw err;
      if (err instanceof UnsupportedVideoReferenceImageError) {
        return c.json({ error: err.message }, 400);
      }
      console.error('[Video] Script generation failed:', err);
      return c.json({
        error: 'Failed to generate video script. Please try again.',
      }, 500);
    }
  }
);

marketingEngineRouter.get('/company/:companyId/videos/:id', async (c) => {
  const { companyId } = await requireCompanyPermission(c, 'campaign.view');
  const id = c.req.param('id');
  const [project] = await db.select().from(videoProjects)
    .where(and(eq(videoProjects.id, id), eq(videoProjects.companyId, companyId)))
    .limit(1);
  if (!project) return c.json({ error: 'Video project not found' }, 404);
  return c.json(project);
});

marketingEngineRouter.delete('/company/:companyId/videos/:id', async (c) => {
  const { companyId } = await requireCompanyPermission(c, 'campaign.edit');
  const id = c.req.param('id');
  const [project] = await db.select().from(videoProjects)
    .where(and(eq(videoProjects.id, id), eq(videoProjects.companyId, companyId)))
    .limit(1);
  if (!project) return c.json({ error: 'Video project not found' }, 404);
  if (project.status !== 'failed') {
    return c.json({ error: 'Only failed videos can be removed from this campaign.' }, 409);
  }

  const assetUrls = [
    project.outputUrl,
    project.thumbnailUrl,
  ].filter((url): url is string => Boolean(url));

  await db.delete(videoProjects)
    .where(and(eq(videoProjects.id, id), eq(videoProjects.companyId, companyId)));
  await deleteStoredAssetsIfUnreferenced(assetUrls, { companyId });

  return c.json({ deleted: true, videoId: id });
});

// List video projects
marketingEngineRouter.get('/company/:companyId/videos', async (c) => {
  const { companyId } = await requireCompanyPermission(c, 'campaign.view');
  const items = await db.select().from(videoProjects)
    .where(eq(videoProjects.companyId, companyId))
    .orderBy(desc(videoProjects.createdAt));
  return c.json({ data: items });
});

// Update video project (edit script/scenes)
marketingEngineRouter.patch(
  '/company/:companyId/videos/:id',
  async (c) => {
    const { companyId } = await requireCompanyPermission(c, 'campaign.edit');
    const id = c.req.param('id');
    const body = await c.req.json();

    const updates: Record<string, any> = { updatedAt: new Date() };
    if (body.title) updates.title = body.title;
    if (body.script) updates.script = body.script;
    if (body.scenes) updates.scenes = body.scenes;
    if (body.status) updates.status = body.status;

    const [updated] = await db.update(videoProjects)
      .set(updates)
      .where(and(eq(videoProjects.id, id), eq(videoProjects.companyId, companyId)))
      .returning();

    if (!updated) return c.json({ error: 'Video project not found' }, 404);
    return c.json(updated);
  }
);

marketingEngineRouter.post('/company/:companyId/videos/:id/imgly-export', async (c) => {
  const { companyId } = await requireCompanyPermission(c, 'campaign.edit');
  const id = c.req.param('id');
  const formData = await c.req.formData();
  const file = formData.get('file') as File | null;
  const scene = formData.get('scene');
  const duration = formData.get('duration');

  if (!file) return c.json({ error: 'Missing exported video file.' }, 400);
  if (!file.type.startsWith('video/')) return c.json({ error: 'Export must be a video file.' }, 400);
  if (file.size > 200 * 1024 * 1024) return c.json({ error: 'Video is too large. Please export a file under 200MB.' }, 400);

  const [existing] = await db.select().from(videoProjects)
    .where(and(eq(videoProjects.id, id), eq(videoProjects.companyId, companyId)))
    .limit(1);
  if (!existing) return c.json({ error: 'Video project not found' }, 404);

  const bytes = Buffer.from(await file.arrayBuffer());
  const extension = file.type.includes('webm') ? 'webm' : 'mp4';
  const exportVersion = Date.now();
  const savedVideo = await saveObject({
    key: `campaigns/${companyId}/${existing.campaignId ?? 'standalone'}/videos/${id}/imgly-video-${id}-current.${extension}`,
    body: bytes,
    contentType: file.type || 'video/mp4',
    cacheControl: 'public, max-age=60, must-revalidate',
  });
  const outputUrl = `${savedVideo.url}?v=${exportVersion}`;
  const currentScript = (existing.script as Record<string, any> | null) ?? {};

  const [updated] = await db.update(videoProjects)
    .set({
      status: 'ready',
      outputUrl,
      script: {
        ...currentScript,
        imglyScene: typeof scene === 'string' ? scene : currentScript.imglyScene,
        imglySceneVideoUrl: outputUrl,
        imglyDurationSeconds: typeof duration === 'string' ? Number(duration) || undefined : undefined,
        imglyUpdatedAt: new Date().toISOString(),
      } as any,
      updatedAt: new Date(),
    })
    .where(and(eq(videoProjects.id, id), eq(videoProjects.companyId, companyId)))
    .returning();

  if (!updated) return c.json({ error: 'Video project could not be updated.' }, 500);
  return c.json({ video: updated });
});

// ===============================================================
// UTM TRACKING LINKS — Generate UTM-tagged links for campaigns
// ===============================================================

marketingEngineRouter.get('/company/:companyId/campaigns/:id/tracking-links', async (c) => {
  const { companyId } = await requireCompanyPermission(c, 'campaign.view');
  const id = c.req.param('id');

  const campaign = await db.query.campaigns.findFirst({
    where: and(eq(campaigns.id, id), eq(campaigns.companyId, companyId)),
  });
  if (!campaign) return c.json({ error: 'Campaign not found' }, 404);

  // Get banners for this campaign
  const campaignBanners = await db.select().from(banners)
    .where(and(eq(banners.campaignId, id), eq(banners.companyId, companyId)));

  // Base URL from landing page URL or company domain
  const baseUrl = campaign.landingPageUrl || '/';

  // Platform to utm_source mapping
  const platformSourceMap: Record<string, string> = {
    google: 'google',
    meta: 'facebook',
    linkedin: 'linkedin',
    manual: 'manual',
  };

  const utmSource = platformSourceMap[campaign.platform] || campaign.platform;
  const utmMedium = campaign.goal === 'traffic' ? 'cpc' : 'paid';
  const utmCampaign = encodeURIComponent(campaign.name.replace(/\s+/g, '_').toLowerCase());

  // Generate links — one per creative + one generic
  const links: Array<{
    label: string;
    url: string;
    bannerId?: string;
    bannerName?: string;
  }> = [];

  // Generic campaign link (no specific creative)
  const genericParams = `utm_source=${utmSource}&utm_medium=${utmMedium}&utm_campaign=${utmCampaign}`;
  links.push({
    label: 'Campaign link (generic)',
    url: `${baseUrl}${baseUrl.includes('?') ? '&' : '?'}${genericParams}`,
  });

  // Per-banner links with utm_content = banner ID
  for (const banner of campaignBanners) {
    const copy = banner.copy as any;
    const bannerParams = `${genericParams}&utm_content=${banner.id}`;
    links.push({
      label: copy?.headline || banner.name,
      url: `${baseUrl}${baseUrl.includes('?') ? '&' : '?'}${bannerParams}`,
      bannerId: banner.id,
      bannerName: banner.name,
    });
  }

  return c.json({
    campaignId: id,
    campaignName: campaign.name,
    platform: campaign.platform,
    links,
  });
});

export default marketingEngineRouter;
