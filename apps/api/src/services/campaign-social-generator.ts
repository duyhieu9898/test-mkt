import { extractJSON, llmGenerate, type LLMResponse } from '../lib/llm';
import type { QualityTier } from '../lib/config-resolver';

export const SOCIAL_PLATFORMS = ['facebook', 'instagram', 'linkedin'] as const;
export type SocialPlatform = typeof SOCIAL_PLATFORMS[number];

export interface GeneratedSocialPost {
  platform: SocialPlatform;
  content: string;
  hashtags: string[];
}

const HASHTAG_PATTERN = /(^|\s)#([\p{L}\p{N}_-]+)/gu;

function normalizeHashtag(value: unknown): string | null {
  const normalized = String(value ?? '')
    .trim()
    .replace(/^#+/, '')
    .replace(/[^\p{L}\p{N}_-]+/gu, '')
    .slice(0, 80);
  return normalized || null;
}

export function normalizeSocialPost(
  contentValue: unknown,
  hashtagValues: unknown,
): Pick<GeneratedSocialPost, 'content' | 'hashtags'> {
  const rawContent = String(contentValue ?? '').trim();
  const hashtagsFromContent = Array.from(rawContent.matchAll(HASHTAG_PATTERN))
    .map((match) => match[2]);
  const content = rawContent
    .replace(HASHTAG_PATTERN, '$1')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
  const candidates = [
    ...(Array.isArray(hashtagValues) ? hashtagValues : []),
    ...hashtagsFromContent,
  ];
  const seen = new Set<string>();
  const hashtags: string[] = [];
  for (const candidate of candidates) {
    const hashtag = normalizeHashtag(candidate);
    if (!hashtag) continue;
    const key = hashtag.toLocaleLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    hashtags.push(hashtag);
  }

  return { content, hashtags };
}

function platformRules(platforms: SocialPlatform[]): string {
  return platforms.map((platform) => {
    if (platform === 'facebook') {
      return '- facebook: conversational, useful, community-friendly, 80-160 words, 3-5 hashtags';
    }
    if (platform === 'instagram') {
      return '- instagram: vivid hook, concise visual storytelling, natural line breaks, 5-10 hashtags';
    }
    return '- linkedin: professional insight, concrete value, credible tone, 100-220 words, 3-5 hashtags';
  }).join('\n');
}

export async function generateCampaignSocialPosts(args: {
  companyId: string;
  campaignId: string;
  topic: string;
  audience?: string;
  goal?: string;
  context: string;
  platforms: SocialPlatform[];
  brandPromptBlock?: string;
  tier?: QualityTier;
  traceName?: string;
}): Promise<{ posts: GeneratedSocialPost[]; llmResponse: LLMResponse }> {
  const platforms = [...new Set(args.platforms)];
  if (platforms.length === 0) throw new Error('At least one social platform is required');

  const llmResponse = await llmGenerate(
    [
      {
        role: 'system',
        content: [
          'You are a senior social media strategist and copywriter.',
          'Write original, campaign-specific posts using the supplied business and source context.',
          'Treat source documents as reference material. Never copy file names, MIME types, source labels, prompts, or truncated excerpts into a post.',
          'The content field MUST NOT contain hashtags. Put hashtags only in the hashtags array.',
          'Return strict JSON only.',
        ].join('\n'),
      },
      {
        role: 'user',
        content: [
          `CAMPAIGN TOPIC: ${args.topic}`,
          args.goal ? `CAMPAIGN GOAL: ${args.goal}` : '',
          args.audience ? `TARGET AUDIENCE: ${args.audience}` : '',
          args.brandPromptBlock || '',
          `BUSINESS AND CAMPAIGN CONTEXT:\n${args.context.slice(0, 6000)}`,
          `Create exactly one original post for each platform: ${platforms.join(', ')}.`,
          platformRules(platforms),
          'Use specific ideas from the context, but rewrite them as polished social copy with a clear hook and next step.',
          'JSON shape:',
          '{"posts":[{"platform":"facebook","content":"Post text without hashtags","hashtags":["RelevantTag"]}]}',
        ].filter(Boolean).join('\n\n'),
      },
    ],
    {
      featureKey: 'campaign_social_post',
      tier: args.tier ?? 'balanced',
      traceName: args.traceName ?? 'campaign.generateSocialPosts',
      metadata: { companyId: args.companyId, campaignId: args.campaignId },
      json: true,
      maxTokens: 2400,
    },
  );

  const parsed = extractJSON(llmResponse.text) as { posts?: unknown[] } | null;
  const rawPosts = Array.isArray(parsed?.posts) ? parsed.posts : [];
  const byPlatform = new Map<SocialPlatform, GeneratedSocialPost>();
  for (const rawPost of rawPosts) {
    const post = rawPost as Record<string, unknown>;
    const platform = String(post.platform ?? '').toLowerCase() as SocialPlatform;
    if (!platforms.includes(platform) || byPlatform.has(platform)) continue;
    const normalized = normalizeSocialPost(post.content, post.hashtags);
    if (!normalized.content) continue;
    byPlatform.set(platform, { platform, ...normalized });
  }

  const missing = platforms.filter((platform) => !byPlatform.has(platform));
  if (missing.length > 0) {
    throw new Error(`AI did not generate valid social content for: ${missing.join(', ')}`);
  }

  return {
    posts: platforms.map((platform) => byPlatform.get(platform)!),
    llmResponse,
  };
}
