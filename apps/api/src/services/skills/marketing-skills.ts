import Anthropic from '@anthropic-ai/sdk';
import { assetGenerationService } from '../asset-generation-service';
import { brandIdentityService } from '../brand-identity-service';
import { distributionEngine } from '../distribution-engine';
import type { BrandColors, BrandVoice } from '@1person/core/db';

const anthropic = new Anthropic();

// Types for skill inputs/outputs
export interface SkillResult {
  success: boolean;
  data?: unknown;
  error?: string;
  metadata?: {
    tokensUsed?: number;
    executionTimeMs?: number;
    costIncurred?: number;
  };
}

// ============================================
// GENERATE AD COPY SKILL
// ============================================
export interface GenerateAdCopyInput {
  companyId: string;
  productName: string;
  productDescription: string;
  targetAudience: string;
  platform: 'facebook' | 'google' | 'linkedin' | 'instagram' | 'twitter';
  tone?: 'professional' | 'casual' | 'urgent' | 'inspirational';
  maxLength?: number;
  includeEmoji?: boolean;
  callToAction?: string;
  variations?: number;
}

export interface GeneratedAdCopy {
  headline: string;
  description: string;
  callToAction: string;
  hashtags?: string[];
  targetPlatform: string;
}

export async function generateAdCopy(input: GenerateAdCopyInput): Promise<SkillResult> {
  const startTime = Date.now();

  try {
    // Get brand voice for consistency
    const brand = await brandIdentityService.getBrandIdentity(input.companyId);
    const voice = brand?.voice as BrandVoice | undefined;

    const platformGuides: Record<string, string> = {
      facebook: 'Facebook: Engaging, conversational, 125 chars headline, 90 chars primary text recommended',
      google: 'Google Ads: Concise, keyword-rich, max 30 chars headlines, 90 chars description',
      linkedin: 'LinkedIn: Professional, B2B focused, thought leadership style',
      instagram: 'Instagram: Visual-first, hashtag-friendly, engaging caption style',
      twitter: 'X/Twitter: Punchy, concise, max 280 characters, trending format',
    };

    const prompt = `You are an expert advertising copywriter. Generate ${input.variations || 3} variations of ad copy for the following:

Product: ${input.productName}
Description: ${input.productDescription}
Target Audience: ${input.targetAudience}
Platform: ${input.platform}
${platformGuides[input.platform]}
Tone: ${input.tone || 'professional'}
${voice?.tone ? `Brand Voice: ${voice.tone.join(', ')}` : ''}
${input.callToAction ? `Desired CTA: ${input.callToAction}` : ''}
${input.includeEmoji ? 'Include relevant emojis' : 'No emojis'}
${input.maxLength ? `Max length: ${input.maxLength} characters` : ''}

For each variation, provide:
1. Headline (attention-grabbing)
2. Description/Body copy
3. Call to action
4. Relevant hashtags (if applicable for platform)

Return as JSON array:
[{
  "headline": "...",
  "description": "...",
  "callToAction": "...",
  "hashtags": ["#tag1", "#tag2"]
}]

Return ONLY valid JSON, no markdown or explanation.`;

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 2000,
      messages: [{ role: 'user', content: prompt }],
    });

    const content = response.content[0];
    if (!content || content.type !== 'text') {
      throw new Error('Unexpected response type');
    }

    const jsonMatch = content.text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      throw new Error('No JSON array found in response');
    }

    const adCopies: GeneratedAdCopy[] = JSON.parse(jsonMatch[0]);

    return {
      success: true,
      data: {
        copies: adCopies.map((copy) => ({
          ...copy,
          targetPlatform: input.platform,
        })),
      },
      metadata: {
        tokensUsed: response.usage.input_tokens + response.usage.output_tokens,
        executionTimeMs: Date.now() - startTime,
        costIncurred: 0.003 * (response.usage.output_tokens / 1000),
      },
    };
  } catch (error) {
    console.error('[MarketingSkills] generateAdCopy failed:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      metadata: { executionTimeMs: Date.now() - startTime },
    };
  }
}

// ============================================
// GENERATE BANNER SKILL
// ============================================
export interface GenerateBannerInput {
  companyId: string;
  headline: string;
  subheadline?: string;
  ctaText?: string;
  style?: 'modern' | 'minimal' | 'bold' | 'elegant';
  size: 'facebook' | 'instagram' | 'twitter' | 'linkedin' | 'custom';
  customWidth?: number;
  customHeight?: number;
  agentId?: string;
  taskId?: string;
}

export async function generateBanner(input: GenerateBannerInput): Promise<SkillResult> {
  const startTime = Date.now();

  try {
    const assets = await assetGenerationService.generateBanner(input.companyId, {
      headline: input.headline,
      subheadline: input.subheadline,
      ctaText: input.ctaText,
      style: input.style,
      size: input.size,
      customWidth: input.customWidth,
      customHeight: input.customHeight,
      agentId: input.agentId,
      taskId: input.taskId,
    });

    const totalCost = assets.reduce((sum, a) => sum + (a.generationCost || 0), 0);

    return {
      success: true,
      data: {
        assets: assets.map((a) => ({
          id: a.id,
          url: a.publicUrl || a.url,
          thumbnailUrl: a.thumbnailUrl,
          dimensions: {
            width: a.metadata.width,
            height: a.metadata.height,
          },
        })),
      },
      metadata: {
        executionTimeMs: Date.now() - startTime,
        costIncurred: totalCost,
      },
    };
  } catch (error) {
    console.error('[MarketingSkills] generateBanner failed:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      metadata: { executionTimeMs: Date.now() - startTime },
    };
  }
}

// ============================================
// GENERATE SHORT VIDEO SKILL
// ============================================
export interface GenerateShortVideoInput {
  companyId: string;
  prompt: string;
  duration?: number;
  aspectRatio?: '16:9' | '9:16' | '1:1';
  style?: 'realistic' | 'animated' | 'cinematic';
  agentId?: string;
  taskId?: string;
}

export async function generateShortVideo(input: GenerateShortVideoInput): Promise<SkillResult> {
  const startTime = Date.now();

  try {
    const assets = await assetGenerationService.generateVideo({
      companyId: input.companyId,
      prompt: input.prompt,
      duration: input.duration || 5,
      aspectRatio: input.aspectRatio || '16:9',
      style: input.style,
      useBrandColors: true,
      agentId: input.agentId,
      taskId: input.taskId,
    });

    const totalCost = assets.reduce((sum, a) => sum + (a.generationCost || 0), 0);

    return {
      success: true,
      data: {
        videos: assets.map((a) => ({
          id: a.id,
          url: a.publicUrl || a.url,
          thumbnailUrl: a.thumbnailUrl,
          duration: a.metadata.duration,
        })),
      },
      metadata: {
        executionTimeMs: Date.now() - startTime,
        costIncurred: totalCost,
      },
    };
  } catch (error) {
    console.error('[MarketingSkills] generateShortVideo failed:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      metadata: { executionTimeMs: Date.now() - startTime },
    };
  }
}

// ============================================
// SCHEDULE SOCIAL POST SKILL
// Uses Distribution Engine for real social media posting
// ============================================
export interface ScheduleSocialPostInput {
  companyId: string;
  connectionId: string; // Required: ID of the social connection to use
  platform: 'facebook' | 'instagram' | 'twitter' | 'linkedin';
  content: string;
  mediaUrls?: string[];
  scheduledTime: string; // ISO timestamp
  hashtags?: string[];
  campaignId?: string;
  campaignName?: string;
}

export interface ScheduledPost {
  id: string;
  platform: string;
  content: string;
  scheduledTime: string;
  status: 'scheduled' | 'published' | 'failed';
  platformPostId?: string;
  platformPostUrl?: string;
}

export async function scheduleSocialPost(input: ScheduleSocialPostInput): Promise<SkillResult> {
  const startTime = Date.now();

  try {
    // Use the Distribution Engine to schedule the post
    const postId = await distributionEngine.createPost({
      companyId: input.companyId,
      connectionId: input.connectionId,
      platform: input.platform,
      contentText: input.content,
      hashtags: input.hashtags,
      mediaUrls: input.mediaUrls,
      scheduledFor: new Date(input.scheduledTime),
      campaignId: input.campaignId,
      campaignName: input.campaignName,
    });

    const scheduledPost: ScheduledPost = {
      id: postId,
      platform: input.platform,
      content: input.content,
      scheduledTime: input.scheduledTime,
      status: 'scheduled',
    };

    console.log(`[MarketingSkills] Scheduled post via Distribution Engine for ${input.platform}:`, {
      id: postId,
      time: input.scheduledTime,
      contentPreview: input.content.substring(0, 50),
    });

    return {
      success: true,
      data: {
        post: scheduledPost,
        message: `Post scheduled for ${new Date(input.scheduledTime).toLocaleString()}`,
      },
      metadata: {
        executionTimeMs: Date.now() - startTime,
      },
    };
  } catch (error) {
    console.error('[MarketingSkills] scheduleSocialPost failed:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      metadata: { executionTimeMs: Date.now() - startTime },
    };
  }
}

// ============================================
// PUBLISH SOCIAL POST NOW SKILL
// Immediately publishes a post via Distribution Engine
// ============================================
export interface PublishSocialPostInput {
  companyId: string;
  connectionId: string;
  platform: 'facebook' | 'instagram' | 'twitter' | 'linkedin';
  content: string;
  mediaUrls?: string[];
  hashtags?: string[];
  campaignId?: string;
  campaignName?: string;
}

export async function publishSocialPost(input: PublishSocialPostInput): Promise<SkillResult> {
  const startTime = Date.now();

  try {
    // Create post scheduled for now
    const postId = await distributionEngine.createPost({
      companyId: input.companyId,
      connectionId: input.connectionId,
      platform: input.platform,
      contentText: input.content,
      hashtags: input.hashtags,
      mediaUrls: input.mediaUrls,
      scheduledFor: new Date(), // Now
      campaignId: input.campaignId,
      campaignName: input.campaignName,
    });

    // Publish immediately
    const result = await distributionEngine.publishPost(postId);

    if (!result.success) {
      throw new Error(result.error || 'Failed to publish post');
    }

    console.log(`[MarketingSkills] Published post to ${input.platform}:`, {
      id: postId,
      platformPostId: result.platformPostId,
      platformPostUrl: result.platformPostUrl,
    });

    return {
      success: true,
      data: {
        post: {
          id: postId,
          platform: input.platform,
          content: input.content,
          status: 'published',
          platformPostId: result.platformPostId,
          platformPostUrl: result.platformPostUrl,
        },
        message: `Post published successfully to ${input.platform}`,
      },
      metadata: {
        executionTimeMs: Date.now() - startTime,
      },
    };
  } catch (error) {
    console.error('[MarketingSkills] publishSocialPost failed:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      metadata: { executionTimeMs: Date.now() - startTime },
    };
  }
}

// ============================================
// GET POST ENGAGEMENT SKILL
// Fetches engagement metrics from Distribution Engine
// ============================================
export interface GetPostEngagementInput {
  companyId: string;
  postId: string;
}

export async function getPostEngagement(input: GetPostEngagementInput): Promise<SkillResult> {
  const startTime = Date.now();

  try {
    // Fetch fresh engagement from platform
    await distributionEngine.fetchEngagement(input.postId);

    // Get engagement history
    const history = await distributionEngine.getEngagementHistory(input.postId);
    const latest = history[0]; // Most recent

    if (!latest) {
      return {
        success: true,
        data: {
          engagement: null,
          message: 'No engagement data available yet',
        },
        metadata: { executionTimeMs: Date.now() - startTime },
      };
    }

    return {
      success: true,
      data: {
        engagement: {
          likes: latest.likes,
          comments: latest.comments,
          shares: latest.shares,
          impressions: latest.impressions,
          reach: latest.reach,
          engagementRate: latest.engagementRate,
          fetchedAt: latest.fetchedAt,
        },
        history: history.slice(0, 10), // Last 10 records
      },
      metadata: {
        executionTimeMs: Date.now() - startTime,
      },
    };
  } catch (error) {
    console.error('[MarketingSkills] getPostEngagement failed:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      metadata: { executionTimeMs: Date.now() - startTime },
    };
  }
}

// ============================================
// GET DISTRIBUTION METRICS SKILL
// Gets overall metrics summary from Distribution Engine
// ============================================
export interface GetDistributionMetricsInput {
  companyId: string;
}

export async function getDistributionMetrics(input: GetDistributionMetricsInput): Promise<SkillResult> {
  const startTime = Date.now();

  try {
    const metrics = await distributionEngine.getMetricsSummary(input.companyId);

    return {
      success: true,
      data: { metrics },
      metadata: {
        executionTimeMs: Date.now() - startTime,
      },
    };
  } catch (error) {
    console.error('[MarketingSkills] getDistributionMetrics failed:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      metadata: { executionTimeMs: Date.now() - startTime },
    };
  }
}

// ============================================
// GENERATE SOCIAL CONTENT SKILL
// ============================================
export interface GenerateSocialContentInput {
  companyId: string;
  platform: 'instagram' | 'facebook' | 'twitter' | 'linkedin' | 'tiktok';
  contentType: 'post' | 'story' | 'reel';
  topic: string;
  style?: 'informative' | 'promotional' | 'engaging' | 'inspirational';
  generateCaption?: boolean;
  agentId?: string;
  taskId?: string;
}

export async function generateSocialContent(input: GenerateSocialContentInput): Promise<SkillResult> {
  const startTime = Date.now();

  try {
    // Generate the visual content
    const assets = await assetGenerationService.generateSocialContent(input.companyId, {
      platform: input.platform,
      contentType: input.contentType,
      topic: input.topic,
      style: input.style,
      agentId: input.agentId,
      taskId: input.taskId,
    });

    let caption: string | undefined;
    let hashtags: string[] | undefined;

    // Generate caption if requested
    if (input.generateCaption) {
      const brand = await brandIdentityService.getBrandIdentity(input.companyId);
      const voice = brand?.voice as BrandVoice | undefined;

      const captionPrompt = `Generate a ${input.platform} ${input.contentType} caption for this topic: "${input.topic}"

Platform: ${input.platform}
Style: ${input.style || 'engaging'}
${voice?.tone ? `Brand Voice: ${voice.tone.join(', ')}` : ''}

Requirements:
- Be ${input.platform === 'twitter' ? 'concise (max 280 chars)' : 'engaging'}
- Include a call-to-action
- Generate relevant hashtags
${input.platform === 'instagram' ? '- Include emojis' : ''}

Return JSON: { "caption": "...", "hashtags": ["#tag1", "#tag2"] }`;

      const captionResponse = await anthropic.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 500,
        messages: [{ role: 'user', content: captionPrompt }],
      });

      const captionContent = captionResponse.content[0];
      if (captionContent && captionContent.type === 'text') {
        const jsonMatch = captionContent.text.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          caption = parsed.caption;
          hashtags = parsed.hashtags;
        }
      }
    }

    const totalCost = assets.reduce((sum, a) => sum + (a.generationCost || 0), 0);

    return {
      success: true,
      data: {
        assets: assets.map((a) => ({
          id: a.id,
          url: a.publicUrl || a.url,
          thumbnailUrl: a.thumbnailUrl,
          dimensions: {
            width: a.metadata.width,
            height: a.metadata.height,
          },
        })),
        caption,
        hashtags,
        platform: input.platform,
        contentType: input.contentType,
      },
      metadata: {
        executionTimeMs: Date.now() - startTime,
        costIncurred: totalCost + (input.generateCaption ? 0.001 : 0),
      },
    };
  } catch (error) {
    console.error('[MarketingSkills] generateSocialContent failed:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      metadata: { executionTimeMs: Date.now() - startTime },
    };
  }
}

// ============================================
// GENERATE EMAIL CAMPAIGN SKILL
// ============================================
export interface GenerateEmailCampaignInput {
  companyId: string;
  campaignType: 'promotional' | 'newsletter' | 'welcome' | 're-engagement' | 'announcement';
  subject: string;
  targetAudience: string;
  keyMessage: string;
  callToAction: string;
  includeImages?: boolean;
  tone?: 'professional' | 'casual' | 'urgent' | 'friendly';
}

export interface GeneratedEmail {
  subject: string;
  preheader: string;
  htmlContent: string;
  textContent: string;
}

export async function generateEmailCampaign(input: GenerateEmailCampaignInput): Promise<SkillResult> {
  const startTime = Date.now();

  try {
    const brand = await brandIdentityService.getBrandIdentity(input.companyId);
    const colors = brand?.colors as BrandColors | undefined;
    const voice = brand?.voice as BrandVoice | undefined;

    const prompt = `Generate a ${input.campaignType} email campaign with the following details:

Subject: ${input.subject}
Target Audience: ${input.targetAudience}
Key Message: ${input.keyMessage}
Call to Action: ${input.callToAction}
Tone: ${input.tone || 'professional'}
${voice?.tone ? `Brand Voice: ${voice.tone.join(', ')}` : ''}
${colors ? `Brand Colors: Primary ${colors.primary}` : ''}

Generate:
1. Email subject line (compelling, 50 chars max)
2. Preheader text (90 chars max)
3. HTML email content (clean, responsive design)
4. Plain text version

Return JSON:
{
  "subject": "...",
  "preheader": "...",
  "htmlContent": "<!DOCTYPE html>...",
  "textContent": "..."
}

Return ONLY valid JSON.`;

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4000,
      messages: [{ role: 'user', content: prompt }],
    });

    const content = response.content[0];
    if (!content || content.type !== 'text') {
      throw new Error('Unexpected response type');
    }

    const jsonMatch = content.text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('No JSON found in response');
    }

    const email: GeneratedEmail = JSON.parse(jsonMatch[0]);

    return {
      success: true,
      data: { email },
      metadata: {
        tokensUsed: response.usage.input_tokens + response.usage.output_tokens,
        executionTimeMs: Date.now() - startTime,
        costIncurred: 0.003 * (response.usage.output_tokens / 1000),
      },
    };
  } catch (error) {
    console.error('[MarketingSkills] generateEmailCampaign failed:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      metadata: { executionTimeMs: Date.now() - startTime },
    };
  }
}

// ============================================
// ANALYZE CAMPAIGN PERFORMANCE SKILL
// ============================================
export interface AnalyzeCampaignInput {
  companyId: string;
  campaignId: string;
  metrics: {
    impressions: number;
    clicks: number;
    conversions: number;
    spend: number;
    revenue?: number;
    engagement?: number;
  };
  campaignType: 'ads' | 'email' | 'social';
  timeframe: string;
}

export interface CampaignAnalysis {
  summary: string;
  kpis: {
    ctr: number;
    conversionRate: number;
    cpc: number;
    roas?: number;
  };
  insights: string[];
  recommendations: string[];
}

export async function analyzeCampaignPerformance(input: AnalyzeCampaignInput): Promise<SkillResult> {
  const startTime = Date.now();

  try {
    // Calculate basic KPIs
    const ctr = (input.metrics.clicks / input.metrics.impressions) * 100;
    const conversionRate = (input.metrics.conversions / input.metrics.clicks) * 100;
    const cpc = input.metrics.spend / input.metrics.clicks;
    const roas = input.metrics.revenue ? input.metrics.revenue / input.metrics.spend : undefined;

    const prompt = `Analyze this ${input.campaignType} campaign performance:

Campaign ID: ${input.campaignId}
Timeframe: ${input.timeframe}

Metrics:
- Impressions: ${input.metrics.impressions.toLocaleString()}
- Clicks: ${input.metrics.clicks.toLocaleString()}
- CTR: ${ctr.toFixed(2)}%
- Conversions: ${input.metrics.conversions.toLocaleString()}
- Conversion Rate: ${conversionRate.toFixed(2)}%
- Spend: $${input.metrics.spend.toFixed(2)}
- CPC: $${cpc.toFixed(2)}
${input.metrics.revenue ? `- Revenue: $${input.metrics.revenue.toFixed(2)}` : ''}
${roas ? `- ROAS: ${roas.toFixed(2)}x` : ''}
${input.metrics.engagement ? `- Engagement: ${input.metrics.engagement}` : ''}

Provide:
1. Brief performance summary
2. Key insights (what's working, what's not)
3. Actionable recommendations for improvement

Return JSON:
{
  "summary": "...",
  "insights": ["insight1", "insight2", ...],
  "recommendations": ["rec1", "rec2", ...]
}`;

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1000,
      messages: [{ role: 'user', content: prompt }],
    });

    const content = response.content[0];
    if (!content || content.type !== 'text') {
      throw new Error('Unexpected response type');
    }

    const jsonMatch = content.text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('No JSON found in response');
    }

    const analysis = JSON.parse(jsonMatch[0]);

    const result: CampaignAnalysis = {
      summary: analysis.summary,
      kpis: {
        ctr,
        conversionRate,
        cpc,
        roas,
      },
      insights: analysis.insights,
      recommendations: analysis.recommendations,
    };

    return {
      success: true,
      data: { analysis: result },
      metadata: {
        tokensUsed: response.usage.input_tokens + response.usage.output_tokens,
        executionTimeMs: Date.now() - startTime,
        costIncurred: 0.001 * (response.usage.output_tokens / 1000),
      },
    };
  } catch (error) {
    console.error('[MarketingSkills] analyzeCampaignPerformance failed:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      metadata: { executionTimeMs: Date.now() - startTime },
    };
  }
}

// ============================================
// SKILL EXECUTOR MAP
// ============================================
export const marketingSkillExecutors: Record<string, (input: unknown) => Promise<SkillResult>> = {
  // Content Generation
  generate_ad_copy: (input) => generateAdCopy(input as GenerateAdCopyInput),
  generate_banner: (input) => generateBanner(input as GenerateBannerInput),
  generate_short_video: (input) => generateShortVideo(input as GenerateShortVideoInput),
  generate_social_content: (input) => generateSocialContent(input as GenerateSocialContentInput),
  generate_email_campaign: (input) => generateEmailCampaign(input as GenerateEmailCampaignInput),

  // Distribution Engine (Real Social Media Posting)
  schedule_social_post: (input) => scheduleSocialPost(input as ScheduleSocialPostInput),
  publish_social_post: (input) => publishSocialPost(input as PublishSocialPostInput),
  get_post_engagement: (input) => getPostEngagement(input as GetPostEngagementInput),
  get_distribution_metrics: (input) => getDistributionMetrics(input as GetDistributionMetricsInput),

  // Analytics
  analyze_campaign_performance: (input) => analyzeCampaignPerformance(input as AnalyzeCampaignInput),
};
