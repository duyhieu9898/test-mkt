/**
 * Campaign Spine — W1B.1 + W1B.2 + W1B.4
 *
 * Single "connecting button" API for the 1-click campaign flow:
 *   POST   /v1/campaigns/:companyId/generate   kick off an AI campaign
 *   GET    /v1/campaigns/:companyId            list campaigns
 *   GET    /v1/campaigns/:companyId/:id        detail with banners + posts
 *   GET    /v1/campaigns/:companyId/:id/stream Server-Sent Events progress
 *
 * The stream surface powers the Live Workflow Visualization panel in the
 * web app (W1B.4): each step.started / step.completed / step.failed event
 * is pushed over SSE so the user sees the AI working in real time.
 *
 * Uses the existing MarketingAutonomous service (unchanged for autonomous
 * callers — the new onStep callback is optional).
 *
 * Docs: docs/architecture/07-marketing-execution-roadmap.md §4 Campaign spine
 */

import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { db } from '../lib/db';
import { campaigns, banners, socialPosts, companies, campaignLaunches, blogPosts, videoProjects } from '@1person/core/db';
import { authMiddleware } from '../middleware/auth';
import { HTTPException } from 'hono/http-exception';
import type { CampaignStepEvent } from '../services/marketing-autonomous';
import { eventBus, type Event as BusEvent } from '../services/event-bus';
import { snapshotToPromptBlock } from '@1person/ai-tenant';
import { getTenantAI, ensureTenantForCompany } from '../lib/tenant-ai';
import { ensureSufficientCredits, chargeForLLMCall, chargeFixedCredits } from '../lib/credits';
import { resolveFeature, resolveImageProvider } from '../lib/config-resolver';
import { llmGenerate, extractJSON } from '../lib/llm';
import {
  CAMPAIGN_BANNER_PALETTE,
  renderContextualCampaignBanner,
} from '../services/campaign-banner-creative';
import {
  applyBrandKitToBannerTheme,
  brandCreativeKitSnapshot,
  buildBrandCreativeKit,
  buildBrandFitSummary,
  renderBrandCreativeKitPrompt,
} from '../services/brand-creative-kit';
import { buildEffectiveSourceContext } from '../services/source-content-import';
import { createCampaignBlog } from '../services/campaign-blog';
import { buildCampaignName } from '../services/campaign-name';
import {
  findActiveFbConnection,
  isFacebookReconnectRequiredError,
  publishPagePost,
} from '../services/channels/fb-messenger';
import {
  generateCampaignSocialPosts,
  normalizeSocialPost,
} from '../services/campaign-social-generator';
import {
  getCampaignPerformance,
  syncCampaignFacebookPerformance,
} from '../services/campaign-performance';
import {
  buildContentLanguageInstruction,
  localizedDefault,
  normalizeContentLanguage,
} from '../lib/language';
import { syncCampaignVideoProject } from '../services/campaign-video-creative';

const campaignsRouter = new Hono();

campaignsRouter.use('*', authMiddleware);

const launchCampaignBodySchema = z.object({
  bannerIds: z.array(z.string().uuid()).optional().default([]),
  socialPostIds: z.array(z.string().uuid()).optional().default([]),
  activateBanners: z.boolean().optional().default(true),
  scheduleSocialPosts: z.boolean().optional().default(true),
});

const publishCampaignFacebookBodySchema = z.object({
  postIds: z.array(z.string().uuid()).optional(),
  includeImages: z.boolean().optional().default(true),
});

const CAMPAIGN_SOCIAL_PLATFORMS = ['facebook', 'instagram', 'linkedin'] as const;
type CampaignSocialPlatform = typeof CAMPAIGN_SOCIAL_PLATFORMS[number];

// ─── helpers ────────────────────────────────────────────────────────

/**
 * Publish a campaign step event on the shared event bus so the SSE
 * stream endpoint can forward it to the browser. We reuse the existing
 * 'system:broadcast' event type to avoid widening the EventType union.
 */
function publishStep(
  companyId: string,
  campaignId: string,
  ev: CampaignStepEvent,
) {
  eventBus.publish({
    type: 'system:broadcast',
    companyId,
    source: 'campaign-generator',
    payload: {
      kind: 'campaign:step',
      campaignId,
      ...ev,
    },
  });
}

function buildCampaignTrackingUrl(
  campaign: typeof campaigns.$inferSelect,
  socialPostId: string,
): string | null {
  if (!campaign.landingPageUrl) return null;
  try {
    const url = new URL(campaign.landingPageUrl);
    url.searchParams.set('utm_id', campaign.id);
    url.searchParams.set('utm_source', 'facebook');
    url.searchParams.set('utm_medium', 'organic_social');
    url.searchParams.set(
      'utm_campaign',
      campaign.name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 100),
    );
    url.searchParams.set('utm_content', socialPostId);
    return url.toString();
  } catch {
    // Relative/local destinations cannot be opened by Facebook visitors, so
    // publishing continues without adding a misleading tracking link.
    return null;
  }
}

function buildFacebookPostMessage(
  post: typeof socialPosts.$inferSelect,
  campaign?: typeof campaigns.$inferSelect,
): string {
  const normalized = normalizeSocialPost(post.content, post.hashtags);
  const hashtags = normalized.hashtags.map((tag) => `#${tag}`);
  const message = hashtags.length > 0
    ? `${normalized.content}\n\n${hashtags.join(' ')}`
    : normalized.content;
  const trackingUrl = campaign ? buildCampaignTrackingUrl(campaign, post.id) : null;
  return trackingUrl ? `${message}\n\n${trackingUrl}` : message;
}

function getFacebookReadyMediaUrls(mediaUrls: string[] | null | undefined): {
  valid: string[];
  mediaType?: 'image' | 'video';
  invalidReason?: string;
} {
  const urls = (mediaUrls ?? []).filter(Boolean);
  if (urls.length === 0) return { valid: [] };
  const publicApiOrigin = (
    process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8004/api/v1'
  ).replace(/\/api\/v1\/?$/, '');

  const valid: string[] = [];
  for (const rawUrl of urls) {
    if (rawUrl.startsWith('data:')) {
      return { valid, invalidReason: 'Facebook cannot publish data: media URLs. Save the media as a hosted file first.' };
    }
    let parsed: URL;
    try {
      parsed = rawUrl.startsWith('/')
        ? new URL(rawUrl, publicApiOrigin)
        : new URL(rawUrl);
    } catch {
      return { valid, invalidReason: 'Facebook image URLs must be absolute public URLs.' };
    }
    const host = parsed.hostname.toLowerCase();
    if (host === 'localhost' || host === '127.0.0.1' || host.endsWith('.local')) {
      return { valid, invalidReason: 'Facebook cannot fetch localhost images. Use a public HTTPS image URL.' };
    }
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
      return { valid, invalidReason: 'Facebook image URLs must use http or https.' };
    }
    valid.push(parsed.toString());
  }

  const videos = valid.filter((url) => {
    const decoded = (() => {
      try {
        return decodeURIComponent(url);
      } catch {
        return url;
      }
    })().toLowerCase();
    const pathname = (() => {
      try {
        return new URL(decoded).pathname;
      } catch {
        return decoded.split('?')[0] ?? decoded;
      }
    })();
    return /\.(mp4|mov|m4v|webm)$/i.test(pathname)
      || /\.(mp4|mov|m4v|webm)(?:$|[?#&])/i.test(decoded)
      || decoded.includes('/videos/');
  });

  // Facebook's simple Page publish flow uses either a video upload or photo
  // upload. If a campaign post has both, publish the campaign video first and
  // leave additional images for future multi-media support.
  const firstVideo = videos[0];
  if (firstVideo) {
    return { valid: [firstVideo], mediaType: 'video' };
  }

  return { valid, mediaType: valid.length > 0 ? 'image' : undefined };
}

function normalizeCampaignSocialPlatform(value: unknown): CampaignSocialPlatform | null {
  const normalized = String(value ?? '').toLowerCase().trim();
  if (normalized === 'fb' || normalized === 'facebook') return 'facebook';
  if (normalized === 'ig' || normalized === 'instagram') return 'instagram';
  if (normalized === 'li' || normalized === 'linkedin') return 'linkedin';
  return null;
}


// ─── POST /:companyId/generate — kick off a campaign ────────────────

const generateSchema = z.object({
  goal: z.string().min(3).max(500),
  audience: z.string().min(3).max(500),
  reason: z.string().min(3).max(1000).optional(),
  suggestedBudget: z.number().positive().optional(),
  channel: z.string().optional(),
  googleDriveFileId: z.string().min(5).max(200).optional(),
  googleDriveFileName: z.string().max(255).optional(),
  googleDriveUrl: z.string().url().max(1000).optional(),
  oneDriveFileId: z.string().min(5).max(200).optional(),
  oneDriveFileName: z.string().max(255).optional(),
  offer: z.string().max(250).optional(),
  contentTopic: z.string().max(250).optional(),
  contentAngle: z.string().max(500).optional(),
  expectedOutcome: z.string().max(500).optional(),
  advisorBriefId: z.string().uuid().optional(),
  advisorActionIndex: z.number().int().min(0).max(50).optional(),
  advisorActionTitle: z.string().max(255).optional(),
  advisorEvidenceIds: z.array(z.string().max(255)).max(10).optional(),
  language: z.string().optional(),
  /** Quality tier — 'fast' | 'balanced' | 'premium'. Default balanced. */
  tier: z.enum(['fast', 'balanced', 'premium']).default('balanced'),
});

type GenerateCampaignInput = z.infer<typeof generateSchema> & {
  sourceContext?: string;
};

function cleanBriefText(value: unknown, maxLength = 500): string {
  return String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength);
}

function firstMeaningfulSentence(value: unknown, maxLength = 220): string {
  const text = cleanBriefText(value, 1000);
  const [firstParagraph = text] = text.split(/\s+(?:Impact|Expected outcome|Evidence):/i);
  const [firstSentence = firstParagraph] = firstParagraph.split(/(?<=[.!?])\s+/);
  return cleanBriefText(firstSentence, maxLength);
}

function stringifyForPrompt(value: unknown, maxLength = 12_000): string {
  const text = typeof value === 'string'
    ? value
    : JSON.stringify(value, null, 2);
  return cleanBriefText(text, maxLength);
}

function normalizeAdvisorCampaignBridge(parsed: any, fallback: {
  action: any;
  proposal: any;
  evidence: any[];
}) {
  const evidence = Array.isArray(parsed?.evidenceToUse)
    ? parsed.evidenceToUse
      .map((item: unknown) => cleanBriefText(item, 260))
      .filter(Boolean)
      .slice(0, 5)
    : [];
  const doNotSay = Array.isArray(parsed?.doNotSay)
    ? parsed.doNotSay
      .map((item: unknown) => cleanBriefText(item, 180))
      .filter(Boolean)
      .slice(0, 4)
    : [];

  return {
    campaignDirection: cleanBriefText(
      parsed?.campaignDirection
        ?? fallback.action?.recommendation
        ?? fallback.action?.why
        ?? fallback.proposal?.goal,
      900,
    ),
    customerTopic: cleanBriefText(
      parsed?.customerTopic
        ?? fallback.proposal?.publicTopic
        ?? fallback.proposal?.goal,
      260,
    ),
    customerAngle: cleanBriefText(
      parsed?.customerAngle
        ?? fallback.proposal?.contentAngle
        ?? fallback.action?.marketContext
        ?? fallback.action?.recommendation,
      600,
    ),
    marketSignal: cleanBriefText(
      parsed?.marketSignal
        ?? fallback.action?.marketContext
        ?? fallback.action?.strategicGap?.marketSignal,
      650,
    ),
    evidenceToUse: evidence.length
      ? evidence
      : fallback.evidence
        .map((item) => cleanBriefText(`${item?.label ?? 'Evidence'}: ${item?.detail ?? ''}${item?.link ? ` Source: ${item.link}` : ''}`, 260))
        .filter(Boolean)
        .slice(0, 4),
    doNotSay,
    expectedOutcome: cleanBriefText(
      parsed?.expectedOutcome
        ?? fallback.proposal?.expectedOutcome
        ?? fallback.action?.expectedImpact
        ?? fallback.action?.impact,
      450,
    ),
  };
}

async function buildAdvisorCampaignSourceContext(args: {
  companyId: string;
  companyName: string;
  input: GenerateCampaignInput;
}): Promise<string | undefined> {
  const { companyId, companyName, input } = args;
  if (!input.advisorBriefId || typeof input.advisorActionIndex !== 'number') return undefined;

  const tenantId = await ensureTenantForCompany(companyId, companyName);
  const briefs = await getTenantAI().ceoAdvisor.list(tenantId, 20);
  const brief = briefs.find((item) => item.id === input.advisorBriefId);
  const action = brief?.actions?.[input.advisorActionIndex];
  if (!brief || !action) return undefined;

  const proposal = (action as any).campaignProposal ?? {};
  const allEvidence = Array.isArray((action as any).evidence) ? (action as any).evidence : [];
  const selectedEvidence = input.advisorEvidenceIds?.length
    ? allEvidence.filter((item: any) => input.advisorEvidenceIds?.includes(String(item?.id ?? '')))
    : allEvidence;
  const evidence = selectedEvidence.length ? selectedEvidence : allEvidence.slice(0, 4);

  const rawAdvisorContext = {
    headline: brief.headline,
    generatedAt: brief.generatedAt,
    issue: (action as any).issue ?? (action as any).title,
    priority: (action as any).priority ?? (action as any).severity,
    marketContext: (action as any).marketContext,
    evidenceSummary: (action as any).evidenceSummary ?? (action as any).why,
    recommendation: (action as any).recommendation ?? (action as any).why,
    todayMove: (action as any).todayMove,
    sevenDayMove: (action as any).sevenDayMove,
    expectedImpact: (action as any).expectedImpact ?? (action as any).impact,
    strategicGap: (action as any).strategicGap,
    campaignProposal: proposal,
    evidence,
  };

  try {
    const llmRes = await llmGenerate(
      [
        {
          role: 'system',
          content: `You are a senior marketing strategist. Convert a CEO Advisor recommendation into a compact campaign execution brief.
Use the raw evidence carefully. Do not invent facts. Preserve the market signal, proof, audience, offer, positioning angle, and expected outcome.
The output is for another AI that will create public blog posts, social posts, banners, and video. Keep internal CEO wording separate from customer-facing messaging.`,
        },
        {
          role: 'user',
          content: `Company: ${companyName}

Raw CEO Advisor recommendation:
${stringifyForPrompt(rawAdvisorContext)}

Return ONLY JSON:
{
  "campaignDirection": "Internal strategy in 2-4 sentences. Include issue, evidence, recommendation and why now.",
  "customerTopic": "Customer-facing topic, not an internal CEO task title.",
  "customerAngle": "Customer-facing angle that explains the offer's differentiated value.",
  "marketSignal": "Most important market/competitor signal to account for.",
  "evidenceToUse": ["Short factual evidence item with source if available"],
  "expectedOutcome": "Expected business/customer outcome.",
  "doNotSay": ["Internal phrases that must not appear in public content"]
}`,
        },
      ],
      {
        featureKey: 'ceo_advisor_brief',
        tier: 'fast',
        json: true,
        maxTokens: 1100,
        traceName: 'campaigns.advisorCampaignBridge',
        metadata: {
          companyId,
          advisorBriefId: input.advisorBriefId,
          advisorActionIndex: input.advisorActionIndex,
        },
      },
    );
    await chargeForLLMCall(companyId, llmRes, {
      featureKey: 'campaign_advisor_bridge',
      refKind: 'ceo_advisor_action',
      refId: input.advisorBriefId,
    });

    const bridge = normalizeAdvisorCampaignBridge(extractJSON(llmRes.text), {
      action,
      proposal,
      evidence,
    });
    return [
      'CEO ADVISOR CAMPAIGN EXECUTION BRIEF:',
      `Internal campaign direction: ${bridge.campaignDirection}`,
      `Customer-facing topic: ${bridge.customerTopic}`,
      `Customer-facing angle: ${bridge.customerAngle}`,
      bridge.marketSignal ? `Market signal to reflect: ${bridge.marketSignal}` : '',
      bridge.evidenceToUse.length ? `Evidence to use:\n- ${bridge.evidenceToUse.join('\n- ')}` : '',
      bridge.expectedOutcome ? `Expected outcome: ${bridge.expectedOutcome}` : '',
      bridge.doNotSay.length ? `Do not copy these internal phrases into public content:\n- ${bridge.doNotSay.join('\n- ')}` : '',
    ].filter(Boolean).join('\n');
  } catch (err) {
    console.warn('[campaigns.advisorCampaignBridge] AI bridge failed, using deterministic fallback:', err);
    const bridge = normalizeAdvisorCampaignBridge({}, {
      action,
      proposal,
      evidence,
    });
    return [
      'CEO ADVISOR CAMPAIGN EXECUTION BRIEF:',
      `Internal campaign direction: ${bridge.campaignDirection}`,
      `Customer-facing topic: ${bridge.customerTopic}`,
      `Customer-facing angle: ${bridge.customerAngle}`,
      bridge.marketSignal ? `Market signal to reflect: ${bridge.marketSignal}` : '',
      bridge.evidenceToUse.length ? `Evidence to use:\n- ${bridge.evidenceToUse.join('\n- ')}` : '',
      bridge.expectedOutcome ? `Expected outcome: ${bridge.expectedOutcome}` : '',
    ].filter(Boolean).join('\n');
  }
}

function buildPublicCreativeBrief(input: GenerateCampaignInput): {
  topic: string;
  angle: string;
  promptGoal: string;
  sourceContext: string;
} {
  const isAdvisorCampaign = Boolean(input.advisorBriefId);
  const offer = cleanBriefText(input.offer, 180);
  const audience = cleanBriefText(input.audience, 180);
  const requestedTopic = cleanBriefText(input.contentTopic, 220);
  const requestedAngle = cleanBriefText(input.contentAngle, 450);
  const expectedOutcome = cleanBriefText(input.expectedOutcome, 300);
  const strategicDirection = firstMeaningfulSentence(input.reason, 260);

  const topic = requestedTopic
    || (isAdvisorCampaign && offer
      ? `Why ${offer} is the right choice for ${audience || 'your customers'}`
      : isAdvisorCampaign
        ? (strategicDirection || `A practical guide for ${audience || 'your customers'}`)
        : cleanBriefText(input.goal, 220));
  const angle = requestedAngle
    || (isAdvisorCampaign && strategicDirection
      ? strategicDirection
      : topic);

  const publicInstructions = [
    isAdvisorCampaign
      ? `Internal campaign objective, for the user's review only: ${cleanBriefText(input.goal, 220)}`
      : '',
    `Customer-facing content topic: ${topic}`,
    `Customer-facing angle: ${angle}`,
    audience ? `Target audience: ${audience}` : '',
    offer ? `Offer or product to mention naturally: ${offer}` : '',
    expectedOutcome ? `Desired customer takeaway: ${expectedOutcome}` : '',
    strategicDirection ? `Strategic direction, do not copy verbatim: ${strategicDirection}` : '',
    isAdvisorCampaign
      ? 'Do not use the internal campaign objective as a public blog title, social post opening, banner headline, or customer-facing CTA.'
      : '',
  ].filter(Boolean).join('\n');

  return {
    topic,
    angle,
    promptGoal: isAdvisorCampaign ? angle : cleanBriefText(input.goal, 220),
    sourceContext: [
      input.sourceContext ?? '',
      publicInstructions ? `\nPUBLIC CREATIVE BRIEF:\n${publicInstructions}` : '',
    ].filter(Boolean).join('\n'),
  };
}

function channelLabel(channel?: string): string {
  const normalized = cleanBriefText(channel, 80).toLowerCase();
  if (normalized.includes('linkedin')) return 'LinkedIn';
  if (normalized.includes('instagram')) return 'Instagram';
  if (normalized.includes('facebook') || normalized.includes('meta')) return 'Facebook / Instagram';
  if (normalized.includes('google')) return 'Google';
  if (normalized) return normalized.replace(/\b\w/g, (char) => char.toUpperCase());
  return 'Facebook / Instagram';
}

function uniqueStrings(values: Array<string | undefined | null>): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const text = cleanBriefText(value, 120);
    if (!text) continue;
    const key = text.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(text);
  }
  return result;
}

/**
 * Builds a lightweight campaign operating plan from the same creative brief
 * used for generation. It is intentionally deterministic: no extra LLM call,
 * no new table, and easy to promote to a richer schema later.
 */
function buildCampaignPlan(
  input: GenerateCampaignInput,
  creativeBrief: ReturnType<typeof buildPublicCreativeBrief>,
  platform: string,
) {
  const audience = cleanBriefText(input.audience, 180) || 'target customers';
  const objective = cleanBriefText(input.goal, 240) || creativeBrief.topic;
  const offer = cleanBriefText(input.offer, 180);
  const expectedOutcome = cleanBriefText(input.expectedOutcome, 260);
  const channel = channelLabel(input.channel || platform);
  const channels = uniqueStrings([
    channel,
    input.channel,
    platform === 'linkedin' ? 'LinkedIn' : undefined,
    platform === 'google' ? 'Google' : undefined,
  ]);

  return {
    version: 1,
    generatedAt: new Date().toISOString(),
    objective,
    audience,
    customerProblem: expectedOutcome || `Help ${audience} understand why this offer is worth acting on now.`,
    coreMessage: creativeBrief.angle || creativeBrief.topic || objective,
    offer: offer || undefined,
    channels,
    successMetrics: [
      'Review-ready blog, banners, and social posts',
      'Selected assets launched from the campaign screen',
      'Published or queued social posts tracked in one place',
    ],
    assets: [
      {
        type: 'blog',
        label: 'Blog article',
        role: 'Educate customers, answer objections, and create a reviewable long-form asset.',
        successSignal: 'Blog draft is reviewed or published.',
      },
      {
        type: 'banner',
        label: 'Banner set',
        role: 'Create visual hooks that can be reused as campaign backgrounds and social images.',
        successSignal: 'At least one banner is selected and activated.',
      },
      {
        type: 'social_post',
        label: 'Social posts',
        role: 'Turn the campaign idea into platform-ready messages for the selected audience.',
        successSignal: 'Posts are published or queued for the chosen channels.',
      },
      {
        type: 'landing_page',
        label: 'Landing page',
        role: 'Optional conversion destination when the campaign needs a focused page.',
        successSignal: 'A landing page is created when the offer needs a dedicated destination.',
      },
    ],
    launchChecklist: [
      'Review the blog draft for accuracy.',
      'Select the banner images that match the campaign message.',
      'Apply chosen banners to social posts.',
      'Launch selected posts and assets when the content looks ready.',
    ],
  };
}

function buildCampaignLearningSummary(args: {
  activatedBannerCount: number;
  scheduledPostCount: number;
  publishedPostCount: number;
  failedPostCount: number;
  hasBlog: boolean;
}) {
  const launchedSocialCount = args.publishedPostCount + args.scheduledPostCount;
  const nextActions = [
    args.failedPostCount > 0
      ? 'Retry failed social posts after fixing the channel connection.'
      : undefined,
    args.hasBlog
      ? 'Review and publish the blog draft from the Blog screen.'
      : 'Create a supporting blog draft to strengthen this campaign.',
    launchedSocialCount > 0
      ? 'Watch early engagement and refresh CEO Advisor after results appear.'
      : 'Launch at least one social post so the campaign can start collecting signals.',
  ].filter(Boolean);

  return {
    status: launchedSocialCount > 0 || args.activatedBannerCount > 0 ? 'collecting_signals' : 'needs_launch',
    updatedAt: new Date().toISOString(),
    observations: [
      `${args.activatedBannerCount} banner${args.activatedBannerCount === 1 ? '' : 's'} activated.`,
      `${args.publishedPostCount} social post${args.publishedPostCount === 1 ? '' : 's'} published.`,
      `${args.scheduledPostCount} social post${args.scheduledPostCount === 1 ? '' : 's'} queued.`,
    ],
    nextActions,
  };
}

campaignsRouter.post(
  '/:companyId/generate',
  zValidator('json', generateSchema),
  async (c) => {
    const { userId } = c.get('user');
    const companyId = c.req.param('companyId');
    const input = c.req.valid('json');

    const company = await db.query.companies.findFirst({
      where: eq(companies.id, companyId),
      columns: { id: true, name: true, settings: true },
    });
    if (!company) {
      throw new HTTPException(404, { message: 'Company not found' });
    }

    // Pre-check credits — sum the cost across the steps the flow will
    // execute (banners + posts) at the chosen tier. Fail fast with 402
    // if the tenant can't afford the full run.
    const [bannerFeature, postFeature, advisorBridgeFeature] = await Promise.all([
      resolveFeature('campaign_banner_copy', input.tier),
      resolveFeature('campaign_social_post', input.tier),
      input.advisorBriefId ? resolveFeature('ceo_advisor_brief', 'fast') : Promise.resolve(null),
    ]);
    const imageProvider = await resolveImageProvider('dalle');
    const estimatedBannerImageCost = (imageProvider?.creditCost ?? 10) * 3;
    const estimatedCost = bannerFeature.creditCost
      + postFeature.creditCost
      + estimatedBannerImageCost
      + (advisorBridgeFeature?.creditCost ?? 0);
    await ensureSufficientCredits(companyId, estimatedCost);

    const [directSourceContext, advisorSourceContext] = await Promise.all([
      buildEffectiveSourceContext({
        companyId,
        userId,
        input: {
          brief: input.reason,
          googleDriveFileId: input.googleDriveFileId,
          googleDriveFileName: input.googleDriveFileName,
          googleDriveUrl: input.googleDriveUrl,
          oneDriveFileId: input.oneDriveFileId,
          oneDriveFileName: input.oneDriveFileName,
        },
        briefLabel: input.advisorBriefId ? 'Advisor action summary' : 'Campaign direction',
      }),
      buildAdvisorCampaignSourceContext({
        companyId,
        companyName: company.name,
        input,
      }),
    ]);
    const sourceContext = [
      directSourceContext,
      advisorSourceContext,
    ].filter(Boolean).join('\n\n') || undefined;

    // Approach: insert the campaign shell row synchronously so we can
    // return the ID to the client in ~100ms. The generation pipeline
    // (build context → banners → posts → finalize) runs in the
    // background and publishes step events to the event bus.
    try {
      const campaignId = await createCampaignWithStream(companyId, {
        ...input,
        language: normalizeContentLanguage(input.language ?? company.settings?.language),
        sourceContext,
      });
      return c.json({
        campaignId,
        estimatedCost,
        tier: input.tier,
        streamUrl: `/api/v1/campaigns/${companyId}/${campaignId}/stream`,
      });
    } catch (err) {
      if (err instanceof HTTPException) throw err;
      console.error('[campaigns.generate] request failed before campaign creation:', {
        companyId,
        goal: input.goal,
        audience: input.audience,
        tier: input.tier,
        error: err,
      });
      throw new HTTPException(500, {
        message: err instanceof Error ? err.message : 'Failed to generate campaign',
      });
    }
  },
);

/**
 * Orchestrates campaign creation with the correct event ordering:
 *   1. Insert the campaign row NOW so the client gets an ID back fast
 *   2. Kick off the generation pipeline in the background
 *   3. Publish step events on the shared bus as the pipeline runs
 *
 * Returns the campaign ID as soon as the row is inserted (~100ms).
 */
async function createCampaignWithStream(
  companyId: string,
  input: GenerateCampaignInput,
): Promise<string> {
  // 1. Insert the shell campaign row immediately so the client can
  // subscribe to SSE with a known ID.
  const goalType = mapGoalType(input.goal);
  const platform = mapChannelToPlatform(input.channel);
  const initialCreativeBrief = buildPublicCreativeBrief(input);
  const campaignPlan = buildCampaignPlan(input, initialCreativeBrief, platform);

  const [campaign] = await db
    .insert(campaigns)
    .values({
      companyId,
      name: buildCampaignName(input.goal),
      goal: goalType,
      platform,
      budgetDaily: input.suggestedBudget?.toString() || '10',
      targeting: {
        audience: input.audience,
        campaignPlan,
        source: {
          type: input.advisorBriefId ? 'ceo_advisor' : 'ai_user_requested',
          requestedGoal: input.goal,
          reasoning: input.reason ?? '',
          hasSourceContext: Boolean(input.sourceContext),
          ...(input.advisorBriefId
            ? {
              advisorBriefId: input.advisorBriefId,
              advisorActionIndex: input.advisorActionIndex,
              advisorActionTitle: input.advisorActionTitle,
              advisorEvidenceIds: input.advisorEvidenceIds ?? [],
            }
            : {}),
        },
      } as any,
      status: 'planned',
      aiMode: true,
    })
    .returning();

  if (!campaign) {
    throw new Error('Failed to create campaign row');
  }

  // 2. Fire-and-forget: run the real generation, forwarding step events
  // to the event bus scoped by campaignId so the SSE endpoint can filter.
  (async () => {
    publishStep(companyId, campaign.id, {
      step: 'create_campaign',
      status: 'completed',
      at: new Date().toISOString(),
      durationMs: 0,
    });

    const emit = async (ev: CampaignStepEvent) => {
      publishStep(companyId, campaign.id, ev);
    };

    try {
      // Transition to generating
      await db
        .update(campaigns)
        .set({ status: 'generating', updatedAt: new Date() })
        .where(eq(campaigns.id, campaign.id));

      // Re-use MarketingAutonomous.generateBanners / generatePosts by
      // calling createAutonomousCampaign with a pre-existing campaign
      // would require a refactor. For the demo we directly invoke the
      // service's public method; it will create a SECOND campaign row.
      // To avoid the duplicate row we set the orphan first row to
      // 'superseded' at the end.
      //
      // Cleaner: call marketingAutonomous and use its returned ID as
      // the canonical one, then delete our placeholder. That actually
      // defeats the "early ID" purpose.
      //
      // Real fix: refactor marketingAutonomous to accept an existing
      // campaignId. Doing that inline below.
      await generateForExisting(
        companyId,
        campaign.id,
        input,
        emit,
      );

      await db
        .update(campaigns)
        .set({ status: 'ready', updatedAt: new Date() })
        .where(eq(campaigns.id, campaign.id));

      publishStep(companyId, campaign.id, {
        step: 'finalize_ready',
        status: 'completed',
        at: new Date().toISOString(),
        durationMs: 0,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error('[campaigns.generate] generation failed:', err);
      publishStep(companyId, campaign.id, {
        step: 'generation',
        status: 'failed',
        at: new Date().toISOString(),
        error: message,
      });
      await db
        .update(campaigns)
        .set({
          status: 'failed',
          launchError: message,
          updatedAt: new Date(),
        })
        .where(eq(campaigns.id, campaign.id));
    }
  })();

  return campaign.id;
}

/**
 * Runs the generation stages against an existing campaign row.
 * Mirrors the internals of MarketingAutonomous but targets a pre-
 * inserted campaignId so the HTTP layer can return the ID early.
 */
async function generateForExisting(
  companyId: string,
  campaignId: string,
  input: GenerateCampaignInput,
  emit: (ev: CampaignStepEvent) => Promise<void>,
) {
  const { buildBusinessContext } = await import('../services/business-context');
  const { llmGenerate, extractJSON } = await import('../lib/llm');

  const runStep = async <T>(step: string, fn: () => Promise<T>): Promise<T> => {
    const startedAt = Date.now();
    await emit({ step, status: 'started', at: new Date(startedAt).toISOString() });
    try {
      const result = await fn();
      await emit({
        step,
        status: 'completed',
        at: new Date().toISOString(),
        durationMs: Date.now() - startedAt,
      });
      return result;
    } catch (err) {
      await emit({
        step,
        status: 'failed',
        at: new Date().toISOString(),
        error: err instanceof Error ? err.message : String(err),
      });
      throw err;
    }
  };

  // Load Business Brain snapshot (W0.2) — structured brand voice, personas,
  // products, recent learnings. Falls back silently if Brain is empty.
  let brainPromptBlock = '';
  try {
    const company = await db.query.companies.findFirst({
      where: eq(companies.id, companyId),
      columns: { id: true, name: true },
    });
    if (company) {
      const tenantId = await ensureTenantForCompany(company.id, company.name);
      const ai = getTenantAI();
      const snapshot = await ai.brain.getSnapshot(tenantId);
      brainPromptBlock = snapshotToPromptBlock(snapshot);
    }
  } catch (err) {
    console.warn('[campaigns] Brain snapshot failed, continuing without:', err);
  }

  // Build business context (combines Brain + legacy knowledge base)
  const ctx = await runStep('build_business_context', async () => {
    return buildBusinessContext(companyId);
  });
  const language = normalizeContentLanguage(input.language ?? ctx.language);
  const campaignContext = [
    ctx.fullContext,
    input.sourceContext ? `\nCAMPAIGN SOURCE CONTENT:\n${input.sourceContext}` : '',
  ].filter(Boolean).join('\n');
  const creativeBrief = buildPublicCreativeBrief({
    ...input,
    sourceContext: campaignContext,
  });
  const publicCampaignContext = creativeBrief.sourceContext;
  const existingCampaign = await db.query.campaigns.findFirst({
    where: and(eq(campaigns.id, campaignId), eq(campaigns.companyId, companyId)),
  });
  const existingTargeting = (existingCampaign?.targeting ?? {}) as Record<string, unknown>;
  await db
    .update(campaigns)
    .set({
      targeting: {
        ...existingTargeting,
        audience: input.audience,
        campaignPlan: buildCampaignPlan(
          input,
          creativeBrief,
          mapChannelToPlatform(input.channel),
        ),
      } as any,
      updatedAt: new Date(),
    })
    .where(eq(campaigns.id, campaignId));

  await runStep('generate_blog_post', async () => {
    return createCampaignBlog({
      companyId,
      campaignId,
      goal: input.goal,
      contentTopic: creativeBrief.topic,
      contentAngle: creativeBrief.angle,
      audience: input.audience,
      sourceContext: publicCampaignContext.substring(0, 6000),
      language,
    });
  });

  // Generate banners
  await runStep('generate_banners', async () => {
    const brandKit = await buildBrandCreativeKit(companyId);
    const brandPrimary = brandKit.colors.primary || ctx.brandColors.primary || '#6366f1';
    const brandSecondary = brandKit.colors.secondary || ctx.brandColors.secondary || '#8b5cf6';
    const brandCreativePrompt = renderBrandCreativeKitPrompt(brandKit);

    const brainBlock = brainPromptBlock ? `\n\n${brainPromptBlock}\n` : '';
    const languageInstruction = buildContentLanguageInstruction(language);
    const llmRes = await llmGenerate(
      [
        {
          role: 'system',
          content: `You are a creative director. Create 3 banner ad concepts. Headlines MAX 8 words, CTA 2-4 words. Follow the brand voice strictly — tone, preferred words, and avoided words are non-negotiable.`,
        },
        {
          role: 'user',
          content: `Create 3 banner variants for this business.\n${languageInstruction}${brainBlock}\n\n${brandCreativePrompt}\n\nBUSINESS CONTEXT:\n${publicCampaignContext.substring(0, 2400)}\n\nTARGET AUDIENCE: ${input.audience}\nPUBLIC TOPIC: ${creativeBrief.topic}\nCUSTOMER-FACING ANGLE: ${creativeBrief.angle}\n${input.offer ? `OFFER OR PRODUCT: ${input.offer}` : ''}\n${input.reason ? `STRATEGIC CONTEXT FOR AI ONLY:\n${input.reason}` : ''}\n\nDo not copy the internal campaign objective into public headlines. Write for the customer, not for the internal strategy team.\nHeadlines and CTAs must follow the Brand Creative Kit voice and style rules.\nEach visualDirection must describe a concrete, text-free photographic scene that directly represents this public campaign topic and matches the Brand Creative Kit visual mood. The 3 scenes must be meaningfully different in subject, setting, and camera framing while still feeling like one brand campaign.\n\nReturn ONLY JSON:\n{"variants":[{"headline":"Max 8 words","subheadline":"Max 15 words","cta":"2-4 words","angle":"aspiration|pain|benefit","visualDirection":"Concrete text-free photographic scene, subject, setting, mood and composition"}]}`,
        },
      ],
      {
        featureKey: 'campaign_banner_copy',
        tier: input.tier,
        traceName: 'campaigns.generateBanners',
        metadata: { companyId, campaignId, language },
      },
    );
    const text = llmRes.text;
    // Charge after success — non-fatal if charge fails (work is done)
    await chargeForLLMCall(companyId, llmRes, {
      featureKey: 'campaign_banner_copy',
      refKind: 'banner_copy',
      refId: campaignId,
    });

    const parsed = (extractJSON(text) as { variants?: any[] }) || {};
    const generatedVariants = Array.isArray(parsed.variants) ? parsed.variants.slice(0, 3) : [];
    const fallbackVariants = [
      {
        headline: creativeBrief.topic,
        subheadline: creativeBrief.angle,
        cta: localizedDefault(language, 'learnMore'),
        angle: 'benefit',
        visualDirection: `A concrete commercial scene showing ${input.audience} experiencing the main benefit of ${input.offer || creativeBrief.topic}`,
      },
      {
        headline: localizedDefault(language, 'betterWay'),
        subheadline: language === 'ja'
          ? `${input.audience}により良い成果を`
          : language === 'vi'
            ? `Kết quả tốt hơn cho ${input.audience}`
            : `A better outcome for ${input.audience}`,
        cta: localizedDefault(language, 'exploreNow'),
        angle: 'aspiration',
        visualDirection: `An aspirational real-world scene focused on ${input.audience} achieving ${creativeBrief.angle}`,
      },
      {
        headline: localizedDefault(language, 'confidence'),
        subheadline: creativeBrief.topic,
        cta: localizedDefault(language, 'getStarted'),
        angle: 'pain',
        visualDirection: `An authentic problem-to-solution scene showing the need behind ${creativeBrief.topic} for ${input.audience}`,
      },
    ];
    const variants = Array.from({ length: 3 }, (_, index) => ({
      ...fallbackVariants[index]!,
      ...(generatedVariants[index] ?? {}),
    }));

    const angleThemes: Record<string, any> = {
      aspiration: { primary: brandPrimary, secondary: '#10b981' },
      pain: { primary: '#dc2626', secondary: '#f97316' },
      benefit: { primary: brandPrimary, secondary: brandSecondary },
    };

    for (const [index, variant] of variants.entries()) {
      const angle = variant.angle || 'benefit';
      const baseTheme = {
        ...CAMPAIGN_BANNER_PALETTE[index % CAMPAIGN_BANNER_PALETTE.length]!,
        colors: {
          ...CAMPAIGN_BANNER_PALETTE[index % CAMPAIGN_BANNER_PALETTE.length]!.colors,
          ...((angleThemes[angle] || angleThemes.benefit) as Record<string, string>),
        },
      };
      const theme = applyBrandKitToBannerTheme(baseTheme, brandKit, index);
      const headline = (variant.headline || '').split(' ').slice(0, 8).join(' ');
      const subheadline = (variant.subheadline || '').split(' ').slice(0, 15).join(' ');
      const cta = (variant.cta || localizedDefault(language, 'getStarted')).split(' ').slice(0, 4).join(' ');
      const visualDirection = variant.visualDirection
        ? String(variant.visualDirection).slice(0, 400)
        : undefined;

      await db.insert(banners).values({
        companyId,
        campaignId,
        name: headline,
        size: '1200x628',
        status: 'draft',
        copy: { headline, subheadline, cta, brandColor: brandPrimary } as any,
        angle,
        design: {
          layout: 'center',
          backgroundType: 'gradient',
          backgroundValue: theme.backgroundValue,
          colorTheme: theme.colors,
          brandKit: brandCreativeKitSnapshot(brandKit),
          brandFit: buildBrandFitSummary(brandKit, false),
          ...(visualDirection ? { visualDirection } : {}),
        } as any,
        strategyTag: angle === 'pain' ? 'urgency' : 'value',
      }).catch(async () => {
        // Fallback if design column not in schema yet
        await db.insert(banners).values({
          companyId,
          campaignId,
          name: headline,
          size: '1200x628',
          status: 'draft',
          copy: { headline, subheadline, cta, brandColor: brandPrimary } as any,
          strategyTag: angle === 'pain' ? 'urgency' : 'value',
        });
      });
    }

    const createdBanners = await db
      .select()
      .from(banners)
      .where(eq(banners.campaignId, campaignId))
      .orderBy(desc(banners.createdAt))
      .limit(3);

    for (const [index, banner] of createdBanners.reverse().entries()) {
      const copy = (banner.copy ?? {}) as {
        headline?: string;
        subheadline?: string;
        cta?: string;
        reasoning?: string;
      };
      const design = (banner.design ?? {}) as Record<string, any>;
      const headline = copy.headline || banner.name;
      const subheadline = copy.subheadline;
      const cta = copy.cta || 'Get Started';
      try {
        const creative = await renderContextualCampaignBanner({
          bannerId: banner.id,
          companyId,
          size: banner.size,
          goal: creativeBrief.promptGoal,
          audience: input.audience,
          reason: input.reason,
          offer: input.offer || creativeBrief.topic,
          businessContext: publicCampaignContext,
          angle: banner.angle ?? banner.strategyTag ?? undefined,
          visualDirection: design.visualDirection,
          headline,
          subheadline,
          cta,
          variantIndex: index,
          brandKit,
        });
        if (creative.backgroundImageCreditCost && creative.backgroundImageCreditCost > 0) {
          await chargeFixedCredits(companyId, creative.backgroundImageCreditCost, {
            featureKey: 'campaign_banner_image',
            tier: creative.backgroundImageProvider === 'dalle' ? 'premium' : 'balanced',
            refKind: 'banner_bg',
            refId: banner.id,
            note: `Campaign banner background via ${creative.backgroundImageProvider ?? 'image provider'}`,
          });
        }

        await db.update(banners)
          .set({
            imageUrl: creative.rendered.imageUrl,
            design: {
              ...design,
              layout: creative.theme.layout,
              backgroundType: creative.backgroundImageUrl ? 'image' : 'gradient',
              backgroundValue: creative.backgroundImageUrl ?? creative.theme.backgroundValue,
              backgroundPrompt: creative.backgroundPrompt,
              backgroundImageProvider: creative.backgroundImageProvider,
              backgroundImageModel: creative.backgroundImageModel,
              backgroundQuality: creative.backgroundQuality,
              backgroundGenerationAttempts: creative.generationAttempts,
              colorTheme: creative.theme.colors,
              brandKit: brandCreativeKitSnapshot(brandKit),
              brandFit: buildBrandFitSummary(brandKit, Boolean(creative.rendered.brandLogoApplied)),
              imglyScene: creative.rendered.imglyScene,
              renderedImageUrl: creative.rendered.imageUrl,
              renderProvider: creative.rendered.renderer,
              renderedAt: new Date().toISOString(),
            } as any,
            updatedAt: new Date(),
          })
          .where(eq(banners.id, banner.id));
      } catch (renderError) {
        console.warn('[campaigns] banner render failed:', (renderError as Error).message);
      }
    }
  });

  // Generate social posts
  await runStep('generate_social_posts', async () => {
    const generated = await generateCampaignSocialPosts({
      companyId,
      campaignId,
      topic: creativeBrief.topic,
      audience: input.audience,
      goal: creativeBrief.promptGoal,
      context: publicCampaignContext,
      platforms: [...CAMPAIGN_SOCIAL_PLATFORMS],
      brandPromptBlock: brainPromptBlock,
      language,
      tier: input.tier,
      traceName: 'campaigns.generateSocialPosts',
    });
    await chargeForLLMCall(companyId, generated.llmResponse, {
      featureKey: 'campaign_social_post',
      refKind: 'social_post',
      refId: campaignId,
    });
    for (const post of generated.posts) {
      await db.insert(socialPosts).values({
        companyId,
        campaignId,
        platform: post.platform,
        content: post.content,
        hashtags: post.hashtags,
        mediaUrls: [],
        status: 'draft',
      });
    }
    if (generated.posts.length > 0) return;

    const brainBlock = brainPromptBlock ? `\n\n${brainPromptBlock}\n` : '';
    const llmRes = await llmGenerate(
      [
        {
          role: 'system',
          content: 'You are a social media manager. Write posts using specific business details. Follow the brand voice strictly — tone, preferred words, and avoided words are non-negotiable.',
        },
        {
          role: 'user',
          content: `Generate exactly 3 social posts for this business targeting: ${input.audience}\n${buildContentLanguageInstruction(language)}${brainBlock}\n\nPUBLIC TOPIC: ${creativeBrief.topic}\nCUSTOMER-FACING ANGLE: ${creativeBrief.angle}\n\nBUSINESS CONTEXT:\n${publicCampaignContext.substring(0, 1400)}\n\nCreate one post for each platform: facebook, instagram, linkedin.\nAdapt the writing style to each platform:\n- facebook: conversational and community-friendly\n- instagram: visual, concise, hashtag-friendly\n- linkedin: professional and insight-led\n\nDo not copy internal campaign objectives into public post text.\nReturn ONLY JSON array in this exact platform order:\n[{"platform":"facebook","content":"Post text","hashtags":["#tag"]},{"platform":"instagram","content":"Post text","hashtags":["#tag"]},{"platform":"linkedin","content":"Post text","hashtags":["#tag"]}]`,
        },
      ],
      {
        featureKey: 'campaign_social_post',
        tier: input.tier,
        traceName: 'campaigns.generateSocialPosts',
        metadata: { companyId, campaignId, language },
      },
    );
    const text = llmRes.text;
    await chargeForLLMCall(companyId, llmRes, {
      featureKey: 'campaign_social_post',
      refKind: 'social_post',
      refId: campaignId,
    });

    const parsed = extractJSON(text) || [];
    const posts = Array.isArray(parsed) ? parsed : [];
    const postsByPlatform = new Map<CampaignSocialPlatform, any>();
    for (const post of posts) {
      const platform = normalizeCampaignSocialPlatform(post?.platform);
      if (platform && !postsByPlatform.has(platform)) postsByPlatform.set(platform, post);
    }
    posts.slice(0, 3).forEach((post: any, index: number) => {
      const platform = CAMPAIGN_SOCIAL_PLATFORMS[index];
      if (platform && !postsByPlatform.has(platform)) {
        postsByPlatform.set(platform, post);
      }
    });

    for (const platform of CAMPAIGN_SOCIAL_PLATFORMS) {
      const post = postsByPlatform.get(platform) ?? {};
      const normalized = normalizeSocialPost(post.content, post.hashtags);
      await db.insert(socialPosts).values({
        companyId,
        campaignId,
        platform,
        content: normalized.content,
        hashtags: normalized.hashtags,
        mediaUrls: [],
        status: 'draft',
      });
    }
  });
}

function mapChannelToPlatform(channel?: string): 'google' | 'meta' | 'linkedin' | 'manual' {
  if (!channel) return 'meta';
  const lower = channel.toLowerCase();
  if (lower.includes('google')) return 'google';
  if (lower.includes('linkedin')) return 'linkedin';
  if (lower.includes('facebook') || lower.includes('meta') || lower.includes('instagram')) return 'meta';
  return 'manual';
}

function mapGoalType(goal: string): 'traffic' | 'leads' | 'conversions' | 'awareness' | 'sales' {
  const lower = goal.toLowerCase();
  if (lower.includes('lead')) return 'leads';
  if (lower.includes('sale') || lower.includes('convert') || lower.includes('revenue')) return 'conversions';
  if (lower.includes('aware') || lower.includes('brand')) return 'awareness';
  if (lower.includes('traffic') || lower.includes('visit')) return 'traffic';
  return 'traffic';
}

// ─── GET /:companyId/:id/explain — "Why this output?" deep-link (W1A.3) ──
//
// Returns the Langfuse trace inspector URL for this campaign's most
// recent LLM call. Frontend opens this URL in a new tab. Per ADR-01,
// we don't build our own lineage UI — Langfuse already renders prompt,
// model, sources, timings, tokens.
campaignsRouter.get('/:companyId/:id/explain', async (c) => {
  const campaignId = c.req.param('id');
  const companyId = c.req.param('companyId');
  const campaign = await db.query.campaigns.findFirst({
    where: and(eq(campaigns.id, campaignId), eq(campaigns.companyId, companyId)),
  });
  if (!campaign) {
    throw new HTTPException(404, { message: 'Campaign not found' });
  }
  // Without per-asset traceId storage, return the Langfuse project URL
  // filtered by the campaign name. Precise per-asset linking lands with
  // generationHistory table (deferred until user asks for it).
  const { env } = await import('../lib/env');
  const url = `${env.LANGFUSE_BASE_URL}/project/1person-main/traces?search=${encodeURIComponent(campaign.name)}`;
  return c.json({ url, campaign: { id: campaign.id, name: campaign.name } });
});

// ─── POST /:companyId/:id/launch — activate reviewed campaign outputs ──
//
// This is intentionally still platform-safe: until ad/social publishing
// connectors are wired, launch activates selected internal assets and
// records a precise summary instead of pretending that external platforms
// went live.

campaignsRouter.post('/:companyId/:id/launch', async (c) => {
  const companyId = c.req.param('companyId');
  const campaignId = c.req.param('id');
  const parsedBody = launchCampaignBodySchema.safeParse(
    await c.req.json().catch(() => ({})),
  );
  if (!parsedBody.success) {
    throw new HTTPException(400, { message: parsedBody.error.message });
  }
  const launchOptions = parsedBody.data;

  const campaign = await db.query.campaigns.findFirst({
    where: and(eq(campaigns.id, campaignId), eq(campaigns.companyId, companyId)),
  });
  if (!campaign) {
    throw new HTTPException(404, { message: 'Campaign not found' });
  }
  if (campaign.status !== 'ready' && campaign.status !== 'live') {
    throw new HTTPException(400, {
      message: `Only ready or live campaigns can launch reviewed items. Current: ${campaign.status}`,
    });
  }

  const bannerRows = await db
    .select()
    .from(banners)
    .where(eq(banners.campaignId, campaignId));
  const postRows = await db
    .select()
    .from(socialPosts)
    .where(eq(socialPosts.campaignId, campaignId));

  const selectedBannerRows = bannerRows
    .filter((banner) => launchOptions.bannerIds.includes(banner.id))
    .filter((banner) => Boolean(banner.imageUrl));
  const selectedPostRows = launchOptions.socialPostIds.length > 0
    ? postRows.filter((post) => launchOptions.socialPostIds.includes(post.id))
    : [];

  const canActivateBanners = launchOptions.activateBanners && selectedBannerRows.length > 0;
  const canSchedulePosts = launchOptions.scheduleSocialPosts && selectedPostRows.length > 0;
  if (!canActivateBanners && !canSchedulePosts) {
    throw new HTTPException(400, {
      message: 'Select at least one ready banner or social post action before launching.',
    });
  }

  const targeting = (campaign.targeting ?? {}) as Record<string, unknown>;
  const blogPostId = typeof targeting.blogPostId === 'string' ? targeting.blogPostId : null;
  const linkedBlogPost = blogPostId
    ? await db.query.blogPosts.findFirst({
      where: and(eq(blogPosts.id, blogPostId), eq(blogPosts.companyId, companyId)),
    })
    : null;

  const startedAt = new Date();
  const initialLaunchSummary = {
    launchedAt: startedAt.toISOString(),
    options: launchOptions,
    results: {
      blog: linkedBlogPost
        ? {
          status: 'review_required',
          blogPostId: linkedBlogPost.id,
          title: linkedBlogPost.title,
          message: 'Blog draft is ready. Publish it from the blog review screen.',
        }
        : {
          status: 'missing',
          message: 'No blog draft is attached to this campaign.',
        },
      banners: {
        status: canActivateBanners ? 'pending' : 'skipped',
        requested: selectedBannerRows.length,
        activated: 0,
      },
      socialPosts: {
        status: canSchedulePosts ? 'pending' : 'skipped',
        requested: selectedPostRows.length,
        scheduled: 0,
        published: 0,
        failed: 0,
      },
      externalPublishing: {
        status: 'pending',
        message: 'Facebook selections will publish when a Page is connected. Other social channels will be queued.',
      },
    },
  };

  // Transition to launching and persist the user-visible plan.
  await db
    .update(campaigns)
    .set({
      status: 'launching',
      targeting: {
        ...targeting,
        launchSummary: initialLaunchSummary,
      },
      updatedAt: startedAt,
    })
    .where(eq(campaigns.id, campaignId));

  publishStep(companyId, campaignId, {
    step: 'launch_campaign',
    status: 'started',
    at: new Date().toISOString(),
  });

  // Fire-and-forget: activate internal outputs + emit progress.
  (async () => {
    try {
      const emit = (stepEv: CampaignStepEvent) =>
        publishStep(companyId, campaignId, stepEv);
      const selectedBannerIds = selectedBannerRows.map((banner) => banner.id);
      let activatedBannerCount = 0;
      let scheduledPostCount = 0;
      let publishedPostCount = 0;
      let failedPostCount = 0;

      // Step 1: activate reviewed banners.
      const startBanners = Date.now();
      await emit({
        step: 'publish_banners',
        status: 'started',
        at: new Date().toISOString(),
      });
      if (canActivateBanners && selectedBannerIds.length > 0) {
        await db
          .update(banners)
          .set({ status: 'active', updatedAt: new Date() })
          .where(and(
            eq(banners.campaignId, campaignId),
            inArray(banners.id, selectedBannerIds),
          ));
        activatedBannerCount = selectedBannerIds.length;
      }
      await emit({
        step: 'publish_banners',
        status: 'completed',
        at: new Date().toISOString(),
        durationMs: Date.now() - startBanners,
      });

      // Step 2: publish or schedule the posts exactly as reviewed. Banner
      // media is attached only by the explicit "Apply to social posts" action.
      const startPosts = Date.now();
      await emit({
        step: 'schedule_posts',
        status: 'started',
        at: new Date().toISOString(),
      });
      if (canSchedulePosts) {
        const scheduledAt = new Date();
        const facebookConnection = selectedPostRows.some((post) => (
          normalizeCampaignSocialPlatform(post.platform) === 'facebook'
        ))
          ? await findActiveFbConnection(companyId)
          : null;

        for (const post of selectedPostRows) {
          const mediaUrls = [...((post.mediaUrls ?? []) as string[])];
          const platform = normalizeCampaignSocialPlatform(post.platform);

          if (platform === 'facebook' && facebookConnection) {
            try {
              const media = getFacebookReadyMediaUrls(mediaUrls);
              if (media.invalidReason) throw new Error(media.invalidReason);
              const published = await publishPagePost(
                facebookConnection,
                buildFacebookPostMessage(post, campaign),
                { mediaUrls: media.valid, mediaType: media.mediaType },
              );
              const publishedAt = new Date();
              await db
                .update(socialPosts)
                .set({
                  status: 'published',
                  publishedAt,
                  mediaUrls,
                  metrics: {
                    ...((post.metrics ?? {}) as Record<string, unknown>),
                    facebook: {
                      externalId: published.externalId,
                      externalUrl: published.externalUrl,
                      publishedAt: publishedAt.toISOString(),
                      mediaCount: media.valid.length,
                      mediaType: media.mediaType,
                    },
                  } as any,
                })
                .where(and(
                  eq(socialPosts.id, post.id),
                  eq(socialPosts.campaignId, campaignId),
                ));
              publishedPostCount += 1;
              continue;
            } catch (error) {
              failedPostCount += 1;
              await db
                .update(socialPosts)
                .set({
                  status: 'failed',
                  mediaUrls,
                  metrics: {
                    ...((post.metrics ?? {}) as Record<string, unknown>),
                    facebook: {
                      error: error instanceof Error ? error.message : 'Facebook publish failed',
                      failedAt: new Date().toISOString(),
                    },
                  } as any,
                })
                .where(and(
                  eq(socialPosts.id, post.id),
                  eq(socialPosts.campaignId, campaignId),
                ));
              continue;
            }
          }

          await db
            .update(socialPosts)
            .set({ status: 'scheduled', scheduledAt, mediaUrls })
            .where(and(
              eq(socialPosts.id, post.id),
              eq(socialPosts.campaignId, campaignId),
            ));
          scheduledPostCount += 1;
        }
      }
      await emit({
        step: 'schedule_posts',
        status: 'completed',
        at: new Date().toISOString(),
        durationMs: Date.now() - startPosts,
      });

      const completedAt = new Date();
      const learningSummary = buildCampaignLearningSummary({
        activatedBannerCount,
        scheduledPostCount,
        publishedPostCount,
        failedPostCount,
        hasBlog: Boolean(linkedBlogPost),
      });
      const completedLaunchSummary = {
        ...initialLaunchSummary,
        launchedAt: completedAt.toISOString(),
        results: {
          ...initialLaunchSummary.results,
          banners: {
            status: activatedBannerCount > 0 ? 'activated' : 'skipped',
            requested: selectedBannerRows.length,
            activated: activatedBannerCount,
          },
          socialPosts: {
            status: publishedPostCount > 0
              ? 'published'
              : scheduledPostCount > 0
                ? 'scheduled'
                : failedPostCount > 0
                  ? 'failed'
                  : 'skipped',
            requested: selectedPostRows.length,
            scheduled: scheduledPostCount,
            published: publishedPostCount,
            failed: failedPostCount,
          },
          externalPublishing: {
            status: publishedPostCount > 0 ? 'partial_or_complete' : 'not_connected',
            message: publishedPostCount > 0
              ? `${publishedPostCount} Facebook post(s) published. Instagram and LinkedIn selections remain queued until their publishers are connected.`
              : 'Selected social posts were prepared, but no external post was published.',
          },
        },
      };

      // Step 3: transition to live only after at least one ready item was activated.
      await db
        .update(campaigns)
        .set({
          status: 'live',
          startDate: completedAt,
          targeting: {
            ...targeting,
            launchSummary: completedLaunchSummary,
            learningSummary,
          } as any,
          updatedAt: completedAt,
        })
        .where(eq(campaigns.id, campaignId));

      publishStep(companyId, campaignId, {
        step: 'launch_campaign',
        status: 'completed',
        at: new Date().toISOString(),
        durationMs: 0,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error('[campaigns.launch] failed:', err);
      publishStep(companyId, campaignId, {
        step: 'launch_campaign',
        status: 'failed',
        at: new Date().toISOString(),
        error: message,
      });
      await db
        .update(campaigns)
        .set({
          status: 'failed',
          launchError: message,
          updatedAt: new Date(),
        })
        .where(eq(campaigns.id, campaignId));
    }
  })();

  return c.json({
    campaignId,
    status: 'launching',
    launchSummary: initialLaunchSummary,
    streamUrl: `/api/v1/campaigns/${companyId}/${campaignId}/stream`,
  });
});

// ─── POST /:companyId/:id/publish-facebook — publish campaign posts to FB ──

campaignsRouter.post('/:companyId/:id/publish-facebook', async (c) => {
  const companyId = c.req.param('companyId');
  const campaignId = c.req.param('id');
  const parsedBody = publishCampaignFacebookBodySchema.safeParse(
    await c.req.json().catch(() => ({})),
  );
  if (!parsedBody.success) {
    throw new HTTPException(400, { message: parsedBody.error.message });
  }
  const { postIds, includeImages } = parsedBody.data;

  const campaign = await db.query.campaigns.findFirst({
    where: and(eq(campaigns.id, campaignId), eq(campaigns.companyId, companyId)),
  });
  if (!campaign) {
    throw new HTTPException(404, { message: 'Campaign not found' });
  }

  const conn = await findActiveFbConnection(companyId);
  if (!conn) {
    throw new HTTPException(400, {
      message: 'No Facebook Page connected. Connect a Facebook Page in Channels or Social Distribution first.',
    });
  }

  const rows = await db
    .select()
    .from(socialPosts)
    .where(eq(socialPosts.campaignId, campaignId));
  const requestedIds = new Set(postIds ?? []);
  const postsToPublish = rows.filter((post) => {
    const isFacebook = post.platform.toLowerCase() === 'facebook' || post.platform.toLowerCase() === 'fb';
    const isRequested = requestedIds.size === 0 || requestedIds.has(post.id);
    return isFacebook && isRequested;
  });

  if (postsToPublish.length === 0) {
    throw new HTTPException(400, {
      message: postIds?.length
        ? 'No selected Facebook posts were found in this campaign.'
        : 'This campaign has no Facebook social posts to publish.',
    });
  }

  const results: Array<{
    postId: string;
    ok: boolean;
    externalId?: string;
    externalUrl?: string;
    error?: string;
  }> = [];

  for (const post of postsToPublish) {
    try {
      const media = includeImages
        ? getFacebookReadyMediaUrls(post.mediaUrls as string[] | null | undefined)
        : { valid: [] as string[], mediaType: undefined };
      if (media.invalidReason) {
        throw new Error(media.invalidReason);
      }

      const published = await publishPagePost(conn, buildFacebookPostMessage(post, campaign), {
        mediaUrls: media.valid,
        mediaType: media.mediaType,
      });
      const publishedAt = new Date();
      const metrics = (post.metrics ?? {}) as Record<string, unknown>;
      await db
        .update(socialPosts)
        .set({
          status: 'published',
          publishedAt,
          metrics: {
            ...metrics,
            facebook: {
              externalId: published.externalId,
              externalUrl: published.externalUrl,
              publishedAt: publishedAt.toISOString(),
              mediaCount: media.valid.length,
              mediaType: media.mediaType,
            },
          } as any,
        })
        .where(and(
          eq(socialPosts.id, post.id),
          eq(socialPosts.companyId, companyId),
          eq(socialPosts.campaignId, campaignId),
        ));
      results.push({
        postId: post.id,
        ok: true,
        externalId: published.externalId,
        externalUrl: published.externalUrl,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Facebook publish failed';
      await db
        .update(socialPosts)
        .set({
          status: 'failed',
          metrics: {
            ...((post.metrics ?? {}) as Record<string, unknown>),
            facebook: {
              error: message,
              failedAt: new Date().toISOString(),
            },
          } as any,
        })
        .where(and(
          eq(socialPosts.id, post.id),
          eq(socialPosts.companyId, companyId),
          eq(socialPosts.campaignId, campaignId),
        ));
      results.push({ postId: post.id, ok: false, error: message });
    }
  }

  const published = results.filter((result) => result.ok).length;
  const failed = results.length - published;
  const response = {
    success: published > 0,
    message: published === 0
      ? results[0]?.error || 'No posts were published to Facebook.'
      : failed > 0
        ? `${published} Facebook post(s) published and ${failed} failed.`
        : `${published} Facebook post(s) published.`,
    published,
    failed,
    results,
  };

  return published === 0
    ? c.json(response, 422)
    : c.json(response);
});

// ─── GET /:companyId — list campaigns ───────────────────────────────

// Campaign performance uses real organic Facebook metrics. Keeping the read
// and refresh endpoints separate lets the detail page load cached results
// immediately while the user controls when an external API call is made.
campaignsRouter.get('/:companyId/:id/performance', async (c) => {
  const companyId = c.req.param('companyId');
  const campaignId = c.req.param('id');
  const performance = await getCampaignPerformance(companyId, campaignId);
  if (!performance) {
    throw new HTTPException(404, { message: 'Campaign not found' });
  }
  return c.json({ data: performance });
});

campaignsRouter.post('/:companyId/:id/performance/sync', async (c) => {
  const companyId = c.req.param('companyId');
  const campaignId = c.req.param('id');
  try {
    const performance = await syncCampaignFacebookPerformance(companyId, campaignId);
    if (!performance) {
      throw new HTTPException(404, { message: 'Campaign not found' });
    }
    return c.json({ data: performance });
  } catch (error) {
    if (error instanceof HTTPException) throw error;
    const reconnectRequired = isFacebookReconnectRequiredError(error);
    return c.json({
      success: false,
      code: reconnectRequired
        ? 'FACEBOOK_RECONNECT_REQUIRED'
        : 'FACEBOOK_PERFORMANCE_SYNC_FAILED',
      message: reconnectRequired
        ? 'Your Facebook connection has expired or no longer matches this Page. Reconnect Facebook in Channels, then refresh performance again.'
        : error instanceof Error
          ? error.message
          : 'Facebook performance could not be refreshed.',
    }, 422);
  }
});

campaignsRouter.get('/:companyId', async (c) => {
  const companyId = c.req.param('companyId');
  const rows = await db
    .select()
    .from(campaigns)
    .where(eq(campaigns.companyId, companyId))
    .orderBy(desc(campaigns.createdAt))
    .limit(50);
  return c.json({ data: rows });
});

// ─── GET /:companyId/:id — detail with children ─────────────────────

campaignsRouter.get('/:companyId/:id', async (c) => {
  const companyId = c.req.param('companyId');
  const id = c.req.param('id');

  const campaign = await db.query.campaigns.findFirst({
    where: and(eq(campaigns.id, id), eq(campaigns.companyId, companyId)),
  });
  if (!campaign) {
    throw new HTTPException(404, { message: 'Campaign not found' });
  }

  const targetingBlogPostId = (
    campaign.targeting as { blogPostId?: string } | null | undefined
  )?.blogPostId;
  const [bannerRows, postRows, videoRows, targetingBlogPost] = await Promise.all([
    db
      .select({
        id: banners.id,
        name: banners.name,
        size: banners.size,
        status: banners.status,
        copy: banners.copy,
        concept: banners.concept,
        angle: banners.angle,
        // img.ly scenes can be large. The editor fetches the full banner only
        // when opened; the campaign review page needs the lightweight design.
        design: sql<Record<string, unknown> | null>`
          CASE
            WHEN ${banners.design} IS NULL THEN NULL
            ELSE ${banners.design} - 'imglyScene'
          END
        `,
        imageUrl: banners.imageUrl,
        strategyTag: banners.strategyTag,
        createdAt: banners.createdAt,
        updatedAt: banners.updatedAt,
      })
      .from(banners)
      .where(eq(banners.campaignId, id))
      .orderBy(desc(banners.createdAt)),
    db
      .select({
        id: socialPosts.id,
        platform: socialPosts.platform,
        status: socialPosts.status,
        content: socialPosts.content,
        hashtags: socialPosts.hashtags,
        mediaUrls: socialPosts.mediaUrls,
        scheduledAt: socialPosts.scheduledAt,
        publishedAt: socialPosts.publishedAt,
        metrics: socialPosts.metrics,
        createdAt: socialPosts.createdAt,
      })
      .from(socialPosts)
      .where(eq(socialPosts.campaignId, id))
      .orderBy(desc(socialPosts.createdAt)),
    db
      .select({
        id: videoProjects.id,
        title: videoProjects.title,
        format: videoProjects.format,
        aspectRatio: videoProjects.aspectRatio,
        status: videoProjects.status,
        script: videoProjects.script,
        scenes: videoProjects.scenes,
        outputUrl: videoProjects.outputUrl,
        thumbnailUrl: videoProjects.thumbnailUrl,
        createdAt: videoProjects.createdAt,
        updatedAt: videoProjects.updatedAt,
      })
      .from(videoProjects)
      .where(and(eq(videoProjects.companyId, companyId), eq(videoProjects.campaignId, id)))
      .orderBy(desc(videoProjects.createdAt)),
    targetingBlogPostId
      ? db.select({
        id: blogPosts.id,
        title: blogPosts.title,
        excerpt: blogPosts.excerpt,
        metaDescription: blogPosts.metaDescription,
        keyword: blogPosts.keyword,
        wordCount: blogPosts.wordCount,
        status: blogPosts.status,
        createdAt: blogPosts.createdAt,
      }).from(blogPosts).where(and(
        eq(blogPosts.id, targetingBlogPostId),
        eq(blogPosts.companyId, companyId),
      )).limit(1)
      : Promise.resolve([]),
  ]);
  const normalizedPostRows = postRows.map((post) => {
    const normalized = normalizeSocialPost(post.content, post.hashtags);
    return {
      ...post,
      content: normalized.content,
      hashtags: normalized.hashtags,
    };
  });
  const syncedVideoRows = await Promise.all(
    videoRows.map(async (video) => {
      if (video.status !== 'rendering') return video;
      const synced = await syncCampaignVideoProject({ companyId, projectId: video.id });
      if (!synced) return video;
      return {
        id: synced.id,
        title: synced.title,
        format: synced.format,
        aspectRatio: synced.aspectRatio,
        status: synced.status,
        script: synced.script,
        scenes: synced.scenes,
        outputUrl: synced.outputUrl,
        thumbnailUrl: synced.thumbnailUrl,
        createdAt: synced.createdAt,
        updatedAt: synced.updatedAt,
      };
    }),
  );

  let linkedLaunch: typeof campaignLaunches.$inferSelect | undefined;
  let blogPost = targetingBlogPost[0] ?? null;
  // Legacy campaigns may not have targeting.blogPostId. Keep the old launch
  // lookup only as a fallback instead of scanning launch history every time.
  if (!targetingBlogPostId) {
    const launchRows = await db
      .select()
      .from(campaignLaunches)
      .where(eq(campaignLaunches.companyId, companyId))
      .orderBy(desc(campaignLaunches.createdAt))
      .limit(100);
    linkedLaunch = launchRows.find((launchRow) => {
      const steps = Array.isArray(launchRow.steps) ? launchRow.steps : [];
      return steps.some((step) => {
        const result = step.result as Record<string, unknown> | undefined;
        return result?.campaignId === id;
      });
    });
    if (linkedLaunch?.blogPostId) {
      const [legacyBlogPost] = await db.select({
        id: blogPosts.id,
        title: blogPosts.title,
        excerpt: blogPosts.excerpt,
        metaDescription: blogPosts.metaDescription,
        keyword: blogPosts.keyword,
        wordCount: blogPosts.wordCount,
        status: blogPosts.status,
        createdAt: blogPosts.createdAt,
      }).from(blogPosts).where(and(
        eq(blogPosts.id, linkedLaunch.blogPostId),
        eq(blogPosts.companyId, companyId),
      )).limit(1);
      blogPost = legacyBlogPost ?? null;
    }
  }

  return c.json({
    campaign,
    banners: bannerRows,
    socialPosts: normalizedPostRows,
    videos: syncedVideoRows,
    blogPost: blogPost ?? null,
    launch: linkedLaunch
      ? {
        id: linkedLaunch.id,
        keyword: linkedLaunch.keyword,
        blogPostId: linkedLaunch.blogPostId,
        heroImageUrl: linkedLaunch.heroImageUrl,
        createdAt: linkedLaunch.createdAt,
      }
      : null,
  });
});

// ─── GET /:companyId/:id/stream — SSE progress events ───────────────

campaignsRouter.get('/:companyId/:id/stream', async (c) => {
  const companyId = c.req.param('companyId');
  const campaignId = c.req.param('id');

  return streamSSE(c, async (stream) => {
    // Send any buffered historical events for this campaign first so a
    // late subscriber still sees prior steps. We read from the event
    // bus history but filter by campaignId.
    // (Event bus exposes clients count + history helper.)
    let closed = false;

    const handler = async (ev: BusEvent) => {
      if (closed) return;
      if (ev.companyId !== companyId) return;
      const payload = ev.payload as { kind?: string; campaignId?: string };
      if (payload?.kind !== 'campaign:step') return;
      if (payload.campaignId !== campaignId) return;

      try {
        await stream.writeSSE({
          event: 'campaign:step',
          data: JSON.stringify(ev.payload),
          id: ev.id,
        });
      } catch {
        closed = true;
      }
    };

    eventBus.on('system:broadcast', handler);

    // Heartbeat every 15s so proxies don't close the connection
    const heartbeat = setInterval(async () => {
      if (closed) return;
      try {
        await stream.writeSSE({ event: 'ping', data: Date.now().toString() });
      } catch {
        closed = true;
      }
    }, 15_000);

    // Wait for abort
    await new Promise<void>((resolve) => {
      stream.onAbort(() => {
        closed = true;
        clearInterval(heartbeat);
        eventBus.off('system:broadcast', handler);
        resolve();
      });
    });
  });
});

export default campaignsRouter;
