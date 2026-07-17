import { generateImage } from './image-generator';
import { resolveProvider } from '../lib/config-resolver';
import {
  deleteObjectByPublicUrl,
  readObjectFromPublicUrl,
} from './object-storage';
import {
  renderBannerImage,
  type BannerLayout,
  type BannerRenderResult,
} from './imgly-banner-renderer';
import {
  applyBrandKitToBannerTheme,
  type BrandCreativeKit,
} from './brand-creative-kit';

export const CAMPAIGN_BANNER_PALETTE: Array<{
  backgroundValue: string;
  colors: {
    primary: string;
    secondary: string;
    text: string;
    ctaBg: string;
    ctaText: string;
  };
  layout: BannerLayout;
}> = [
  {
    backgroundValue: 'linear-gradient(135deg, #0f766e 0%, #14b8a6 48%, #f59e0b 100%)',
    colors: { primary: '#0f766e', secondary: '#f59e0b', text: '#ffffff', ctaBg: '#ffffff', ctaText: '#0f766e' },
    layout: 'left-text',
  },
  {
    backgroundValue: 'linear-gradient(135deg, #111827 0%, #2563eb 55%, #f97316 100%)',
    colors: { primary: '#2563eb', secondary: '#f97316', text: '#ffffff', ctaBg: '#f97316', ctaText: '#ffffff' },
    layout: 'split',
  },
  {
    backgroundValue: 'linear-gradient(135deg, #7c2d12 0%, #ea580c 45%, #facc15 100%)',
    colors: { primary: '#ea580c', secondary: '#facc15', text: '#ffffff', ctaBg: '#111827', ctaText: '#ffffff' },
    layout: 'bold-cta',
  },
];

export function sanitizeBannerSourceContext(text?: string | null): string {
  if (!text) return '';
  return String(text)
    .replace(/https?:\/\/\S+/gi, ' ')
    .replace(/["'`][^"'`]{2,80}["'`]/g, ' ')
    .replace(/\b(learn more|get started|explore now|book now|shop now|sign up|read more|discover|experience)\b/gi, ' ')
    .replace(/[#*_>\[\]{}|]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 1200);
}

export interface CampaignBannerVisualBrief {
  subject: string;
  audience: string;
  outcome: string;
  proofContext: string;
  composition: string;
  style: string;
  exclusions: string[];
}

export interface BannerQualityAssessment {
  score: number;
  relevant: boolean;
  textFree: boolean;
  technicallySound: boolean;
  issues: string[];
  retryPrompt?: string;
  reviewer?: string;
}

/**
 * Converts mixed campaign context into a compact visual brief. Keeping this
 * deterministic gives every image provider the same grounded instructions.
 */
export function buildCampaignBannerVisualBrief(args: {
  goal: string;
  audience: string;
  businessContext: string;
  reason?: string;
  offer?: string;
  angle?: string;
  visualDirection?: string;
  variantIndex?: number;
  brandKit?: BrandCreativeKit | null;
}): CampaignBannerVisualBrief {
  const source = sanitizeBannerSourceContext(args.businessContext);
  const compositions = [
    'Main subject on the right third; left 55% calm and uncluttered for editable copy.',
    'Focal subject in the right-center with depth in the scene and generous negative space on the left.',
    'Authentic close-to-medium commercial scene with movement toward the right edge and a clean left side.',
  ];

  return {
    subject: args.visualDirection
      || args.offer
      || `A concrete real-world scene showing the benefit of ${args.goal}`,
    audience: args.audience,
    outcome: args.offer || args.goal,
    proofContext: source,
    composition: compositions[(args.variantIndex ?? 0) % compositions.length]!,
    style: `Premium commercial photography with natural lighting, realistic people and materials, a ${args.angle || 'benefit-led'} mood, and this brand visual mood: ${args.brandKit?.imageMood || 'modern, clean, human-led'}.`,
    exclusions: [
      'text, letters, numbers, labels, logos, watermarks, signs, screens, posters, packaging text',
      'generic offices, abstract technology, random lifestyle stock photography',
      'deformed anatomy, malformed hands, duplicated people, floating objects, blur, visual artifacts',
      'completed ad layouts, rendered buttons, frames, badges, decorative circles, or graphic overlays',
    ],
  };
}

export function buildCampaignBannerBackgroundPrompt(args: {
  goal: string;
  audience: string;
  businessContext: string;
  reason?: string;
  offer?: string;
  angle?: string;
  visualDirection?: string;
  size: string;
  variantIndex?: number;
  brandKit?: BrandCreativeKit | null;
}): string {
  const brief = buildCampaignBannerVisualBrief(args);
  const [w = 1200, h = 628] = args.size.split('x').map(Number);
  const format = w > h ? 'wide landscape photographic background plate' : 'square photographic background plate';

  return [
    'CRITICAL OUTPUT RULE: generate a TEXT-FREE BACKGROUND IMAGE ONLY.',
    'The image must contain ZERO typography: no readable text, fake text, decorative letters, numbers, captions, logos, signs, labels, posters, screens, or watermarks.',
    '',
    `Create a realistic, high-quality ${format} for this specific campaign.`,
    'This is only the visual layer behind separate editable IMG.LY text and CTA layers.',
    '',
    `CAMPAIGN GOAL: ${args.goal}`,
    `TARGET AUDIENCE: ${args.audience}`,
    args.offer ? `OFFER OR VALUE PROPOSITION: ${args.offer}` : '',
    args.reason ? `WHY THIS CAMPAIGN EXISTS NOW: ${args.reason}` : '',
    args.angle ? `CREATIVE ANGLE: ${args.angle}` : '',
    `PRIMARY VISUAL SUBJECT: ${brief.subject}`,
    `CUSTOMER OUTCOME TO VISUALIZE: ${brief.outcome}`,
    brief.proofContext ? `BUSINESS AND CAMPAIGN FACTS FOR VISUAL SUBJECT SELECTION: ${brief.proofContext}` : '',
    args.brandKit ? [
      '',
      'BRAND VISUAL SYSTEM:',
      `- Brand name: ${args.brandKit.companyName}.`,
      `- Mood to match: ${args.brandKit.imageMood}.`,
      `- Palette influence: ${args.brandKit.colors.primary}, ${args.brandKit.colors.secondary}${args.brandKit.colors.accentColors.length ? `, ${args.brandKit.colors.accentColors.join(', ')}` : ''}.`,
      '- Use the palette only as lighting, wardrobe, environment, props, or subtle atmosphere.',
      '- Do NOT generate the logo, brand name text, badges, UI labels, CTA buttons, or any typography. These are added later as editable layers.',
    ].join('\n') : '',
    '',
    'Subject requirements:',
    `- Represent this audience authentically: ${brief.audience}.`,
    '- The people, place, product, activity, and atmosphere must directly represent the campaign facts above.',
    '- Do not fall back to generic office, abstract technology, random travel, or unrelated lifestyle imagery.',
    '- Prefer concrete visual details from the campaign context over broad industry stereotypes.',
    '',
    'Composition requirements:',
    `- ${brief.composition}`,
    `- ${brief.style}`,
    '- Do not create a completed ad layout and do not render buttons.',
    '- Professional social advertising quality, sharp, inviting, and authentic.',
    '',
    'NEGATIVE CONSTRAINTS:',
    ...brief.exclusions.map((rule) => `- Avoid ${rule}.`),
  ].filter(Boolean).join('\n');
}

export function parseBannerQualityAssessment(
  value: unknown,
  reviewer = 'gpt-4o-mini',
): BannerQualityAssessment | null {
  if (!value || typeof value !== 'object') return null;
  const input = value as Record<string, unknown>;
  const score = Math.max(0, Math.min(100, Number(input.score)));
  if (!Number.isFinite(score)) return null;

  return {
    score,
    relevant: input.relevant === true,
    textFree: input.textFree === true,
    technicallySound: input.technicallySound === true,
    issues: Array.isArray(input.issues)
      ? input.issues.map(String).filter(Boolean).slice(0, 6)
      : [],
    retryPrompt: typeof input.retryPrompt === 'string'
      ? input.retryPrompt.trim().slice(0, 800)
      : undefined,
    reviewer,
  };
}

export function bannerNeedsRetry(assessment: BannerQualityAssessment): boolean {
  return assessment.score < 72
    || !assessment.relevant
    || !assessment.textFree
    || !assessment.technicallySound;
}

/**
 * Reviews the background before IMG.LY adds editable copy. Reviewer failures
 * are non-blocking, so campaign generation remains available during outages.
 */
async function assessCampaignBannerBackground(args: {
  imageUrl: string;
  goal: string;
  audience: string;
  offer?: string;
  visualDirection?: string;
}): Promise<BannerQualityAssessment | null> {
  try {
    const provider = await resolveProvider('openai');
    if (!provider.apiKey) return null;
    const image = await readObjectFromPublicUrl(args.imageUrl);
    if (!image) return null;

    const OpenAI = (await import('openai')).default;
    const client = new OpenAI({
      apiKey: provider.apiKey,
      baseURL: provider.baseUrl,
    });
    const reviewer = process.env.OPENAI_IMAGE_REVIEW_MODEL || 'gpt-4o-mini';
    const response = await client.chat.completions.create({
      model: reviewer,
      max_tokens: 450,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: 'You are a strict advertising image art director. Review only the background image, not banner copy. Return JSON only.',
        },
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: [
                `Campaign goal: ${args.goal}`,
                `Audience: ${args.audience}`,
                args.offer ? `Offer: ${args.offer}` : '',
                args.visualDirection ? `Expected scene: ${args.visualDirection}` : '',
                '',
                'Score this candidate from 0-100. It must:',
                '1. Clearly match the campaign, audience, offer, and expected scene.',
                '2. Contain no text, fake letters, numbers, logos, signs, labels, watermarks, buttons, or ad-layout graphics.',
                '3. Have realistic anatomy, objects, lighting, and no obvious generation artifacts.',
                '4. Preserve calm negative space on the left for editable banner copy.',
                '',
                'Return: {"score":0,"relevant":true,"textFree":true,"technicallySound":true,"issues":[],"retryPrompt":"concise concrete correction for the image generator"}',
              ].filter(Boolean).join('\n'),
            },
            {
              type: 'image_url',
              image_url: {
                url: `data:image/png;base64,${image.toString('base64')}`,
                detail: 'low',
              },
            },
          ],
        },
      ] as any,
    });

    const raw = response.choices[0]?.message?.content;
    return raw ? parseBannerQualityAssessment(JSON.parse(raw), reviewer) : null;
  } catch (error) {
    console.warn('[campaign-banner] quality review skipped:', (error as Error).message);
    return null;
  }
}

export interface ContextualBannerRenderInput {
  companyId: string;
  bannerId: string;
  size: string;
  goal: string;
  audience: string;
  businessContext: string;
  reason?: string;
  offer?: string;
  angle?: string;
  visualDirection?: string;
  headline: string;
  subheadline?: string;
  cta: string;
  variantIndex: number;
  brandKit?: BrandCreativeKit | null;
}

export interface ContextualBannerRenderResult {
  backgroundPrompt: string;
  backgroundImageUrl?: string;
  backgroundImageProvider?: string;
  backgroundImageModel?: string;
  backgroundQuality?: BannerQualityAssessment;
  generationAttempts: number;
  rendered: BannerRenderResult;
  theme: typeof CAMPAIGN_BANNER_PALETTE[number];
}

export async function renderContextualCampaignBanner(
  input: ContextualBannerRenderInput,
): Promise<ContextualBannerRenderResult> {
  const baseTheme = CAMPAIGN_BANNER_PALETTE[
    input.variantIndex % CAMPAIGN_BANNER_PALETTE.length
  ]!;
  const theme = applyBrandKitToBannerTheme(baseTheme, input.brandKit, input.variantIndex);
  const backgroundPrompt = buildCampaignBannerBackgroundPrompt(input);
  const [width = 1200, height = 628] = input.size.split('x').map(Number);

  let backgroundImage: Awaited<ReturnType<typeof generateImage>> | null = null;
  let backgroundQuality: BannerQualityAssessment | null = null;
  let generationAttempts = 0;
  try {
    backgroundImage = await generateImage({
      prompt: backgroundPrompt,
      width,
      height,
      providerKey: 'dalle',
      model: 'gpt-image-2',
      allowFallback: false,
    });
    generationAttempts = 1;
    backgroundQuality = await assessCampaignBannerBackground({
      imageUrl: backgroundImage.url,
      goal: input.goal,
      audience: input.audience,
      offer: input.offer,
      visualDirection: input.visualDirection,
    });

    if (backgroundQuality && bannerNeedsRetry(backgroundQuality)) {
      const correctedPrompt = [
        backgroundPrompt,
        '',
        'QUALITY REVIEW CORRECTIONS FOR THIS RETRY:',
        backgroundQuality.retryPrompt
          || backgroundQuality.issues.join('; ')
          || 'Improve campaign relevance, anatomy, and remove every text-like artifact.',
        'Create a visibly different, corrected scene while preserving the required composition.',
      ].join('\n');
      const retryImage = await generateImage({
        prompt: correctedPrompt,
        width,
        height,
        providerKey: 'dalle',
        model: 'gpt-image-2',
        allowFallback: false,
      });
      generationAttempts = 2;
      const retryQuality = await assessCampaignBannerBackground({
        imageUrl: retryImage.url,
        goal: input.goal,
        audience: input.audience,
        offer: input.offer,
        visualDirection: input.visualDirection,
      });

      if (!retryQuality || retryQuality.score >= backgroundQuality.score) {
        await deleteObjectByPublicUrl(backgroundImage.url).catch(() => {});
        backgroundImage = retryImage;
        backgroundQuality = retryQuality ?? backgroundQuality;
      } else {
        await deleteObjectByPublicUrl(retryImage.url).catch(() => {});
      }
    }
  } catch (error) {
    console.warn('[campaign-banner] contextual background generation failed:', (error as Error).message);
  }

  const rendered = await renderBannerImage({
    backgroundImageUrl: backgroundImage?.url,
    bannerId: input.bannerId,
    companyId: input.companyId,
    size: input.size,
    keyword: input.goal,
    headline: input.headline,
    subheadline: input.subheadline,
    cta: input.cta,
    layout: theme.layout,
    colors: theme.colors,
    visualDirection: input.visualDirection,
    brandKit: input.brandKit,
  });

  return {
    backgroundPrompt,
    backgroundImageUrl: backgroundImage?.url,
    backgroundImageProvider: backgroundImage?.providerKey,
    backgroundImageModel: backgroundImage?.model,
    backgroundQuality: backgroundQuality ?? undefined,
    generationAttempts,
    rendered,
    theme,
  };
}
