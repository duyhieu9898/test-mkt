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
import { readObjectFromPublicUrl } from './object-storage';

export interface BlogImageVariation {
  url: string;
  prompt: string;
  size: string;
}

export interface BlogImageBundle {
  hero: BlogImageVariation | null;
  inContent: BlogImageVariation[];
}

export interface GeneratedImageFile {
  bytes: Uint8Array;
  contentType: string;
}

type BlogImageTask = {
  kind: 'hero' | 'in_content';
  failureLabel: string;
  logLabel: string;
  order: number;
  prompt: string;
  width: number;
  height: number;
  size: string;
};

function buildPrompt(args: {
  title: string;
  keyword: string;
  brandMood: string;
  shotType: 'hero' | 'in_content';
  positionLabel?: string;
  excerpt?: string;
  articleSummary?: string;
  sectionHeading?: string;
  sectionSummary?: string;
}): string {
  const {
    title,
    keyword,
    brandMood,
    shotType,
    positionLabel,
    excerpt,
    articleSummary,
    sectionHeading,
    sectionSummary,
  } = args;
  const layout =
    shotType === 'hero'
      ? 'wide cinematic 16:9 landscape composition, one clear subject, strong editorial focal point'
      : 'square 1:1, one concrete subject, clean negative space, magazine-editorial composition';
  const subjectContext = shotType === 'hero'
    ? `Whole-article context: ${articleSummary || excerpt || title}`
    : `Specific section to illustrate: "${sectionHeading || positionLabel || title}".
Section meaning: ${sectionSummary || articleSummary || excerpt || title}`;

  return `Create a context-specific editorial image for this blog article.

Article title: "${title}"
Target keyword: "${keyword}"
Article excerpt: ${excerpt || 'N/A'}
${subjectContext}

Visual requirements:
- The image MUST visibly relate to the article/section topic above, not just be a generic abstract background.
- Depict concrete objects, environment, workflow, people-at-work, product/service context, or metaphor directly tied to the topic.
- If the topic is travel/location, show recognizable travel/location cues. If the topic is software/business, show relevant work scenes, dashboards, teams, systems, or process visuals.
- Avoid unrelated stock-photo cliches, random gradients, decorative blobs, generic office scenes, and generic landscapes.
- TEXT-FREE ONLY: no readable text, no fake text, no typography, no letters, no numbers, no captions, no labels, no signs, no posters, no logos, no watermarks.
- Avoid objects or surfaces that usually contain words, including billboards, street signs, shop signs, labels, screens, documents, tickets, brochures, packages, jerseys, license plates, and maps.
- This image can be reused as a banner background, so do not compose an ad, poster, title card, CTA button, or graphic layout.

Brand mood: ${brandMood}
Style: ${shotType === 'hero' ? 'premium blog hero image' : `supporting image for the ${positionLabel ?? 'middle'} section`}, professional, brand-safe, high quality.
Composition: ${layout}.`;
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
  /** Blog excerpt used to keep images tied to the article. */
  excerpt?: string;
  /** Full generated HTML used for section-specific image prompts. */
  contentHtml?: string;
  /** Allow local fallback images when no semantic image provider is configured. */
  allowFallback?: boolean;
}

export async function generateBlogImages(args: GenerateBlogImagesArgs): Promise<BlogImageBundle> {
  const inContentCount = Math.min(3, Math.max(0, args.inContentCount ?? 2));
  const withHero = args.withHero !== false;
  const articleSummary = summarizeText(args.contentHtml || args.excerpt || args.title, 700);
  const sections = extractContentSections(args.contentHtml || '')
    .filter((section) => !/frequently asked questions/i.test(section.heading));
  const failures: string[] = [];

  // Pull the brand IQ visual mood for on-brand imagery.
  let brandMood = args.moodOverride ?? 'modern, clean, human-led, professional';
  try {
    const brandIq = await getActiveBrandIq(args.companyId);
    if (brandIq?.visualIdentity?.imageMood) brandMood = brandIq.visualIdentity.imageMood;
  } catch {
    /* keep default */
  }

  const out: BlogImageBundle = { hero: null, inContent: [] };
  const imageTasks: BlogImageTask[] = [];

  if (withHero) {
    imageTasks.push({
      kind: 'hero',
      failureLabel: 'hero',
      logLabel: 'hero',
      order: 0,
      prompt: buildPrompt({
        title: args.title,
        keyword: args.keyword,
        brandMood,
        shotType: 'hero',
        excerpt: args.excerpt,
        articleSummary,
      }),
      width: 1792,
      height: 1024,
      size: '1792x1024',
    });
  }

  for (let i = 0; i < inContentCount; i++) {
    const section = pickSectionForImage(sections, i, inContentCount);
    imageTasks.push({
      kind: 'in_content',
      failureLabel: `in-content ${i + 1}`,
      logLabel: `in-content ${i}`,
      order: i,
      prompt: buildPrompt({
        title: args.title,
        keyword: args.keyword,
        brandMood,
        shotType: 'in_content',
        positionLabel: ['introduction', 'middle', 'conclusion'][i] ?? `body-${i + 1}`,
        excerpt: args.excerpt,
        articleSummary,
        sectionHeading: section?.heading,
        sectionSummary: section?.summary,
      }),
      width: 1024,
      height: 1024,
      size: '1024x1024',
    });
  }

  // Image generation is the slowest Campaign Launcher step. The hero and
  // supporting images are independent, so run them concurrently while keeping
  // the same partial-failure behavior as the old sequential implementation.
  const imageResults = await Promise.allSettled(
    imageTasks.map(async (task) => {
      const res = await generateImage({
        prompt: task.prompt,
        width: task.width,
        height: task.height,
        allowFallback: args.allowFallback === true,
      });
      return {
        task,
        image: { url: res.url, prompt: task.prompt, size: task.size },
      };
    }),
  );

  const inContentByOrder = new Map<number, BlogImageVariation>();
  imageResults.forEach((result, index) => {
    const task = imageTasks[index];
    if (!task) return;

    if (result.status === 'fulfilled') {
      if (task.kind === 'hero') {
        out.hero = result.value.image;
      } else {
        inContentByOrder.set(task.order, result.value.image);
      }
      return;
    }

    const message = result.reason instanceof Error
      ? result.reason.message
      : String(result.reason || 'Unknown image generation error');
    failures.push(`${task.failureLabel}: ${message}`);
    console.warn(`[blog-image] ${task.logLabel} failed:`, message);
  });

  out.inContent = Array.from(inContentByOrder.entries())
    .sort(([a], [b]) => a - b)
    .map(([, image]) => image);

  const generatedCount = (out.hero ? 1 : 0) + out.inContent.length;
  if (generatedCount === 0 && failures.length > 0) {
    throw new Error(`Image generation failed for all images. ${failures.join(' | ')}`);
  }

  return out;
}
function extractContentSections(html: string): Array<{ heading: string; summary: string }> {
  if (!html.trim()) return [];
  const sections: Array<{ heading: string; summary: string }> = [];
  const h2Pattern = /<h2\b[^>]*>([\s\S]*?)<\/h2>/gi;
  const matches = [...html.matchAll(h2Pattern)];

  for (let i = 0; i < matches.length; i++) {
    const match = matches[i];
    if (!match) continue;
    if (match.index === undefined) continue;
    const next = matches[i + 1]?.index ?? html.length;
    const bodyStart = match.index + match[0].length;
    const heading = cleanText(match[1] || '');
    const body = cleanText(html.slice(bodyStart, next));
    if (!heading || !body) continue;
    sections.push({ heading, summary: summarizeText(body, 420) });
  }

  return sections;
}

function pickSectionForImage(
  sections: Array<{ heading: string; summary: string }>,
  index: number,
  total: number,
): { heading: string; summary: string } | null {
  if (sections.length === 0) return null;
  if (total <= 1) return sections[Math.min(1, sections.length - 1)] ?? sections[0] ?? null;
  const sectionIndex = Math.round((index / Math.max(1, total - 1)) * (sections.length - 1));
  return sections[Math.max(0, Math.min(sections.length - 1, sectionIndex))] ?? null;
}

function summarizeText(value: string, maxLength: number): string {
  const text = cleanText(value);
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength).replace(/\s+\S*$/, '')}.`;
}

function cleanText(value: string): string {
  return value
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Read a generated image file back into bytes so it can be uploaded
 * to WordPress as a media attachment. The url is the public-served
 * path like "/images/banner-1792x1024-1714.png".
 */
export async function readGeneratedImageFile(url: string): Promise<GeneratedImageFile | null> {
  try {
    const buffer = await readObjectFromPublicUrl(url);
    if (!buffer) return null;
    return { bytes: new Uint8Array(buffer), contentType: inferContentType(url) };
  } catch {
    return null;
  }
}

export async function readGeneratedImage(url: string): Promise<Uint8Array | null> {
  const file = await readGeneratedImageFile(url);
  return file?.bytes ?? null;
}

function inferContentType(filenameOrUrl: string): string {
  const value = filenameOrUrl.toLowerCase().split('?')[0] ?? '';
  if (value.endsWith('.jpg') || value.endsWith('.jpeg')) return 'image/jpeg';
  if (value.endsWith('.webp')) return 'image/webp';
  if (value.endsWith('.gif')) return 'image/gif';
  return 'image/png';
}
