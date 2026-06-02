/**
 * Image Generator — unified interface, DB-configured.
 *
 * Every image provider (DALL-E, Gemini Imagen, Banana, Banana Pro) is a
 * row in the `system_configs` table under category='image'. Admins
 * enable, configure API keys, models, and credit cost via the admin UI
 * (no .env, no restart).
 *
 * End users pick a quality tier (Standard / Pro / Ultra) when generating
 * a banner. The tier maps to one of the enabled image providers and the
 * credit cost admins have configured.
 */

import { resolveImageProvider, resolveProvider } from '../lib/config-resolver';

export interface ImageGenerationRequest {
  prompt: string;
  width: number;
  height: number;
  style?: 'natural' | 'vivid';
  /** Which image provider row key to use (e.g. "banana-pro"). */
  providerKey?: string;
}

export interface ImageGenerationResult {
  url: string;
  provider: string;
  providerKey: string;
  creditCost: number;
  revisedPrompt?: string;
}

export async function generateImage(
  request: ImageGenerationRequest,
): Promise<ImageGenerationResult> {
  const providerKey = request.providerKey || (await pickDefaultProviderKey());
  const provider = await resolveImageProvider(providerKey);
  if (!provider) {
    throw new Error(`Image provider "${providerKey}" is not configured or not enabled`);
  }

  switch (providerKey) {
    case 'dalle':
      return generateWithDalle(request, provider);
    case 'gemini-imagen':
      return generateWithGemini(request, provider);
    case 'banana':
      return generateWithBanana(request, provider, { pro: false });
    case 'banana-pro':
      return generateWithBanana(request, provider, { pro: true });
    default:
      throw new Error(`Unknown image provider: ${providerKey}`);
  }
}

async function pickDefaultProviderKey(): Promise<string> {
  // Prefer cheapest enabled provider. Falls back to dalle for dev.
  const candidates = ['gemini-imagen', 'dalle', 'banana', 'banana-pro'];
  for (const key of candidates) {
    const p = await resolveImageProvider(key);
    if (p && p.enabled && p.hasCredentials) return key;
  }
  return 'dalle';
}

// ---------------------------------------------------------------------------
// Providers
// ---------------------------------------------------------------------------

async function generateWithDalle(
  request: ImageGenerationRequest,
  cfg: Awaited<ReturnType<typeof resolveImageProvider>>,
): Promise<ImageGenerationResult> {
  if (!cfg) throw new Error('DALL-E config missing');
  // DALL-E reuses the openai provider API key
  const openaiProvider = await resolveProvider('openai');
  const apiKey = openaiProvider.apiKey;
  if (!apiKey) {
    throw new Error('OpenAI API key not configured — set it in Admin → LLM Configuration');
  }

  const OpenAI = (await import('openai')).default;
  const openai = new OpenAI({ apiKey });
  const size = mapToDalleSize(request.width, request.height);

  const response = await openai.images.generate({
    model: (cfg.value.model as string) || 'dall-e-3',
    prompt: request.prompt,
    n: 1,
    size,
    style: request.style || (cfg.value.style as 'vivid' | 'natural') || 'vivid',
    quality: (cfg.value.quality as 'standard' | 'hd') || 'standard',
  });

  const firstImage = response.data?.[0];
  return {
    url: firstImage?.url || '',
    provider: 'dalle',
    providerKey: 'dalle',
    creditCost: cfg.creditCost,
    revisedPrompt: firstImage?.revised_prompt,
  };
}

async function generateWithGemini(
  request: ImageGenerationRequest,
  cfg: Awaited<ReturnType<typeof resolveImageProvider>>,
): Promise<ImageGenerationResult> {
  if (!cfg) throw new Error('Gemini Imagen config missing');
  const geminiProvider = await resolveProvider('gemini');
  const apiKey = geminiProvider.apiKey;
  if (!apiKey) {
    throw new Error('Gemini API key not configured — set it in Admin → LLM Configuration');
  }

  const model = (cfg.value.model as string) || 'imagen-3.0-generate-001';
  const baseUrl = geminiProvider.baseUrl || 'https://generativelanguage.googleapis.com/v1beta';
  const url = `${baseUrl}/models/${model}:predict?key=${encodeURIComponent(apiKey)}`;

  const aspectRatio =
    request.width > request.height * 1.3
      ? '16:9'
      : request.height > request.width * 1.3
        ? '9:16'
        : '1:1';

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      instances: [{ prompt: request.prompt }],
      parameters: { sampleCount: 1, aspectRatio },
    }),
    signal: AbortSignal.timeout(60000),
  });
  if (!response.ok) {
    throw new Error(`Gemini Imagen HTTP ${response.status}`);
  }
  const data: any = await response.json();
  const b64 = data?.predictions?.[0]?.bytesBase64Encoded;
  if (!b64) throw new Error('Gemini Imagen returned no image');
  const imageUrl = await saveBase64Image(b64, request.width, request.height, 'gemini');
  return {
    url: imageUrl,
    provider: 'gemini-imagen',
    providerKey: 'gemini-imagen',
    creditCost: cfg.creditCost,
  };
}

async function generateWithBanana(
  request: ImageGenerationRequest,
  cfg: Awaited<ReturnType<typeof resolveImageProvider>>,
  opts: { pro: boolean },
): Promise<ImageGenerationResult> {
  if (!cfg) throw new Error('Banana config missing');
  const apiKey = cfg.apiKey;
  const modelKey = cfg.value.modelKey as string | undefined;
  if (!apiKey || !modelKey) {
    throw new Error(
      `${opts.pro ? 'Banana Pro' : 'Banana'} is not fully configured — set API key and model key in Admin → LLM Configuration`,
    );
  }
  const endpoint = (cfg.value.endpoint as string) || 'https://api.banana.dev/start/v4/';
  const inferenceSteps = opts.pro
    ? (cfg.value.inferenceSteps as number) || 50
    : (cfg.value.inferenceSteps as number) || 30;
  const guidanceScale = opts.pro
    ? (cfg.value.guidanceScale as number) || 8.5
    : (cfg.value.guidanceScale as number) || 7.5;

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      apiKey,
      modelKey,
      modelInputs: {
        prompt: request.prompt,
        negative_prompt:
          'text, words, letters, numbers, watermark, logo, low quality, blurry, deformed, realistic photo, faces, hands, people, complex scene, busy background, cluttered, neon colors, oversaturated, stock photo, clip art, cartoon, childish, ugly, artifacts, noise',
        width: request.width,
        height: request.height,
        num_inference_steps: inferenceSteps,
        guidance_scale: guidanceScale,
      },
    }),
    signal: AbortSignal.timeout(120000),
  });

  if (!response.ok) {
    throw new Error(`Banana API error: ${response.status}`);
  }

  const data = await response.json();

  if (data.modelOutputs?.[0]?.image_base64) {
    const imageUrl = await saveBase64Image(
      data.modelOutputs[0].image_base64,
      request.width,
      request.height,
      opts.pro ? 'bananapro' : 'banana',
    );
    return {
      url: imageUrl,
      provider: opts.pro ? 'banana-pro' : 'banana',
      providerKey: opts.pro ? 'banana-pro' : 'banana',
      creditCost: cfg.creditCost,
    };
  }

  if (data.modelOutputs?.[0]?.image) {
    return {
      url: data.modelOutputs[0].image,
      provider: opts.pro ? 'banana-pro' : 'banana',
      providerKey: opts.pro ? 'banana-pro' : 'banana',
      creditCost: cfg.creditCost,
    };
  }

  throw new Error('No image in Banana response');
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mapToDalleSize(w: number, h: number): '1024x1024' | '1024x1792' | '1792x1024' {
  const ratio = w / h;
  if (ratio > 1.3) return '1792x1024';
  if (ratio < 0.77) return '1024x1792';
  return '1024x1024';
}

async function saveBase64Image(
  base64: string,
  w: number,
  h: number,
  tag = 'banner',
): Promise<string> {
  const fs = await import('fs');
  const path = await import('path');

  const dir = path.join(process.cwd(), '..', '..', 'deploy', 'images');
  fs.mkdirSync(dir, { recursive: true });

  const filename = `${tag}-${w}x${h}-${Date.now()}.png`;
  const filePath = path.join(dir, filename);

  const buffer = Buffer.from(base64, 'base64');
  fs.writeFileSync(filePath, buffer);

  return `/images/${filename}`;
}

/**
 * Build a prompt for banner background image generation.
 *
 * Design philosophy: Banner backgrounds must be SIMPLE and CLEAN.
 * Text overlay is handled separately by the frontend canvas renderer.
 * The image's job is to set the mood — NOT to be the star of the show.
 */
export function buildBannerImagePrompt(
  businessContext: string,
  style: string,
  strategyTag: string,
  size: string,
): string {
  const contextSnippet = businessContext.substring(0, 200).replace(/\n/g, ' ');

  const styleGuide: Record<string, string> = {
    startup:
      'soft gradient background transitioning between 2 complementary colors, subtle geometric shapes at low opacity, modern and clean, minimal detail',
    minimal:
      'solid light color background with a single subtle accent element, lots of white space, clean and professional, almost flat design',
    bold: 'rich solid color background with a single bold accent shape, high contrast but simple composition, strong visual impact with minimal elements',
    corporate:
      'professional blue-toned gradient, subtle abstract shapes, clean corporate aesthetic, trustworthy and calm',
    dark: 'dark gradient background from near-black to dark gray, single subtle neon accent glow, sleek and modern, minimal',
  };

  const strategyGuide: Record<string, string> = {
    value:
      'warm, positive atmosphere — soft golden or green tones suggesting growth and success, abstract and symbolic',
    urgency:
      'energetic warm tones — orange to red gradient, subtle diagonal lines suggesting motion, simple and bold',
    'social-proof':
      'trustworthy cool tones — blue to teal gradient, subtle connected dots or circles suggesting community, clean',
  };

  const [w = 1200, h = 628] = size.split('x').map(Number);
  const isLandscape = w > h;
  const compositionGuide = isLandscape
    ? 'Landscape format — keep the LEFT 60% very clean and simple for text overlay. Any visual elements should be subtle and positioned in the RIGHT 30%.'
    : 'Square format — keep the CENTER and TOP 60% very clean for text overlay. Any visual elements should be subtle and positioned in the BOTTOM or edges.';

  return `Create a SIMPLE, CLEAN advertising banner background image.

CONTEXT: ${contextSnippet}

VISUAL STYLE: ${styleGuide[style] || styleGuide.startup}
MOOD: ${strategyGuide[strategyTag] || strategyGuide.value}
SIZE: ${size}

COMPOSITION:
${compositionGuide}

CRITICAL RULES (MUST FOLLOW):
1. ABSOLUTELY NO text, words, letters, numbers, logos, or watermarks in the image
2. SIMPLICITY IS KEY — maximum 2-3 visual elements total
3. Use soft gradients and abstract shapes ONLY — no realistic photos, no complex scenes
4. 70% of the image must be clean, uncluttered space suitable for white text overlay
5. NO busy patterns, NO detailed illustrations, NO photorealistic elements
6. Think "premium app background" or "modern slide deck background" — not "stock photo"
7. Colors should be muted/professional — avoid neon, oversaturated, or clashing colors
8. NO faces, NO hands, NO objects that look AI-generated or uncanny
9. Professional quality suitable for Facebook/Instagram/Google ads
10. The image should look INTENTIONALLY MINIMAL — like it was designed by a professional graphic designer, not generated by AI`;
}
