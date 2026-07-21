import { and, eq } from 'drizzle-orm';
import { blogPosts, campaigns } from '@1person/core/db';
import { db } from '../lib/db';
import { BlogGenerator } from './blog-generator';
import {
  generateBlogImages,
  type BlogImageVariation,
} from './blog-image-variations';
import { normalizeContentLanguage, resolveCompanyLanguage } from '../lib/language';

export interface CreateCampaignBlogInput {
  companyId: string;
  campaignId: string;
  goal: string;
  contentTopic?: string;
  contentAngle?: string;
  audience: string;
  sourceContext: string;
  language?: string;
  targetWordCount?: number;
}

export function buildCampaignBlogKeyword(
  input: Pick<CreateCampaignBlogInput, 'goal' | 'audience' | 'contentTopic'>,
): string {
  const goal = (input.contentTopic || input.goal).replace(/\s+/g, ' ').trim();
  const audience = input.audience.replace(/\s+/g, ' ').trim();
  if (input.contentTopic) return goal.slice(0, 180);
  return (audience ? `${goal} for ${audience}` : goal).slice(0, 180);
}

function escapeHtmlAttribute(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function buildBlogFigure(image: BlogImageVariation, alt: string): string {
  return [
    '<figure class="campaign-blog-image">',
    `<img src="${escapeHtmlAttribute(image.url)}" alt="${escapeHtmlAttribute(alt)}" loading="lazy" />`,
    '</figure>',
  ].join('');
}

export function insertCampaignBlogImages(
  html: string,
  images: BlogImageVariation[],
  title: string,
): string {
  const usableImages = images.slice(0, 2);
  if (usableImages.length === 0) return html;

  const h2Matches = [...html.matchAll(/<h2\b[^>]*>[\s\S]*?<\/h2>/gi)];
  if (h2Matches.length === 0) {
    return `${buildBlogFigure(usableImages[0]!, title)}\n\n${html}`;
  }

  const insertionIndexes = usableImages.length === 1
    ? [h2Matches[Math.min(1, h2Matches.length - 1)]?.index ?? h2Matches[0]?.index ?? 0]
    : [
      h2Matches[0]?.index ?? 0,
      h2Matches[Math.max(1, Math.floor(h2Matches.length / 2))]?.index
        ?? h2Matches[h2Matches.length - 1]?.index
        ?? 0,
    ];

  const inserts = usableImages
    .map((image, index) => ({
      image,
      index: insertionIndexes[index] ?? 0,
      alt: `${title} supporting image ${index + 1}`,
    }))
    .sort((left, right) => right.index - left.index);

  let output = html;
  for (const insert of inserts) {
    output = `${output.slice(0, insert.index)}${buildBlogFigure(insert.image, insert.alt)}\n\n${output.slice(insert.index)}`;
  }
  return output;
}

/**
 * Generate a campaign blog, enrich it with up to two contextual images, and
 * attach it to campaign.targeting. Both user-requested and autonomous campaign
 * flows use this single write path.
 */
export async function createCampaignBlog(
  input: CreateCampaignBlogInput,
): Promise<typeof blogPosts.$inferSelect> {
  const campaign = await db.query.campaigns.findFirst({
    where: and(
      eq(campaigns.id, input.campaignId),
      eq(campaigns.companyId, input.companyId),
    ),
  });
  if (!campaign) throw new Error('Campaign not found while creating blog');

  const currentTargeting =
    (campaign.targeting as Record<string, unknown> | null | undefined) ?? {};
  const existingBlogPostId = typeof currentTargeting.blogPostId === 'string'
    ? currentTargeting.blogPostId
    : null;
  if (existingBlogPostId) {
    const existingBlog = await db.query.blogPosts.findFirst({
      where: and(
        eq(blogPosts.id, existingBlogPostId),
        eq(blogPosts.companyId, input.companyId),
      ),
    });
    if (existingBlog) return existingBlog;
  }

  const keyword = buildCampaignBlogKeyword(input);
  const language = input.language
    ? normalizeContentLanguage(input.language)
    : await resolveCompanyLanguage(input.companyId);
  const generator = new BlogGenerator();
  const sourceContext = [
    input.sourceContext,
    input.contentAngle
      ? `\nCampaign content angle for the reader:\n${input.contentAngle}`
      : '',
    input.contentTopic
      ? `\nUse the public topic above for article ideation. Do not use the internal campaign objective "${input.goal}" as the public blog title.`
      : '',
  ].filter(Boolean).join('\n');
  const blog = await generator.generateBlogPost(input.companyId, {
    keyword,
    searchIntent: 'commercial',
    language,
    targetWordCount: input.targetWordCount ?? 1800,
    sourceContext,
  });

  let contentWithImages = blog.content;
  try {
    const imageBundle = await generateBlogImages({
      companyId: input.companyId,
      title: blog.title,
      keyword,
      withHero: false,
      inContentCount: 2,
      excerpt: blog.excerpt,
      contentHtml: blog.content,
      allowFallback: true,
    });
    contentWithImages = insertCampaignBlogImages(
      blog.content,
      imageBundle.inContent,
      blog.title,
    );
  } catch (error) {
    console.warn('[campaign-blog] image generation failed:', (error as Error).message);
  }

  const [savedBlog] = await db
    .insert(blogPosts)
    .values({
      companyId: input.companyId,
      title: blog.title,
      slug: blog.slug,
      metaDescription: blog.metaDescription,
      content: contentWithImages,
      excerpt: blog.excerpt,
      keyword,
      searchIntent: 'commercial',
      tags: blog.tags,
      faq: blog.faq,
      schemaMarkup: blog.schemaMarkup,
      wordCount: blog.wordCount,
      language,
      status: 'draft',
    })
    .returning();
  if (!savedBlog) throw new Error('Failed to save campaign blog post');

  await db
    .update(campaigns)
    .set({
      targeting: {
        ...currentTargeting,
        blogPostId: savedBlog.id,
        blogKeyword: keyword,
      } as any,
      updatedAt: new Date(),
    })
    .where(and(
      eq(campaigns.id, input.campaignId),
      eq(campaigns.companyId, input.companyId),
    ));

  return savedBlog;
}
