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

import { deflateSync } from 'node:zlib';
import { resolveImageProvider, resolveProvider } from '../lib/config-resolver';
import { saveObject } from './object-storage';

export const DEFAULT_OPENAI_IMAGE_MODEL = 'gpt-image-2';

export interface ImageGenerationRequest {
  prompt: string;
  width: number;
  height: number;
  style?: 'natural' | 'vivid';
  /** Which image provider row key to use (e.g. "banana-pro"). */
  providerKey?: string;
  /** Internal model override for workflows that require a specific capability. */
  model?: string;
  /** If false, throw instead of producing the generic local fallback image. */
  allowFallback?: boolean;
}

export interface ImageGenerationResult {
  url: string;
  provider: string;
  providerKey: string;
  model?: string;
  creditCost: number;
  revisedPrompt?: string;
}

export async function generateImage(
  request: ImageGenerationRequest,
): Promise<ImageGenerationResult> {
  const providerKey = request.providerKey || (await pickDefaultProviderKey());
  if (providerKey === 'fallback') {
    if (request.allowFallback === false) {
      throw new Error('No configured image provider is ready for semantic image generation');
    }
    return generateFallbackImage(request);
  }

  const provider = await getImageProviderOrEnvDefault(providerKey);
  if (!provider || !provider.enabled || !provider.hasCredentials) {
    if (request.allowFallback === false) {
      throw new Error(`Image provider "${providerKey}" is not configured or not ready`);
    }
    console.warn(`[ImageGen] Provider "${providerKey}" is not ready; using local fallback image`);
    return generateFallbackImage(request);
  }

  try {
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
  } catch (error) {
    if (request.allowFallback === false) {
      throw error;
    }
    console.warn(`[ImageGen] Provider "${providerKey}" failed; using local fallback image:`, (error as Error).message);
    return generateFallbackImage(request);
  }
}

function buildTextFreeImagePrompt(prompt: string): string {
  return [
    prompt,
    '',
    'NON-NEGOTIABLE IMAGE RULES:',
    '- Generate a visual-only image with absolutely zero text.',
    '- Do not include readable text, fake text, typography, letters, numbers, captions, titles, slogans, CTA buttons, UI text, labels, signs, posters, book/menu covers, logos, brand marks, or watermarks.',
    '- Avoid surfaces that commonly contain text, including billboards, street signs, shop signs, labels, screens, documents, tickets, brochures, packages, jerseys, license plates, and maps.',
    '- This image may be used as an editable banner background, so all copy will be added later in separate text layers.',
  ].join('\n');
}

async function pickDefaultProviderKey(): Promise<string> {
  // Prefer cheapest enabled provider. Falls back to dalle for dev.
  const candidates = ['gemini-imagen', 'dalle', 'banana', 'banana-pro'];
  for (const key of candidates) {
    const p = await resolveImageProvider(key);
    if (p && p.enabled && p.hasCredentials) return key;
  }
  const openai = await resolveProvider('openai');
  if (openai.apiKey) return 'dalle';
  const gemini = await resolveProvider('gemini');
  if (gemini.apiKey) return 'gemini-imagen';
  return 'fallback';
}

async function getImageProviderOrEnvDefault(
  providerKey: string,
): Promise<Awaited<ReturnType<typeof resolveImageProvider>>> {
  const provider = await resolveImageProvider(providerKey);
  if (provider) return provider;

  if (providerKey === 'dalle') {
    const openai = await resolveProvider('openai');
    if (!openai.apiKey) return null;
    return {
      key: 'dalle',
      label: 'OpenAI Image (env fallback)',
      description: 'OpenAI image generation using OPENAI_API_KEY',
      tier: 'balanced',
      creditCost: 10,
      enabled: true,
      hasCredentials: true,
      apiKey: openai.apiKey,
      value: { model: DEFAULT_OPENAI_IMAGE_MODEL, quality: 'medium' },
    };
  }

  if (providerKey === 'gemini-imagen') {
    const gemini = await resolveProvider('gemini');
    if (!gemini.apiKey) return null;
    return {
      key: 'gemini-imagen',
      label: 'Gemini Imagen (env fallback)',
      description: 'Gemini image generation using GEMINI_API_KEY',
      tier: 'balanced',
      creditCost: 10,
      enabled: true,
      hasCredentials: true,
      apiKey: gemini.apiKey,
      value: { model: 'imagen-3.0-generate-001' },
    };
  }

  return null;
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
  const configuredModel = request.model
    || (cfg.value.model as string)
    || DEFAULT_OPENAI_IMAGE_MODEL;
  const model = normalizeOpenAIImageModel(configuredModel);
  const payload: Record<string, unknown> = {
    model,
    prompt: buildTextFreeImagePrompt(request.prompt),
    n: 1,
    size: mapToOpenAIImageSize(request.width, request.height, model),
    quality: mapToOpenAIImageQuality(cfg.value.quality, model),
  };

  const response = await openai.images.generate(payload as any);

  const firstImage = response.data?.[0];
  const base64Image = firstImage?.b64_json;
  const storageTag = model.replace(/[^a-z0-9]+/gi, '-').toLowerCase();
  let url = '';
  if (base64Image) {
    url = await saveBase64Image(base64Image, request.width, request.height, storageTag);
  } else if (firstImage?.url) {
    const imageResponse = await fetch(firstImage.url, { signal: AbortSignal.timeout(60000) });
    if (!imageResponse.ok) throw new Error(`Could not download OpenAI image (${imageResponse.status})`);
    url = await saveImageBuffer(
      Buffer.from(await imageResponse.arrayBuffer()),
      request.width,
      request.height,
      storageTag,
    );
  }
  if (!url) throw new Error('OpenAI image response did not include an image.');

  return {
    url,
    provider: 'dalle',
    providerKey: 'dalle',
    model,
    creditCost: cfg.creditCost,
    revisedPrompt: firstImage?.revised_prompt,
  };
}

function normalizeOpenAIImageModel(model: string): string {
  const normalized = model.trim();
  if (
    !normalized
    || normalized.toLowerCase() === 'dall-e-3'
    || normalized.toLowerCase() === 'gpt-image-1'
  ) {
    return DEFAULT_OPENAI_IMAGE_MODEL;
  }
  return normalized;
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
      instances: [{ prompt: buildTextFreeImagePrompt(request.prompt) }],
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
    model,
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
        prompt: buildTextFreeImagePrompt(request.prompt),
        negative_prompt:
          'text, words, letters, numbers, typography, caption, headline, title, slogan, watermark, logo, brand mark, signage, street sign, billboard, poster, label, menu, book cover, UI screen, readable text, low quality, blurry, deformed, faces close-up, hands close-up, complex scene, busy background, cluttered, neon colors, oversaturated, clip art, cartoon, childish, ugly, artifacts, noise',
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
      model: modelKey,
      creditCost: cfg.creditCost,
    };
  }

  if (data.modelOutputs?.[0]?.image) {
    return {
      url: data.modelOutputs[0].image,
      provider: opts.pro ? 'banana-pro' : 'banana',
      providerKey: opts.pro ? 'banana-pro' : 'banana',
      model: modelKey,
      creditCost: cfg.creditCost,
    };
  }

  throw new Error('No image in Banana response');
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export function mapToOpenAIImageSize(
  w: number,
  h: number,
  model: string,
): string {
  const ratio = w / h;
  if (model.toLowerCase() === 'gpt-image-2') {
    return mapToGptImage2Size(w, h);
  }
  if (/^gpt-image-/i.test(model)) {
    if (ratio > 1.3) return '1536x1024';
    if (ratio < 0.77) return '1024x1536';
    return '1024x1024';
  }
  if (ratio > 1.3) return '1792x1024';
  if (ratio < 0.77) return '1024x1792';
  return '1024x1024';
}

/**
 * GPT Image 2 accepts custom dimensions. Matching the requested aspect ratio
 * avoids cropping away the subject or the negative space reserved for copy.
 */
function mapToGptImage2Size(width: number, height: number): string {
  const roundTo16 = (value: number) => Math.max(256, Math.min(3840, Math.round(value / 16) * 16));
  let w = roundTo16(width);
  let h = roundTo16(height);

  // GPT Image 2 requires at least 655,360 pixels. Scale small requests up
  // proportionally while keeping both dimensions on the required 16px grid.
  const minimumPixels = 655_360;
  if (w * h < minimumPixels) {
    const scale = Math.sqrt(minimumPixels / (w * h));
    w = roundTo16(w * scale);
    h = roundTo16(h * scale);
  }

  return `${w}x${h}`;
}

function mapToOpenAIImageQuality(
  quality: unknown,
  model: string,
): 'standard' | 'hd' | 'low' | 'medium' | 'high' | 'auto' {
  const raw = typeof quality === 'string' ? quality.toLowerCase() : '';
  if (/^gpt-image-/i.test(model)) {
    if (raw === 'hd' || raw === 'high') return 'high';
    if (raw === 'standard' || raw === 'medium') return 'medium';
    if (raw === 'low') return 'low';
    return 'auto';
  }
  if (raw === 'hd') return 'hd';
  return 'standard';
}

async function saveBase64Image(
  base64: string,
  w: number,
  h: number,
  tag = 'banner',
): Promise<string> {
  const filename = `${tag}-${w}x${h}-${Date.now()}.png`;
  const buffer = Buffer.from(base64, 'base64');
  const saved = await saveObject({
    key: `images/${filename}`,
    body: buffer,
    contentType: 'image/png',
  });
  return saved.url;
}

async function generateFallbackImage(request: ImageGenerationRequest): Promise<ImageGenerationResult> {
  const buffer = createAbstractPng(request.width, request.height, request.prompt);
  const url = await saveImageBuffer(buffer, request.width, request.height, 'fallback');
  return {
    url,
    provider: 'local-fallback',
    providerKey: 'fallback',
    creditCost: 0,
  };
}

async function saveImageBuffer(
  buffer: Buffer,
  w: number,
  h: number,
  tag = 'image',
): Promise<string> {
  const filename = `${tag}-${w}x${h}-${Date.now()}.png`;
  const saved = await saveObject({
    key: `images/${filename}`,
    body: buffer,
    contentType: 'image/png',
  });
  return saved.url;
}

function createAbstractPng(width: number, height: number, seedText: string): Buffer {
  const safeWidth = Math.max(64, Math.min(width, 2048));
  const safeHeight = Math.max(64, Math.min(height, 2048));
  const seed = hashString(seedText);
  const a = colorFromSeed(seed);
  const b = colorFromSeed(seed >>> 8);
  const accent = colorFromSeed(seed >>> 16);
  const raw = Buffer.alloc((safeWidth * 4 + 1) * safeHeight);

  const cx1 = safeWidth * (0.25 + ((seed & 15) / 60));
  const cy1 = safeHeight * 0.35;
  const cx2 = safeWidth * 0.78;
  const cy2 = safeHeight * (0.62 + (((seed >>> 4) & 15) / 80));

  for (let y = 0; y < safeHeight; y++) {
    const row = y * (safeWidth * 4 + 1);
    raw[row] = 0;
    for (let x = 0; x < safeWidth; x++) {
      const t = (x / Math.max(1, safeWidth - 1)) * 0.72 + (y / Math.max(1, safeHeight - 1)) * 0.28;
      let r = lerp(a[0], b[0], t);
      let g = lerp(a[1], b[1], t);
      let bl = lerp(a[2], b[2], t);

      const d1 = distanceNorm(x, y, cx1, cy1, safeWidth, safeHeight);
      const d2 = distanceNorm(x, y, cx2, cy2, safeWidth, safeHeight);
      const glow1 = Math.max(0, 1 - d1 * 2.2);
      const glow2 = Math.max(0, 1 - d2 * 2.8);
      const diagonal = ((x + y + (seed % 97)) % 180) < 4 ? 0.08 : 0;
      const mix = Math.min(0.55, glow1 * 0.34 + glow2 * 0.28 + diagonal);

      r = lerp(r, accent[0], mix);
      g = lerp(g, accent[1], mix);
      bl = lerp(bl, accent[2], mix);

      const idx = row + 1 + x * 4;
      raw[idx] = clampByte(r);
      raw[idx + 1] = clampByte(g);
      raw[idx + 2] = clampByte(bl);
      raw[idx + 3] = 255;
    }
  }

  const compressed = deflateSync(raw, { level: 9 });
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk('IHDR', createIhdr(safeWidth, safeHeight)),
    pngChunk('IDAT', compressed),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

function createIhdr(width: number, height: number): Buffer {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  return ihdr;
}

function pngChunk(type: string, data: Buffer): Buffer {
  const typeBuffer = Buffer.from(type, 'ascii');
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), 0);
  return Buffer.concat([length, typeBuffer, data, crc]);
}

function crc32(buffer: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let i = 0; i < 8; i++) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function hashString(value: string): number {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function colorFromSeed(seed: number): [number, number, number] {
  return [
    56 + (seed & 95),
    72 + ((seed >>> 8) & 95),
    96 + ((seed >>> 16) & 95),
  ];
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * Math.max(0, Math.min(1, t));
}

function distanceNorm(x: number, y: number, cx: number, cy: number, w: number, h: number): number {
  const dx = (x - cx) / w;
  const dy = (y - cy) / h;
  return Math.sqrt(dx * dx + dy * dy);
}

function clampByte(value: number): number {
  return Math.max(0, Math.min(255, Math.round(value)));
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

  return `Create a SIMPLE, CLEAN TEXT-FREE background layer for a banner design.
This is only the background visual layer. It is NOT the final ad, NOT a poster, NOT a flyer, NOT a thumbnail, and must not contain any typography.

CONTEXT: ${contextSnippet}

VISUAL STYLE: ${styleGuide[style] || styleGuide.startup}
MOOD: ${strategyGuide[strategyTag] || strategyGuide.value}
SIZE: ${size}

COMPOSITION:
${compositionGuide}

CRITICAL RULES (MUST FOLLOW):
1. ABSOLUTELY NO text, words, letters, numbers, fake text, typography, captions, title, CTA, logo, brand mark, signage, labels, posters, UI screens, or watermarks in the image
2. SIMPLICITY IS KEY — maximum 2-3 visual elements total
3. Use soft gradients and abstract shapes ONLY — no realistic photos, no complex scenes
4. 70% of the image must be clean, uncluttered space suitable for white text overlay
5. NO busy patterns, NO detailed illustrations, NO photorealistic elements
6. Think "premium app background" or "modern slide deck background" — not "stock photo"
7. Colors should be muted/professional — avoid neon, oversaturated, or clashing colors
8. NO faces, NO hands, NO objects that look AI-generated or uncanny
9. Professional quality suitable for Facebook/Instagram/Google ads
10. Do not compose a finished ad layout; leave all copy for separate editable overlay layers
11. The image should look INTENTIONALLY MINIMAL — like it was designed by a professional graphic designer, not generated by AI`;
}
