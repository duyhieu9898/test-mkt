import {
  BedrockRuntimeClient,
  GetAsyncInvokeCommand,
  StartAsyncInvokeCommand,
} from '@aws-sdk/client-bedrock-runtime';
import {
  GetObjectCommand,
  ListObjectsV2Command,
  S3Client,
} from '@aws-sdk/client-s3';
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
  videoPrompt: string;
}

interface GeneratedVideoResult {
  url: string;
  storageKey: string;
  provider: 'aws_bedrock_luma';
  model: string;
  jobId: string;
  sourceStorageKey?: string;
}

const BEDROCK_DEFAULT_REGION = 'us-west-2';
const BEDROCK_LUMA_DEFAULT_MODEL = 'luma.ray-v2:0';
const BEDROCK_LUMA_POLL_INTERVAL_MS = 10_000;
const BEDROCK_LUMA_MAX_POLL_ATTEMPTS = 72;
const BEDROCK_LUMA_DURATION = '9s';
const BEDROCK_LUMA_RESOLUTION = '720p';

interface AwsCredentials {
  accessKeyId: string;
  secretAccessKey: string;
}

interface S3UriParts {
  bucket: string;
  prefix: string;
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

function getAwsCredentials(): AwsCredentials | undefined {
  const accessKeyId = optionalEnv('AWS_S3_ACCESS_KEY_ID');
  const secretAccessKey = optionalEnv('AWS_S3_SECRET_ACCESS_KEY');
  return accessKeyId && secretAccessKey ? { accessKeyId, secretAccessKey } : undefined;
}

function getBedrockRegion(): string {
  return optionalEnv('AWS_BEDROCK_REGION', 'AWS_REGION') || BEDROCK_DEFAULT_REGION;
}

function getBedrockLumaModel(): string {
  const model = optionalEnv('AWS_BEDROCK_LUMA_MODEL_ID') || BEDROCK_LUMA_DEFAULT_MODEL;
  if (model !== BEDROCK_LUMA_DEFAULT_MODEL) {
    throw new Error(`AWS_BEDROCK_LUMA_MODEL_ID must be "${BEDROCK_LUMA_DEFAULT_MODEL}" for Luma Ray 2.`);
  }
  return model;
}

function getBedrockLumaDuration(): '5s' | '9s' {
  const duration = optionalEnv('AWS_BEDROCK_LUMA_DURATION') || BEDROCK_LUMA_DURATION;
  if (duration === '5s' || duration === '9s') return duration;
  throw new Error('AWS_BEDROCK_LUMA_DURATION must be either "5s" or "9s" for Luma Ray 2.');
}

function getBedrockLumaResolution(): '540p' | '720p' {
  const resolution = optionalEnv('AWS_BEDROCK_LUMA_RESOLUTION') || BEDROCK_LUMA_RESOLUTION;
  if (resolution === '540p' || resolution === '720p') return resolution;
  throw new Error('AWS_BEDROCK_LUMA_RESOLUTION must be either "540p" or "720p" for Luma Ray 2.');
}

function trimSlashes(value: string) {
  return value.replace(/^\/+|\/+$/g, '');
}

function parseS3Uri(uri: string): S3UriParts {
  const match = uri.trim().match(/^s3:\/\/([^/]+)(?:\/(.*))?$/);
  if (!match?.[1]) {
    throw new Error('AWS_BEDROCK_VIDEO_OUTPUT_S3_URI must look like s3://bucket-name/optional-prefix.');
  }
  return {
    bucket: match[1],
    prefix: trimSlashes(match[2] || ''),
  };
}

function joinS3Prefix(...parts: Array<string | undefined | null>) {
  return parts.map((part) => trimSlashes(String(part || ''))).filter(Boolean).join('/');
}

function formatS3Uri(parts: S3UriParts) {
  return `s3://${parts.bucket}${parts.prefix ? `/${parts.prefix}` : ''}`;
}

function getBedrockOutputBase(): S3UriParts {
  return parseS3Uri(requiredEnv('AWS_BEDROCK_VIDEO_OUTPUT_S3_URI', 'AWS Bedrock Luma video output'));
}

function getBedrockOutputBucketOwner(): string | undefined {
  const owner = optionalEnv('AWS_BEDROCK_VIDEO_OUTPUT_BUCKET_OWNER');
  if (!owner) return undefined;
  if (!/^\d{12}$/.test(owner)) {
    throw new Error('AWS_BEDROCK_VIDEO_OUTPUT_BUCKET_OWNER must be the 12-digit AWS account ID that owns the Bedrock output bucket.');
  }
  return owner;
}

function bedrockS3OutputHelpMessage(output: S3UriParts): string {
  return [
    'AWS Bedrock rejected the S3 output location for Luma video generation.',
    `Current Bedrock region: ${getBedrockRegion()}.`,
    `Current output bucket: s3://${output.bucket}${output.prefix ? `/${output.prefix}` : ''}.`,
    'Check that this bucket exists in the same region as AWS_BEDROCK_REGION, that the AWS_S3_ACCESS_KEY_ID/AWS_S3_SECRET_ACCESS_KEY user can write to the configured prefix, and that the account has Bedrock model access enabled.',
    'If the bucket belongs to another AWS account, set AWS_BEDROCK_VIDEO_OUTPUT_BUCKET_OWNER to that bucket owner account ID.',
  ].join(' ');
}

function isInvalidBedrockS3Credentials(error: unknown): boolean {
  const record = error as { name?: string; message?: string };
  return record?.name === 'ValidationException'
    && /invalid s3 credentials/i.test(record.message ?? '');
}

function createBedrockClient() {
  return new BedrockRuntimeClient({
    region: getBedrockRegion(),
    credentials: getAwsCredentials(),
  });
}

function createBedrockOutputS3Client() {
  return new S3Client({
    region: getBedrockRegion(),
    credentials: getAwsCredentials(),
  });
}

async function s3BodyToBuffer(responseBody: unknown): Promise<Buffer> {
  const body = responseBody as {
    transformToByteArray?: () => Promise<Uint8Array>;
    [Symbol.asyncIterator]?: () => AsyncIterableIterator<Buffer | Uint8Array | string>;
  };
  if (typeof body.transformToByteArray === 'function') {
    return Buffer.from(await body.transformToByteArray());
  }

  const chunks: Buffer[] = [];
  for await (const chunk of body as AsyncIterable<Buffer | Uint8Array | string>) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
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

async function buildCampaignVideoBrief(args: {
  campaign: typeof campaigns.$inferSelect;
  format: VideoFormat;
  aspectRatio: CampaignVideoAspectRatio;
  creativeNotes?: string;
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

RULES FOR VIDEO PROMPT:
- The generated video must contain ZERO text, letters, numbers, captions, logos, watermarks, UI labels, signs, posters, or subtitles.
- Do not create an ad layout. Do not render buttons or badges.
- Show realistic motion that supports the campaign idea and audience.
- Use brand colors only through lighting, environment, wardrobe, props, and mood.
- Keep composition clean so editable overlay text can sit on top.
- Avoid unrealistic anatomy, artifacts, distorted faces, and busy clutter.
- Include camera motion, scene progression, atmosphere, and what happens over ${getBedrockLumaDuration()}.

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
      `Create a ${getBedrockLumaDuration()} realistic brand-safe marketing background video for: ${args.campaign.name}.`,
      `Audience: ${targeting?.audience || campaignPlan?.audience || 'target customers'}.`,
      `Goal: ${args.campaign.goal}.`,
      'Text-free video only. No typography, logos, signs, labels, captions, watermarks, or UI.',
      'Natural commercial cinematography, clean negative space for editable overlays, subtle brand-color mood.',
    ].join(' '),
  };
}

async function findBedrockGeneratedMp4(args: {
  bucket: string;
  prefix: string;
}): Promise<{ key: string; bytes: Buffer }> {
  const client = createBedrockOutputS3Client();
  const listed = await client.send(new ListObjectsV2Command({
    Bucket: args.bucket,
    Prefix: args.prefix ? `${args.prefix.replace(/\/+$/, '')}/` : undefined,
  }));
  const mp4 = (listed.Contents ?? [])
    .filter((object) => object.Key?.toLowerCase().endsWith('.mp4'))
    .sort((a, b) => (b.LastModified?.getTime() ?? 0) - (a.LastModified?.getTime() ?? 0))[0];

  if (!mp4?.Key) {
    throw new Error('Luma finished but no MP4 was found in the configured Bedrock S3 output prefix.');
  }

  const object = await client.send(new GetObjectCommand({
    Bucket: args.bucket,
    Key: mp4.Key,
  }));
  if (!object.Body) {
    throw new Error('Luma generated an MP4 object, but it could not be read from S3.');
  }

  return {
    key: mp4.Key,
    bytes: await s3BodyToBuffer(object.Body),
  };
}

async function generateBedrockLumaVideo(args: {
  companyId: string;
  campaignId: string;
  projectId: string;
  prompt: string;
  aspectRatio: CampaignVideoAspectRatio;
}): Promise<GeneratedVideoResult> {
  const model = getBedrockLumaModel();
  const outputBase = getBedrockOutputBase();
  const outputPrefix = joinS3Prefix(
    outputBase.prefix,
    'campaign-videos',
    args.companyId,
    args.campaignId,
    args.projectId,
  );
  const output = { bucket: outputBase.bucket, prefix: outputPrefix };
  const bedrock = createBedrockClient();
  const bucketOwner = getBedrockOutputBucketOwner();

  let started: { invocationArn?: string };
  try {
    started = await bedrock.send(new StartAsyncInvokeCommand({
      modelId: model,
      modelInput: {
        prompt: args.prompt.slice(0, 5000),
        aspect_ratio: args.aspectRatio,
        loop: false,
        duration: getBedrockLumaDuration(),
        resolution: getBedrockLumaResolution(),
      },
      outputDataConfig: {
        s3OutputDataConfig: {
          s3Uri: formatS3Uri(output),
          ...(bucketOwner ? { bucketOwner } : {}),
        },
      },
      clientRequestToken: args.projectId.replace(/-/g, ''),
    }));
  } catch (error) {
    if (isInvalidBedrockS3Credentials(error)) {
      throw new Error(bedrockS3OutputHelpMessage(output));
    }
    throw error;
  }

  const invocationArn = started.invocationArn;
  if (!invocationArn) throw new Error('AWS Bedrock did not return a Luma invocation ARN.');

  let status: string | undefined = 'InProgress';
  let failureMessage: string | undefined;
  for (let attempt = 0; attempt < BEDROCK_LUMA_MAX_POLL_ATTEMPTS; attempt += 1) {
    await delay(BEDROCK_LUMA_POLL_INTERVAL_MS);
    const job = await bedrock.send(new GetAsyncInvokeCommand({ invocationArn }));
    status = job.status;
    failureMessage = job.failureMessage;
    if (status === 'Completed' || status === 'Failed') {
      break;
    }
  }

  if (status === 'Failed') {
    throw new Error(failureMessage || 'AWS Bedrock Luma video generation failed.');
  }
  if (status !== 'Completed') {
    throw new Error('AWS Bedrock Luma video generation timed out. Please try again in a few minutes.');
  }

  const source = await findBedrockGeneratedMp4(output);
  const saved = await saveObject({
    key: `campaigns/${args.companyId}/${args.campaignId}/videos/${args.projectId}/bedrock-luma-${args.projectId}-current.mp4`,
    body: source.bytes,
    contentType: 'video/mp4',
    cacheControl: 'public, max-age=60, must-revalidate',
  });

  return {
    url: saved.url,
    storageKey: saved.key,
    provider: 'aws_bedrock_luma',
    model,
    jobId: invocationArn,
    sourceStorageKey: source.key,
  };
}

export async function createCampaignVideoProject(args: {
  companyId: string;
  campaignId: string;
  format: VideoFormat;
  aspectRatio: CampaignVideoAspectRatio;
  creativeNotes?: string;
  forceNew?: boolean;
}) {
  const [existingVideo] = await db.select().from(videoProjects)
    .where(and(eq(videoProjects.companyId, args.companyId), eq(videoProjects.campaignId, args.campaignId)))
    .orderBy(desc(videoProjects.createdAt))
    .limit(1);
  const shouldReuseExisting = !args.forceNew && !args.creativeNotes?.trim();
  if (shouldReuseExisting && existingVideo && existingVideo.status !== 'failed') {
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
      creativeNotes: args.creativeNotes,
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
      provider: 'aws_bedrock_luma',
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
    const rendered = await generateBedrockLumaVideo({
      companyId: args.companyId,
      campaignId: args.campaignId,
      projectId: project.id,
      prompt: creativeBrief.videoPrompt,
      aspectRatio: args.aspectRatio,
    });

    const [updated] = await db.update(videoProjects)
      .set({
        status: 'ready',
        outputUrl: rendered.url,
        script: {
          ...(project.script as Record<string, any> | null),
          videoGeneration: {
            provider: rendered.provider,
            jobId: rendered.jobId,
            model: rendered.model,
            prompt: creativeBrief.videoPrompt,
            storageKey: rendered.storageKey,
            sourceStorageKey: rendered.sourceStorageKey,
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
