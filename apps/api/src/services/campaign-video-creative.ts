import { and, desc, eq } from 'drizzle-orm';
import { banners, campaigns, socialPosts, videoProjects } from '@1person/core/db';
import { db } from '../lib/db';
import { llmGenerate, extractJSON } from '../lib/llm';
import { buildBusinessContext } from './business-context';
import {
  buildBrandCreativeKit,
  brandCreativeKitSnapshot,
  renderBrandCreativeKitPrompt,
} from './brand-creative-kit';
import { saveObject } from './object-storage';
import { generateScript, breakIntoScenes, type VideoAspectRatio, type VideoFormat } from './video-engine';

type CampaignVideoAspectRatio = Extract<VideoAspectRatio, '9:16' | '16:9'>;

interface CampaignVideoBrief {
  title: string;
  hook: string;
  overlayHeadline: string;
  overlaySubheadline: string;
  cta: string;
  voiceoverText: string;
  veoPrompt: string;
}

interface VeoVideoResult {
  url: string;
  storageKey: string;
  model: string;
}

const VEO_API_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta';
const VEO_DEFAULT_MODEL = 'veo-3.1-generate-preview';
const VEO_POLL_INTERVAL_MS = 10_000;
const VEO_MAX_POLL_ATTEMPTS = 24;

function getVeoModel(): string {
  return (process.env.VEO_MODEL || VEO_DEFAULT_MODEL).trim();
}

function getVeoApiKey(): string {
  const key = process.env.GEMINI_API_KEY?.trim();
  if (!key) {
    throw new Error('GEMINI_API_KEY is not configured. Add it before generating AI videos.');
  }
  return key;
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function summarizePostText(post: typeof socialPosts.$inferSelect): string {
  const hashtags = (post.hashtags ?? []).map((tag) => `#${String(tag).replace(/^#/, '')}`);
  return [post.platform, post.content, hashtags.join(' ')]
    .filter(Boolean)
    .join(': ')
    .slice(0, 700);
}

function parseVeoError(status: number, text: string): Error {
  try {
    const parsed = JSON.parse(text) as { error?: { message?: string } };
    return new Error(parsed.error?.message || `Veo request failed (${status}).`);
  } catch {
    return new Error(text || `Veo request failed (${status}).`);
  }
}

function pickGeneratedVideoUri(operation: Record<string, any>): string | null {
  const response = operation.response ?? {};
  const samples = response.generateVideoResponse?.generatedSamples;
  const videos = response.generatedVideos;
  return samples?.[0]?.video?.uri
    ?? samples?.[0]?.video?.downloadUri
    ?? videos?.[0]?.video?.uri
    ?? videos?.[0]?.video?.downloadUri
    ?? null;
}

async function buildCampaignVideoBrief(args: {
  campaign: typeof campaigns.$inferSelect;
  format: VideoFormat;
  aspectRatio: CampaignVideoAspectRatio;
}): Promise<CampaignVideoBrief> {
  const [ctx, brandKit, campaignPosts, campaignBanners] = await Promise.all([
    buildBusinessContext(args.campaign.companyId),
    buildBrandCreativeKit(args.campaign.companyId),
    db.select().from(socialPosts)
      .where(and(
        eq(socialPosts.companyId, args.campaign.companyId),
        eq(socialPosts.campaignId, args.campaign.id),
      ))
      .orderBy(desc(socialPosts.createdAt))
      .limit(6),
    db.select().from(banners)
      .where(and(
        eq(banners.companyId, args.campaign.companyId),
        eq(banners.campaignId, args.campaign.id),
      ))
      .orderBy(desc(banners.createdAt))
      .limit(3),
  ]);

  const campaignPlan = (args.campaign.targeting as Record<string, any> | null | undefined)?.campaignPlan;
  const targeting = args.campaign.targeting as Record<string, any> | null | undefined;
  const socialExamples = campaignPosts.map(summarizePostText).join('\n');
  const bannerContext = campaignBanners
    .map((banner) => [
      banner.name,
      (banner.copy as Record<string, any> | null)?.headline,
      (banner.design as Record<string, any> | null)?.visualDirection,
      banner.strategyTag,
    ].filter(Boolean).join(' - '))
    .filter(Boolean)
    .join('\n');

  const { text } = await llmGenerate([
    {
      role: 'system',
      content: [
        'You are a senior video creative director for performance marketing.',
        'Create a campaign video brief that is suitable for Google Veo 3.1.',
        'The generated video itself must be a clean background video. Editable text/logo/CTA will be added later in IMG.LY.',
      ].join(' '),
    },
    {
      role: 'user',
      content: `Create one short campaign video creative brief.

CAMPAIGN:
- Internal campaign name: ${args.campaign.name}
- Goal: ${args.campaign.goal}
- Platform: ${args.campaign.platform}
- Audience: ${targeting?.audience || campaignPlan?.audience || 'target customers'}
- Offer/core message: ${campaignPlan?.offer || campaignPlan?.coreMessage || args.campaign.name}
- Customer problem: ${campaignPlan?.customerProblem || ''}
- Success metrics: ${(campaignPlan?.successMetrics ?? []).join(', ')}

EXISTING SOCIAL POSTS:
${socialExamples || 'No social posts yet.'}

EXISTING BANNER VISUAL DIRECTIONS:
${bannerContext || 'No banner context yet.'}

BUSINESS CONTEXT:
${ctx.fullContext.slice(0, 1800)}

${renderBrandCreativeKitPrompt(brandKit)}

VIDEO FORMAT:
- Duration target: ${args.format}
- Aspect ratio: ${args.aspectRatio}

RULES FOR VEO PROMPT:
- The Veo video must contain ZERO text, letters, numbers, captions, logos, watermarks, UI labels, signs, posters, or subtitles.
- Do not create an ad layout. Do not render buttons or badges.
- Show realistic motion that supports the campaign idea and audience.
- Use brand colors only through lighting, environment, wardrobe, props, and mood.
- Keep composition clean so editable IMG.LY text can sit on top.
- Avoid unrealistic anatomy, artifacts, distorted faces, and busy clutter.
- Include camera motion, scene progression, atmosphere, and what happens over 8 seconds.

Return ONLY JSON:
{
  "title": "short user-facing video asset title",
  "hook": "opening idea",
  "overlayHeadline": "editable headline to place over the video",
  "overlaySubheadline": "editable supporting line",
  "cta": "editable CTA",
  "voiceoverText": "optional voiceover script, natural language",
  "veoPrompt": "complete text-free video generation prompt for Veo"
}`,
    },
  ], { maxTokens: 1800 });

  const parsed = extractJSON(text) || {};
  const title = String(parsed.title || `${args.campaign.name} video`).slice(0, 220);
  const overlayHeadline = String(parsed.overlayHeadline || parsed.hook || args.campaign.name).slice(0, 120);
  const overlaySubheadline = String(parsed.overlaySubheadline || campaignPlan?.coreMessage || '').slice(0, 180);
  const cta = String(parsed.cta || 'Learn more').slice(0, 60);
  const veoPrompt = String(parsed.veoPrompt || '').trim();

  return {
    title,
    hook: String(parsed.hook || overlayHeadline).slice(0, 180),
    overlayHeadline,
    overlaySubheadline,
    cta,
    voiceoverText: String(parsed.voiceoverText || '').slice(0, 700),
    veoPrompt: veoPrompt || [
      `Create an 8-second realistic brand-safe marketing background video for: ${args.campaign.name}.`,
      `Audience: ${targeting?.audience || campaignPlan?.audience || 'target customers'}.`,
      `Goal: ${args.campaign.goal}.`,
      'Text-free video only. No typography, logos, signs, labels, captions, watermarks, or UI.',
      'Natural commercial cinematography, clean negative space for editable overlays, subtle brand-color mood.',
    ].join(' '),
  };
}

async function generateVeoVideo(args: {
  companyId: string;
  campaignId: string;
  projectId: string;
  prompt: string;
  aspectRatio: CampaignVideoAspectRatio;
}): Promise<VeoVideoResult> {
  const apiKey = getVeoApiKey();
  const model = getVeoModel();
  const startUrl = `${VEO_API_BASE_URL}/models/${model}:predictLongRunning`;
  const startResponse = await fetch(startUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': apiKey,
    },
    body: JSON.stringify({
      instances: [{ prompt: args.prompt }],
      parameters: {
        aspectRatio: args.aspectRatio,
        durationSeconds: 8,
        resolution: '720p',
      },
    }),
  });

  if (!startResponse.ok) {
    throw parseVeoError(startResponse.status, await startResponse.text());
  }

  const started = await startResponse.json() as { name?: string };
  if (!started.name) throw new Error('Veo did not return an operation id.');

  let operation: Record<string, any> | null = null;
  for (let attempt = 0; attempt < VEO_MAX_POLL_ATTEMPTS; attempt += 1) {
    await delay(VEO_POLL_INTERVAL_MS);
    const pollResponse = await fetch(`${VEO_API_BASE_URL}/${started.name}`, {
      headers: { 'x-goog-api-key': apiKey },
    });
    if (!pollResponse.ok) {
      throw parseVeoError(pollResponse.status, await pollResponse.text());
    }
    operation = await pollResponse.json() as Record<string, any>;
    if (operation.error) {
      throw new Error(operation.error.message || 'Veo video generation failed.');
    }
    if (operation.done) break;
  }

  if (!operation?.done) {
    throw new Error('Veo video generation timed out. Please try again in a few minutes.');
  }

  const videoUri = pickGeneratedVideoUri(operation);
  if (!videoUri) throw new Error('Veo finished but did not return a downloadable video URL.');

  // Veo file URLs are temporary, so persist the MP4 immediately in our object
  // storage before returning it to the UI or editor.
  const downloadResponse = await fetch(videoUri, {
    headers: { 'x-goog-api-key': apiKey },
    signal: AbortSignal.timeout(120_000),
  });
  if (!downloadResponse.ok) {
    throw parseVeoError(downloadResponse.status, await downloadResponse.text());
  }

  const bytes = Buffer.from(await downloadResponse.arrayBuffer());
  const saved = await saveObject({
    key: `campaigns/${args.companyId}/${args.campaignId}/videos/${args.projectId}/veo-${args.projectId}-current.mp4`,
    body: bytes,
    contentType: 'video/mp4',
    cacheControl: 'public, max-age=60, must-revalidate',
  });

  return {
    url: saved.url,
    storageKey: saved.key,
    model,
  };
}

export async function createCampaignVideoProject(args: {
  companyId: string;
  campaignId: string;
  format: VideoFormat;
  aspectRatio: CampaignVideoAspectRatio;
}) {
  const [existingVideo] = await db.select().from(videoProjects)
    .where(and(eq(videoProjects.companyId, args.companyId), eq(videoProjects.campaignId, args.campaignId)))
    .orderBy(desc(videoProjects.createdAt))
    .limit(1);
  if (existingVideo && existingVideo.status !== 'failed') {
    return existingVideo;
  }

  const campaign = await db.query.campaigns.findFirst({
    where: and(eq(campaigns.id, args.campaignId), eq(campaigns.companyId, args.companyId)),
  });
  if (!campaign) throw new Error('Campaign not found.');

  const [{ title: scriptTitle, script }, creativeBrief, brandKit] = await Promise.all([
    generateScript(args.companyId, { format: args.format, aspectRatio: args.aspectRatio }),
    buildCampaignVideoBrief({
      campaign,
      format: args.format,
      aspectRatio: args.aspectRatio,
    }),
    buildBrandCreativeKit(args.companyId),
  ]);
  const scenes = await breakIntoScenes(script, args.format);

  const projectValues = {
    title: creativeBrief.title || scriptTitle,
    format: args.format,
    aspectRatio: args.aspectRatio,
    status: 'rendering' as const,
    script: {
      ...script,
      hook: creativeBrief.hook || script.hook,
      cta: creativeBrief.cta || script.cta,
      voiceoverText: creativeBrief.voiceoverText || script.voiceoverText,
      overlay: {
        headline: creativeBrief.overlayHeadline,
        subheadline: creativeBrief.overlaySubheadline,
        cta: creativeBrief.cta,
      },
      creativeBrief,
      brandKit: brandCreativeKitSnapshot(brandKit),
      provider: 'google_veo',
      retryFromFailedVideoId: existingVideo?.id,
    } as any,
    scenes: scenes as any,
    outputUrl: null,
    updatedAt: new Date(),
  };

  const [project] = existingVideo
    ? await db.update(videoProjects)
      .set(projectValues)
      .where(and(eq(videoProjects.id, existingVideo.id), eq(videoProjects.companyId, args.companyId)))
      .returning()
    : await db.insert(videoProjects).values({
      companyId: args.companyId,
      campaignId: args.campaignId,
      ...projectValues,
    }).returning();
  if (!project) {
    throw new Error('Video project could not be created.');
  }

  try {
    const rendered = await generateVeoVideo({
      companyId: args.companyId,
      campaignId: args.campaignId,
      projectId: project.id,
      prompt: creativeBrief.veoPrompt,
      aspectRatio: args.aspectRatio,
    });

    const [updated] = await db.update(videoProjects)
      .set({
        status: 'ready',
        outputUrl: rendered.url,
        script: {
          ...(project.script as Record<string, any> | null),
          veo: {
            model: rendered.model,
            prompt: creativeBrief.veoPrompt,
            storageKey: rendered.storageKey,
            generatedAt: new Date().toISOString(),
          },
        } as any,
        updatedAt: new Date(),
      })
      .where(and(eq(videoProjects.id, project.id), eq(videoProjects.companyId, args.companyId)))
      .returning();

    return updated ?? project;
  } catch (error) {
    await db.update(videoProjects)
      .set({
        status: 'failed',
        script: {
          ...(project.script as Record<string, any> | null),
          error: (error as Error).message,
          failedAt: new Date().toISOString(),
        } as any,
        updatedAt: new Date(),
      })
      .where(and(eq(videoProjects.id, project.id), eq(videoProjects.companyId, args.companyId)));
    throw error;
  }
}
