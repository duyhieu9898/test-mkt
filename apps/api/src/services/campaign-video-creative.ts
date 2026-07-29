import { and, desc, eq } from 'drizzle-orm';
import { randomUUID } from 'crypto';
import { assetLibrary, banners, campaigns, socialPosts, videoProjects } from '@1person/core/db';
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
import { buildContentLanguageInstruction, normalizeContentLanguage } from '../lib/language';
import { readGoogleDriveImageFile } from './google-drive-auth';
import { readOneDriveImageFile } from './onedrive-auth';
import { chargeFixedCredits } from '../lib/credits';
import { FIXED_CREDIT_COSTS } from '../lib/credit-costs';

type CampaignVideoAspectRatio = Extract<VideoAspectRatio, '9:16' | '16:9'>;

export type CampaignVideoReferenceImageInput =
  | { type: 'asset'; assetId: string }
  | { type: 'google_drive'; fileId: string; fileName?: string }
  | { type: 'onedrive'; fileId: string; fileName?: string };

type ResolvedVideoReferenceImage = {
  assetId: string;
  url: string;
  dataUrl?: string;
  name: string;
  mimeType: string;
  sourceType: CampaignVideoReferenceImageInput['type'];
};

export class UnsupportedVideoReferenceImageError extends Error {
  constructor(message = 'Use a JPG or PNG image for video. Other formats are not supported by the video model.') {
    super(message);
    this.name = 'UnsupportedVideoReferenceImageError';
  }
}

interface CampaignVideoBrief {
  title: string;
  hook: string;
  overlayHeadline: string;
  overlaySubheadline: string;
  cta: string;
  voiceoverText: string;
  videoPrompt: string;
}

interface GeneratedVideoResult {
  url: string;
  storageKey: string;
  provider: 'openrouter';
  model: string;
  jobId: string;
  sourceUrl?: string;
}
interface SubmittedVideoJob {
  provider: 'openrouter';
  model: string;
  jobId: string;
  pollingUrl: string;
  generationId?: string;
}

const OPENROUTER_API_BASE = 'https://openrouter.ai/api/v1';
const OPENROUTER_VIDEO_DEFAULT_MODEL = 'x-ai/grok-imagine-video-1.5';
const OPENROUTER_VIDEO_DEFAULT_DURATION_SECONDS = 8;
const OPENROUTER_VIDEO_DEFAULT_RESOLUTION = '720p';
const OPENROUTER_ALLOWED_VIDEO_RESOLUTIONS = new Set(['480p', '720p', '1080p', '1K', '2K', '4K']);

interface OpenRouterVideoJob {
  id?: string;
  polling_url?: string;
  status?: 'pending' | 'in_progress' | 'completed' | 'failed' | string;
  generation_id?: string;
  unsigned_urls?: string[];
  error?: string;
  usage?: Record<string, unknown>;
}

function optionalEnv(...names: string[]): string | undefined {
  for (const name of names) {
    const value = process.env[name]?.trim();
    if (value) return value;
  }
  return undefined;
}

function requiredEnv(name: string, label: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing ${name}. Configure ${label} before generating AI videos.`);
  return value;
}

function getOpenRouterApiKey(): string {
  return requiredEnv('OPENROUTER_API_KEY', 'OpenRouter video generation');
}

function getOpenRouterVideoModel(): string {
  return optionalEnv('OPENROUTER_VIDEO_MODEL') || OPENROUTER_VIDEO_DEFAULT_MODEL;
}

function getOpenRouterVideoDurationSeconds(): number {
  const raw = optionalEnv('OPENROUTER_VIDEO_DURATION_SECONDS');
  const duration = raw ? Number(raw) : OPENROUTER_VIDEO_DEFAULT_DURATION_SECONDS;
  if (Number.isFinite(duration) && duration >= 1 && duration <= 30) return Math.round(duration);
  throw new Error('OPENROUTER_VIDEO_DURATION_SECONDS must be a number from 1 to 30.');
}

function getOpenRouterVideoResolution(): string {
  const raw = optionalEnv('OPENROUTER_VIDEO_RESOLUTION') || OPENROUTER_VIDEO_DEFAULT_RESOLUTION;
  const normalized = raw.toLowerCase() === '540p' ? '480p' : raw;
  if (OPENROUTER_ALLOWED_VIDEO_RESOLUTIONS.has(normalized)) return normalized;
  throw new Error(
    `OPENROUTER_VIDEO_RESOLUTION must be one of 480p, 720p, 1080p, 1K, 2K, or 4K. Current value: ${raw}`,
  );
}

function shouldGenerateOpenRouterAudio(): boolean {
  const raw = optionalEnv('OPENROUTER_VIDEO_GENERATE_AUDIO');
  if (!raw) return true;
  return !['false', '0', 'no', 'off'].includes(raw.toLowerCase());
}

function imageExtensionFromMime(mimeType: string, fallbackName?: string): string {
  const fromName = fallbackName?.split('.').pop()?.toLowerCase();
  if (fromName && ['jpg', 'jpeg', 'jpe', 'jfif', 'png'].includes(fromName)) {
    return fromName === 'jpeg' || fromName === 'jpe' || fromName === 'jfif' ? 'jpg' : fromName;
  }
  if (mimeType === 'image/png') return 'png';
  return 'jpg';
}

function resolveSupportedVideoImageMime(mimeType: string, fallbackName?: string): string {
  const value = mimeType.split(';')[0]?.trim().toLowerCase() || '';
  if (value === 'image/jpeg' || value === 'image/png') return value;
  const ext = fallbackName?.split('.').pop()?.toLowerCase();
  if (ext && ['jpg', 'jpeg', 'jpe', 'jfif'].includes(ext)) return 'image/jpeg';
  if (ext === 'png') return 'image/png';
  throw new UnsupportedVideoReferenceImageError();
}

function imageDataUrl(buffer: Buffer, mimeType: string): string {
  return `data:${mimeType};base64,${buffer.toString('base64')}`;
}

async function fetchImageDataUrl(url: string, mimeType: string): Promise<string | undefined> {
  try {
    const response = await fetch(url, {
      headers: { Accept: mimeType },
      signal: AbortSignal.timeout(20000),
    });
    if (!response.ok) return undefined;
    const bytes = Buffer.from(await response.arrayBuffer());
    return imageDataUrl(bytes, mimeType);
  } catch {
    return undefined;
  }
}

async function persistReferenceImageAsset(args: {
  companyId: string;
  campaignId: string;
  sourceType: Exclude<CampaignVideoReferenceImageInput['type'], 'asset'>;
  name: string;
  buffer: Buffer;
  mimeType: string;
  providerFileId: string;
}): Promise<ResolvedVideoReferenceImage> {
  const mimeType = resolveSupportedVideoImageMime(args.mimeType, args.name);
  const extension = imageExtensionFromMime(mimeType, args.name);
  const fileId = randomUUID();
  const stored = await saveObject({
    key: `assets/${args.companyId}/video-reference-images/${fileId}.${extension}`,
    body: args.buffer,
    contentType: mimeType,
    cacheControl: 'public, max-age=3600',
  });

  const [asset] = await db.insert(assetLibrary).values({
    companyId: args.companyId,
    campaignId: args.campaignId,
    name: args.name.replace(/\.[^/.]+$/, '') || 'Video reference image',
    type: 'image',
    source: 'upload',
    url: stored.url,
    mimeType,
    fileSize: args.buffer.length,
    tags: ['campaign-video', 'reference-image', args.sourceType],
    metadata: {
      storageProvider: stored.provider,
      storageKey: stored.key,
      sourceProvider: args.sourceType,
      providerFileId: args.providerFileId,
      originalFilename: args.name,
    },
  }).returning();

  if (!asset) throw new Error('Could not save the selected image for video generation.');
  return {
    assetId: asset.id,
    url: stored.url,
    dataUrl: imageDataUrl(args.buffer, mimeType),
    name: asset.name || args.name.replace(/\.[^/.]+$/, '') || 'Video reference image',
    mimeType,
    sourceType: args.sourceType,
  };
}

async function resolveVideoReferenceImage(args: {
  companyId: string;
  campaignId: string;
  userId?: string;
  input?: CampaignVideoReferenceImageInput | null;
}): Promise<ResolvedVideoReferenceImage | null> {
  if (!args.input) return null;

  if (args.input.type === 'asset') {
    const asset = await db.query.assetLibrary.findFirst({
      where: and(
        eq(assetLibrary.id, args.input.assetId),
        eq(assetLibrary.companyId, args.companyId),
      ),
    });
    if (!asset || asset.type !== 'image' || !asset.url) {
      throw new Error('The selected video image is missing or is not an image asset.');
    }
    const mimeType = resolveSupportedVideoImageMime(asset.mimeType || '', asset.name);
    return {
      assetId: asset.id,
      url: asset.url,
      dataUrl: await fetchImageDataUrl(asset.url, mimeType),
      name: asset.name,
      mimeType,
      sourceType: 'asset',
    };
  }

  if (!args.userId) {
    throw new Error('Reconnect your Drive account before using a Drive image for video.');
  }

  if (args.input.type === 'google_drive') {
    const file = await readGoogleDriveImageFile(args.companyId, args.userId, args.input.fileId);
    return persistReferenceImageAsset({
      companyId: args.companyId,
      campaignId: args.campaignId,
      sourceType: 'google_drive',
      name: args.input.fileName || file.name,
      buffer: file.buffer,
      mimeType: file.mimeType,
      providerFileId: file.id,
    });
  }

  const file = await readOneDriveImageFile(args.companyId, args.userId, args.input.fileId);
  return persistReferenceImageAsset({
    companyId: args.companyId,
    campaignId: args.campaignId,
    sourceType: 'onedrive',
    name: args.input.fileName || file.name,
    buffer: file.buffer,
    mimeType: file.mimeType,
    providerFileId: file.id,
  });
}

function buildOpenRouterHeaders(): Record<string, string> {
  return {
    Authorization: `Bearer ${getOpenRouterApiKey()}`,
    'Content-Type': 'application/json',
    ...(optionalEnv('OPENROUTER_SITE_URL', 'WEB_URL') ? { 'HTTP-Referer': optionalEnv('OPENROUTER_SITE_URL', 'WEB_URL')! } : {}),
    ...(optionalEnv('OPENROUTER_APP_NAME') ? { 'X-Title': optionalEnv('OPENROUTER_APP_NAME')! } : {}),
  };
}

function normalizeOpenRouterPollingUrl(value: string): string {
  const trimmed = value.trim();
  if (/^https?:\/\//i.test(trimmed)) return new URL(trimmed).toString();
  if (trimmed.startsWith('/api/v1/')) return new URL(trimmed, 'https://openrouter.ai').toString();
  if (trimmed.startsWith('/')) return `${OPENROUTER_API_BASE}${trimmed}`;
  return new URL(trimmed, `${OPENROUTER_API_BASE}/`).toString();
}

function openRouterDurationLabel(): string {
  return `${getOpenRouterVideoDurationSeconds()} seconds`;
}

function summarizePostText(post: typeof socialPosts.$inferSelect): string {
  const hashtags = (post.hashtags ?? []).map((tag) => `#${String(tag).replace(/^#/, '')}`);
  return [post.platform, post.content, hashtags.join(' ')]
    .filter(Boolean)
    .join(': ')
    .slice(0, 700);
}

async function buildCampaignVideoBrief(args: {
  campaign: typeof campaigns.$inferSelect;
  format: VideoFormat;
  aspectRatio: CampaignVideoAspectRatio;
  creativeNotes?: string;
  language?: string;
  referenceImage?: ResolvedVideoReferenceImage | null;
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
  const language = normalizeContentLanguage(args.language ?? ctx.language);
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
        'Create a campaign video brief that is suitable for an AI text-to-video model.',
        'The generated video itself must be a clean background video. Editable text/logo/CTA can be added later.',
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
${buildContentLanguageInstruction(language)}

${renderBrandCreativeKitPrompt(brandKit)}

VIDEO FORMAT:
- Duration target: ${args.format}
- Aspect ratio: ${args.aspectRatio}
${args.creativeNotes?.trim()
        ? `
USER DIRECTION FOR THIS VERSION:
${args.creativeNotes.trim().slice(0, 1200)}
`
        : ''}
${args.referenceImage
        ? `
SELECTED REFERENCE IMAGE:
- Name: ${args.referenceImage.name}
- Source: ${args.referenceImage.sourceType}
- The video model will receive this image as the first frame. Write the video prompt so motion continues naturally from this image.
- Do not ask the model to recreate text or logo details from the image; keep the video clean and brand-safe.
`
        : ''}

RULES FOR VIDEO PROMPT:
- The generated video must contain ZERO text, letters, numbers, captions, logos, watermarks, UI labels, signs, posters, or subtitles.
- Do not create an ad layout. Do not render buttons or badges.
- Show realistic motion that supports the campaign idea and audience.
- Use brand colors only through lighting, environment, wardrobe, props, and mood.
- Keep composition clean so editable overlay text can sit on top.
- Avoid unrealistic anatomy, artifacts, distorted faces, and busy clutter.
- Include camera motion, scene progression, atmosphere, and what happens over ${openRouterDurationLabel()}.

Return ONLY JSON:
{
  "title": "short user-facing video asset title",
  "hook": "opening idea",
  "overlayHeadline": "editable headline to place over the video",
  "overlaySubheadline": "editable supporting line",
  "cta": "editable CTA",
  "voiceoverText": "optional voiceover script, natural language",
  "videoPrompt": "complete text-free video generation prompt"
}`,
    },
  ], { maxTokens: 1800 });

  const parsed = extractJSON(text) || {};
  const title = String(parsed.title || `${args.campaign.name} video`).slice(0, 220);
  const overlayHeadline = String(parsed.overlayHeadline || parsed.hook || args.campaign.name).slice(0, 120);
  const overlaySubheadline = String(parsed.overlaySubheadline || campaignPlan?.coreMessage || '').slice(0, 180);
  const cta = String(parsed.cta || 'Learn more').slice(0, 60);
  const videoPrompt = String(parsed.videoPrompt || parsed.veoPrompt || '').trim();

  return {
    title,
    hook: String(parsed.hook || overlayHeadline).slice(0, 180),
    overlayHeadline,
    overlaySubheadline,
    cta,
    voiceoverText: String(parsed.voiceoverText || '').slice(0, 700),
    videoPrompt: videoPrompt || [
      `Create a ${openRouterDurationLabel()} realistic brand-safe marketing background video for: ${args.campaign.name}.`,
      `Audience: ${targeting?.audience || campaignPlan?.audience || 'target customers'}.`,
      `Goal: ${args.campaign.goal}.`,
      'Text-free video only. No typography, logos, signs, labels, captions, watermarks, or UI.',
      'Natural commercial cinematography, clean negative space for editable overlays, subtle brand-color mood.',
    ].join(' '),
  };
}

async function readOpenRouterError(response: Response): Promise<string> {
  const body = await response.text().catch(() => '');
  if (!body) return `OpenRouter video request failed (${response.status}).`;
  try {
    const parsed = JSON.parse(body) as { error?: { message?: string } | string; message?: string };
    if (typeof parsed.error === 'string') return parsed.error;
    return parsed.error?.message || parsed.message || body.slice(0, 500);
  } catch {
    return body.slice(0, 500);
  }
}

async function submitOpenRouterVideoJob(args: {
  companyId: string;
  campaignId: string;
  projectId: string;
  prompt: string;
  aspectRatio: CampaignVideoAspectRatio;
  referenceImage?: ResolvedVideoReferenceImage | null;
}): Promise<SubmittedVideoJob> {
  const model = getOpenRouterVideoModel();
  const body: Record<string, unknown> = {
    model,
    prompt: args.prompt.slice(0, 5000),
    aspect_ratio: args.aspectRatio,
    duration: getOpenRouterVideoDurationSeconds(),
    resolution: getOpenRouterVideoResolution(),
    generate_audio: shouldGenerateOpenRouterAudio(),
  };
  if (args.referenceImage?.url) {
    const imageUrl = args.referenceImage.dataUrl || args.referenceImage.url;
    body.frame_images = [
      {
        type: 'image_url',
        image_url: { url: imageUrl },
        frame_type: 'first_frame',
      },
    ];
  }
  const response = await fetch(`${OPENROUTER_API_BASE}/videos`, {
    method: 'POST',
    headers: buildOpenRouterHeaders(),
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const detail = await readOpenRouterError(response);
    if (response.status === 402) {
      throw new Error(`OpenRouter has insufficient credits for video generation. ${detail}`);
    }
    if (response.status === 429) {
      throw new Error(`OpenRouter video generation is rate limited. ${detail}`);
    }
    throw new Error(`OpenRouter video generation failed (${response.status}): ${detail}`);
  }

  const started = (await response.json()) as OpenRouterVideoJob;
  const jobId = started.id;
  if (!jobId) throw new Error('OpenRouter did not return a video job ID.');

  return {
    provider: 'openrouter',
    model,
    jobId,
    pollingUrl: normalizeOpenRouterPollingUrl(started.polling_url || `/videos/${jobId}`),
    generationId: started.generation_id,
  };
}

async function pollOpenRouterVideoJob(args: {
  jobId: string;
  pollingUrl?: string;
}): Promise<OpenRouterVideoJob> {
  const response = await fetch(
    normalizeOpenRouterPollingUrl(args.pollingUrl || `/videos/${args.jobId}`),
    { headers: buildOpenRouterHeaders() },
  );
  if (!response.ok) {
    throw new Error(`OpenRouter video status check failed (${response.status}): ${await readOpenRouterError(response)}`);
  }
  return (await response.json()) as OpenRouterVideoJob;
}

async function downloadOpenRouterVideo(args: {
  jobId: string;
  contentUrl?: string;
}): Promise<{ bytes: Buffer; contentType: string; sourceUrl: string }> {
  const sourceUrl = normalizeOpenRouterPollingUrl(args.contentUrl || `/videos/${args.jobId}/content?index=0`);
  const needsAuth = sourceUrl.startsWith(`${OPENROUTER_API_BASE}/`);
  const response = await fetch(sourceUrl, {
    headers: needsAuth ? { Authorization: `Bearer ${getOpenRouterApiKey()}` } : undefined,
  });
  if (!response.ok) {
    throw new Error(`OpenRouter video download failed (${response.status}): ${await readOpenRouterError(response)}`);
  }
  const arrayBuffer = await response.arrayBuffer();
  return {
    bytes: Buffer.from(arrayBuffer),
    contentType: response.headers.get('content-type') || 'video/mp4',
    sourceUrl,
  };
}

async function persistCompletedOpenRouterVideo(args: {
  companyId: string;
  campaignId: string;
  projectId: string;
  model: string;
  jobId: string;
  contentUrl?: string;
}): Promise<GeneratedVideoResult> {
  const source = await downloadOpenRouterVideo({
    jobId: args.jobId,
    contentUrl: args.contentUrl,
  });
  const extension = source.contentType.includes('webm') ? 'webm' : 'mp4';
  const saved = await saveObject({
    key: `campaigns/${args.companyId}/${args.campaignId}/videos/${args.projectId}/openrouter-veo-31-fast-${args.projectId}-current.${extension}`,
    body: source.bytes,
    contentType: source.contentType,
    cacheControl: 'public, max-age=60, must-revalidate',
  });

  return {
    url: saved.url,
    storageKey: saved.key,
    provider: 'openrouter',
    model: args.model,
    jobId: args.jobId,
    sourceUrl: source.sourceUrl,
  };
}

export async function syncCampaignVideoProject(args: {
  companyId: string;
  projectId: string;
}) {
  const [project] = await db.select().from(videoProjects)
    .where(and(eq(videoProjects.id, args.projectId), eq(videoProjects.companyId, args.companyId)))
    .limit(1);
  if (!project || project.status !== 'rendering') return project ?? null;

  const script = (project.script ?? {}) as Record<string, any>;
  const generation = script.videoGeneration as Record<string, any> | undefined;
  const jobId = String(generation?.jobId ?? '');
  if (!jobId || !project.campaignId) return project;
  const provider = String(generation?.provider ?? script.provider ?? 'openrouter');
  if (provider !== 'openrouter') {
    const [failed] = await db.update(videoProjects)
      .set({
        status: 'failed',
        script: {
          ...script,
          error: 'This video was created with a disabled video provider. Please generate a new video.',
          failedAt: new Date().toISOString(),
          videoGeneration: {
            ...generation,
            status: 'failed',
            failureMessage: 'Unsupported video provider after provider migration.',
            checkedAt: new Date().toISOString(),
          },
        } as any,
        updatedAt: new Date(),
      })
      .where(and(eq(videoProjects.id, project.id), eq(videoProjects.companyId, args.companyId)))
      .returning();
    return failed ?? project;
  }

  const job = await pollOpenRouterVideoJob({
    jobId,
    pollingUrl: typeof generation?.pollingUrl === 'string' ? generation.pollingUrl : undefined,
  });
  if (job.status !== 'completed' && job.status !== 'failed') {
    const [updated] = await db.update(videoProjects)
      .set({
        script: {
          ...script,
          videoGeneration: {
            ...generation,
            status: job.status ?? generation?.status ?? 'pending',
            generationId: job.generation_id ?? generation?.generationId,
            usage: job.usage ?? generation?.usage,
            checkedAt: new Date().toISOString(),
          },
        } as any,
        updatedAt: new Date(),
      })
      .where(and(eq(videoProjects.id, project.id), eq(videoProjects.companyId, args.companyId)))
      .returning();
    return updated ?? project;
  }

  if (job.status === 'failed') {
    const [failed] = await db.update(videoProjects)
      .set({
        status: 'failed',
        script: {
          ...script,
          error: job.error || 'OpenRouter Veo video generation failed.',
          failedAt: new Date().toISOString(),
          videoGeneration: {
            ...generation,
            status: job.status,
            failureMessage: job.error,
            checkedAt: new Date().toISOString(),
          },
        } as any,
        updatedAt: new Date(),
      })
      .where(and(eq(videoProjects.id, project.id), eq(videoProjects.companyId, args.companyId)))
      .returning();
    return failed ?? project;
  }

  const rendered = await persistCompletedOpenRouterVideo({
    companyId: args.companyId,
    campaignId: project.campaignId,
    projectId: project.id,
    model: String(generation?.model ?? getOpenRouterVideoModel()),
    jobId,
    contentUrl: job.unsigned_urls?.[0],
  });
  const [updated] = await db.update(videoProjects)
    .set({
      status: 'ready',
      outputUrl: rendered.url,
      script: {
        ...script,
        videoGeneration: {
          ...generation,
          provider: rendered.provider,
          jobId: rendered.jobId,
          model: rendered.model,
          storageKey: rendered.storageKey,
          sourceUrl: rendered.sourceUrl,
          status: job.status,
          generationId: job.generation_id ?? generation?.generationId,
          usage: job.usage ?? generation?.usage,
          completedAt: new Date().toISOString(),
          checkedAt: new Date().toISOString(),
        },
      } as any,
      updatedAt: new Date(),
    })
    .where(and(eq(videoProjects.id, project.id), eq(videoProjects.companyId, args.companyId)))
    .returning();

  const readyProject = updated ?? project;
  try {
    const creditChargedAt = new Date().toISOString();
    const requestedByUserId = typeof script.requestedByUserId === 'string'
      ? script.requestedByUserId
      : typeof generation?.requestedByUserId === 'string'
        ? generation.requestedByUserId
        : undefined;
    await chargeFixedCredits(args.companyId, FIXED_CREDIT_COSTS.campaignVideo, {
      featureKey: 'campaign_video',
      tier: 'premium',
      refKind: 'video_project',
      refId: project.id,
      actor: requestedByUserId ? `user:${requestedByUserId}` : 'system',
      note: `AI campaign video (${project.format}, ${project.aspectRatio}) completed`,
    });
    const readyScript = (readyProject.script ?? {}) as Record<string, any>;
    const readyGeneration = readyScript.videoGeneration as Record<string, any> | undefined;
    const [chargedProject] = await db.update(videoProjects)
      .set({
        script: {
          ...readyScript,
          videoGeneration: {
            ...readyGeneration,
            creditsChargedAt: creditChargedAt,
            creditsCharged: FIXED_CREDIT_COSTS.campaignVideo,
          },
        } as any,
        updatedAt: new Date(),
      })
      .where(and(eq(videoProjects.id, project.id), eq(videoProjects.companyId, args.companyId)))
      .returning();
    return chargedProject ?? readyProject;
  } catch (error) {
    console.error(`[Video] Video completed but credit charge failed for project ${project.id}:`, error);
    return readyProject;
  }
}

export async function createCampaignVideoProject(args: {
  companyId: string;
  campaignId: string;
  userId?: string;
  format: VideoFormat;
  aspectRatio: CampaignVideoAspectRatio;
  creativeNotes?: string;
  forceNew?: boolean;
  language?: string;
  referenceImage?: CampaignVideoReferenceImageInput | null;
}) {
  const [existingVideo] = await db.select().from(videoProjects)
    .where(and(eq(videoProjects.companyId, args.companyId), eq(videoProjects.campaignId, args.campaignId)))
    .orderBy(desc(videoProjects.createdAt))
    .limit(1);
  const shouldReuseExisting = !args.forceNew && !args.creativeNotes?.trim() && !args.referenceImage;
  if (shouldReuseExisting && existingVideo && existingVideo.status !== 'failed') {
    return existingVideo;
  }

  const campaign = await db.query.campaigns.findFirst({
    where: and(eq(campaigns.id, args.campaignId), eq(campaigns.companyId, args.companyId)),
  });
  if (!campaign) throw new Error('Campaign not found.');

  const referenceImage = await resolveVideoReferenceImage({
    companyId: args.companyId,
    campaignId: args.campaignId,
    userId: args.userId,
    input: args.referenceImage,
  });

  const [{ title: scriptTitle, script }, creativeBrief, brandKit] = await Promise.all([
    generateScript(args.companyId, { format: args.format, aspectRatio: args.aspectRatio, language: args.language }),
    buildCampaignVideoBrief({
      campaign,
      format: args.format,
      aspectRatio: args.aspectRatio,
      creativeNotes: args.creativeNotes,
      language: args.language,
      referenceImage,
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
      provider: 'openrouter',
      requestedByUserId: args.userId,
      referenceImage: referenceImage ? {
        assetId: referenceImage.assetId,
        url: referenceImage.url,
        name: referenceImage.name,
        mimeType: referenceImage.mimeType,
        sourceType: referenceImage.sourceType,
      } : undefined,
      retryFromFailedVideoId: existingVideo?.id,
      userDirection: args.creativeNotes?.trim() || undefined,
    } as any,
    scenes: scenes as any,
    outputUrl: null,
    updatedAt: new Date(),
  };

  const [project] = existingVideo && !args.forceNew
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
    const submitted = await submitOpenRouterVideoJob({
      companyId: args.companyId,
      campaignId: args.campaignId,
      projectId: project.id,
      prompt: creativeBrief.videoPrompt,
      aspectRatio: args.aspectRatio,
      referenceImage,
    });

    const [updated] = await db.update(videoProjects)
      .set({
        status: 'rendering',
        outputUrl: null,
        script: {
          ...(project.script as Record<string, any> | null),
          videoGeneration: {
            provider: submitted.provider,
            jobId: submitted.jobId,
            model: submitted.model,
            prompt: creativeBrief.videoPrompt,
            referenceImage: referenceImage ? {
              assetId: referenceImage.assetId,
              url: referenceImage.url,
              name: referenceImage.name,
              mimeType: referenceImage.mimeType,
              sourceType: referenceImage.sourceType,
            } : undefined,
            pollingUrl: submitted.pollingUrl,
            generationId: submitted.generationId,
            durationSeconds: getOpenRouterVideoDurationSeconds(),
            resolution: getOpenRouterVideoResolution(),
            generateAudio: shouldGenerateOpenRouterAudio(),
            status: 'pending',
            requestedByUserId: args.userId,
            submittedAt: new Date().toISOString(),
          },
        } as any,
        updatedAt: new Date(),
      })
      .where(and(eq(videoProjects.id, project.id), eq(videoProjects.companyId, args.companyId)))
      .returning();

    return { ...(updated ?? project), justSubmitted: true };
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
