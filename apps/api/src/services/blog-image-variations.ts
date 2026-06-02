/**
 * Block 8 — Blog image variations.
 *
 * Per blog post we render:
 *   - 1 hero image (16:9 landscape, used as WP featured_media)
 *   - N in-content images (square, inserted between sections)
 *
 * Each uses a prompt built from the blog title + brand IQ visual mood
 * + keyword, so they look on-brand instead of random stock. Output
 * shape: { hero: { url, prompt }, inContent: [{ url, prompt }, ...] }.
 *
 * The generated files land in deploy/images/* — same place the
 * existing image-generator.ts uses — and are served by the API under
 * /images/*. The caller can also upload them to WordPress as media.
 */
import { generateImage } from './image-generator';
import { getActiveBrandIq } from './brand-iq-extractor';

export interface BlogImageVariation {
  url: string;
  prompt: string;
  size: string;
}

export interface BlogImageBundle {
  hero: BlogImageVariation | null;
  inContent: BlogImageVariation[];
}

function buildPrompt(args: {
  title: string;
  keyword: string;
  brandMood: string;
  shotType: 'hero' | 'in_content';
  positionLabel?: string;
}): string {
  const { title, keyword, brandMood, shotType, positionLabel } = args;
  const layout =
    shotType === 'hero'
      ? 'wide cinematic 16:9 landscape composition, clear focal point, room for headline overlay top-left'
      : 'square 1:1, single subject, clean negative space, magazine-editorial composition';
  return `Editorial illustration for a B2B blog post titled "${title}" (target keyword: "${keyword}").
Mood: ${brandMood}.
Style: ${shotType === 'hero' ? 'modern hero image' : `supporting image for the "${positionLabel ?? 'middle'}" section`}, professional, high-contrast, brand-safe.
Composition: ${layout}.
No text, no logos, no watermarks. Photorealistic OR clean vector — pick whichever matches the mood. Avoid stock-photo cliches.`;
}

export interface GenerateBlogImagesArgs {
  companyId: string;
  title: string;
  keyword: string;
  /** How many in-content images to make (capped at 3). */
  inContentCount?: number;
  /** Render hero. */
  withHero?: boolean;
  /** Override mood (otherwise reads from Brand IQ). */
  moodOverride?: string;
}

export async function generateBlogImages(args: GenerateBlogImagesArgs): Promise<BlogImageBundle> {
  const inContentCount = Math.min(3, Math.max(0, args.inContentCount ?? 2));
  const withHero = args.withHero !== false;

  // Pull the brand IQ visual mood for on-brand imagery.
  let brandMood = args.moodOverride ?? 'modern, clean, human-led, professional';
  try {
    const brandIq = await getActiveBrandIq(args.companyId);
    if (brandIq?.visualIdentity?.imageMood) brandMood = brandIq.visualIdentity.imageMood;
  } catch {
    /* keep default */
  }

  const out: BlogImageBundle = { hero: null, inContent: [] };

  if (withHero) {
    const prompt = buildPrompt({
      title: args.title,
      keyword: args.keyword,
      brandMood,
      shotType: 'hero',
    });
    try {
      const res = await generateImage({ prompt, width: 1792, height: 1024 });
      out.hero = { url: res.url, prompt, size: '1792x1024' };
    } catch (e) {
      // Hero failure is non-fatal — the launch can still publish without it.
      console.warn('[blog-image] hero failed:', (e as Error).message);
    }
  }

  for (let i = 0; i < inContentCount; i++) {
    const prompt = buildPrompt({
      title: args.title,
      keyword: args.keyword,
      brandMood,
      shotType: 'in_content',
      positionLabel: ['introduction', 'middle', 'conclusion'][i] ?? `body-${i + 1}`,
    });
    try {
      const res = await generateImage({ prompt, width: 1024, height: 1024 });
      out.inContent.push({ url: res.url, prompt, size: '1024x1024' });
    } catch (e) {
      console.warn(`[blog-image] in-content ${i} failed:`, (e as Error).message);
    }
  }

  return out;
}

/**
 * Read a generated image file back into bytes so it can be uploaded
 * to WordPress as a media attachment. The url is the public-served
 * path like "/images/banner-1792x1024-1714.png".
 */
export async function readGeneratedImage(url: string): Promise<Uint8Array | null> {
  try {
    const fs = await import('fs');
    const path = await import('path');
    // Map "/images/..." to deploy/images/...
    const filename = url.replace(/^\/images\//, '');
    const filePath = path.join(process.cwd(), '..', '..', 'deploy', 'images', filename);
    if (!fs.existsSync(filePath)) return null;
    return new Uint8Array(fs.readFileSync(filePath));
  } catch {
    return null;
  }
}
