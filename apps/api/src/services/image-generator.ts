/**
 * Image Generator — Unified interface for AI image generation
 *
 * Config via .env:
 *   IMAGE_PROVIDER=dalle|banana    (default: dalle)
 *   BANANA_API_KEY=xxx             (for production)
 *   BANANA_MODEL_KEY=xxx           (Banana model endpoint)
 *
 * Dev: DALL-E 3 (uses existing OPENAI_API_KEY)
 * Production: Banana.dev (higher quality, custom models)
 */

export interface ImageGenerationRequest {
  prompt: string;
  width: number;
  height: number;
  style?: 'natural' | 'vivid';
}

export interface ImageGenerationResult {
  url: string;
  provider: string;
  revisedPrompt?: string;
}

function getProvider(): string {
  return process.env.IMAGE_PROVIDER || 'dalle';
}

/**
 * Generate image — provider-agnostic
 */
export async function generateImage(request: ImageGenerationRequest): Promise<ImageGenerationResult> {
  const provider = getProvider();

  if (provider === 'banana') {
    return generateWithBanana(request);
  }

  return generateWithDalle(request);
}

/**
 * DALL-E 3 via OpenAI API (dev)
 */
async function generateWithDalle(request: ImageGenerationRequest): Promise<ImageGenerationResult> {
  const OpenAI = (await import('openai')).default;
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  // DALL-E 3 supports specific sizes
  const size = mapToDalleSize(request.width, request.height);

  const response = await openai.images.generate({
    model: 'dall-e-3',
    prompt: request.prompt,
    n: 1,
    size,
    style: request.style || 'vivid',
    quality: 'standard',
  });

  return {
    url: response.data[0].url || '',
    provider: 'dalle',
    revisedPrompt: response.data[0].revised_prompt,
  };
}

/**
 * Banana.dev (production — higher quality, custom models)
 */
async function generateWithBanana(request: ImageGenerationRequest): Promise<ImageGenerationResult> {
  const apiKey = process.env.BANANA_API_KEY;
  const modelKey = process.env.BANANA_MODEL_KEY;

  if (!apiKey || !modelKey) {
    console.warn('[ImageGen] Banana not configured, falling back to DALL-E');
    return generateWithDalle(request);
  }

  try {
    const response = await fetch('https://api.banana.dev/start/v4/', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        apiKey,
        modelKey,
        modelInputs: {
          prompt: request.prompt,
          negative_prompt: 'text, words, letters, numbers, watermark, logo, low quality, blurry, deformed, realistic photo, faces, hands, people, complex scene, busy background, cluttered, neon colors, oversaturated, stock photo, clip art, cartoon, childish, ugly, artifacts, noise',
          width: request.width,
          height: request.height,
          num_inference_steps: 30,
          guidance_scale: 7.5,
        },
      }),
      signal: AbortSignal.timeout(60000),
    });

    if (!response.ok) {
      throw new Error(`Banana API error: ${response.status}`);
    }

    const data = await response.json();

    // Banana returns base64 image — need to save and return URL
    if (data.modelOutputs?.[0]?.image_base64) {
      const imageUrl = await saveBase64Image(data.modelOutputs[0].image_base64, request.width, request.height);
      return { url: imageUrl, provider: 'banana' };
    }

    // Some Banana models return URL directly
    if (data.modelOutputs?.[0]?.image) {
      return { url: data.modelOutputs[0].image, provider: 'banana' };
    }

    throw new Error('No image in Banana response');
  } catch (err) {
    console.warn('[ImageGen] Banana failed, falling back to DALL-E:', err);
    return generateWithDalle(request);
  }
}

/**
 * Map arbitrary dimensions to DALL-E supported sizes
 */
function mapToDalleSize(w: number, h: number): '1024x1024' | '1024x1792' | '1792x1024' {
  const ratio = w / h;
  if (ratio > 1.3) return '1792x1024'; // landscape (1200x628, etc)
  if (ratio < 0.77) return '1024x1792'; // portrait
  return '1024x1024'; // square (1080x1080, etc)
}

/**
 * Save base64 image to local storage, return file path
 */
async function saveBase64Image(base64: string, w: number, h: number): Promise<string> {
  const fs = await import('fs');
  const path = await import('path');

  const dir = path.join(process.cwd(), '..', '..', 'deploy', 'images');
  fs.mkdirSync(dir, { recursive: true });

  const filename = `banner-${w}x${h}-${Date.now()}.png`;
  const filePath = path.join(dir, filename);

  const buffer = Buffer.from(base64, 'base64');
  fs.writeFileSync(filePath, buffer);

  return `/images/${filename}`;
}

/**
 * Build a prompt for banner background image generation
 *
 * Design philosophy: Banner backgrounds must be SIMPLE and CLEAN.
 * Text overlay is handled separately by the frontend canvas renderer.
 * The image's job is to set the mood — NOT to be the star of the show.
 *
 * Works with: DALL-E 3 (dev), Banana.dev (production)
 */
export function buildBannerImagePrompt(
  businessContext: string,
  style: string,
  strategyTag: string,
  size: string
): string {
  // Extract key business details for targeted imagery
  const contextSnippet = businessContext.substring(0, 200).replace(/\n/g, ' ');

  const styleGuide: Record<string, string> = {
    startup: 'soft gradient background transitioning between 2 complementary colors, subtle geometric shapes at low opacity, modern and clean, minimal detail',
    minimal: 'solid light color background with a single subtle accent element, lots of white space, clean and professional, almost flat design',
    bold: 'rich solid color background with a single bold accent shape, high contrast but simple composition, strong visual impact with minimal elements',
    corporate: 'professional blue-toned gradient, subtle abstract shapes, clean corporate aesthetic, trustworthy and calm',
    dark: 'dark gradient background from near-black to dark gray, single subtle neon accent glow, sleek and modern, minimal',
  };

  const strategyGuide: Record<string, string> = {
    value: 'warm, positive atmosphere — soft golden or green tones suggesting growth and success, abstract and symbolic',
    urgency: 'energetic warm tones — orange to red gradient, subtle diagonal lines suggesting motion, simple and bold',
    'social-proof': 'trustworthy cool tones — blue to teal gradient, subtle connected dots or circles suggesting community, clean',
  };

  // Parse dimensions for aspect ratio guidance
  const [w, h] = size.split('x').map(Number);
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
