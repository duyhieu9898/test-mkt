/**
 * Marketing Distribution Workflow
 *
 * Orchestrates the content-to-post pipeline:
 * Content Research → Content Planning → Asset Generation → Post Creation → Distribution
 *
 * This workflow enables Marketing Agents to automatically generate and publish content.
 */

import { db } from '../../lib/db';
import { eq, and, desc } from 'drizzle-orm';
import { socialConnections, scheduledPosts, agents, tasks, type ScheduledPost } from '@1person/core/db';
import { distributionEngine } from '../distribution-engine';
import { brandIdentityService } from '../brand-identity-service';
import { assetGenerationService } from '../asset-generation-service';
import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic();

export interface ContentPlanInput {
  companyId: string;
  agentId: string;
  topic: string;
  platform: 'facebook' | 'instagram' | 'twitter' | 'linkedin';
  contentType: 'educational' | 'promotional' | 'engagement' | 'announcement';
  targetAudience?: string;
  scheduledTime?: Date; // If not provided, publish immediately
  generateImage?: boolean;
  campaignName?: string;
}

export interface ContentPlanResult {
  success: boolean;
  postId?: string;
  content?: {
    text: string;
    hashtags: string[];
    imageUrl?: string;
  };
  status: 'published' | 'scheduled' | 'failed';
  error?: string;
  platformPostId?: string;
  platformPostUrl?: string;
}

/**
 * Execute the full marketing distribution workflow
 *
 * 1. Research brand & audience context
 * 2. Generate post content
 * 3. Optionally generate image
 * 4. Create post via Distribution Engine
 * 5. Publish or schedule
 */
export async function executeMarketingDistributionWorkflow(
  input: ContentPlanInput
): Promise<ContentPlanResult> {
  console.log(`[MarketingWorkflow] Starting workflow for ${input.platform}:`, input.topic);

  try {
    // Step 1: Get brand context
    const brand = await brandIdentityService.getBrandIdentity(input.companyId);
    const voice = brand?.voice as { tone?: string[] } | undefined;
    const colors = brand?.colors as { primary?: string } | undefined;
    const brandContext = brand
      ? `Brand Voice: ${voice?.tone?.join(', ') || 'professional'}. Primary color: ${colors?.primary || '#000'}`
      : 'No specific brand guidelines.';

    // Step 2: Get available social connection
    const connection = await db.query.socialConnections.findFirst({
      where: and(
        eq(socialConnections.companyId, input.companyId),
        eq(socialConnections.platform, input.platform),
        eq(socialConnections.status, 'connected')
      ),
    });

    if (!connection) {
      return {
        success: false,
        status: 'failed',
        error: `No connected ${input.platform} account found. Please connect your ${input.platform} account first.`,
      };
    }

    // Step 3: Generate post content
    const platformGuides: Record<string, string> = {
      facebook:
        'Facebook: Engaging, conversational, 1-3 paragraphs, 3-5 hashtags, emojis welcome',
      instagram:
        'Instagram: Visual-first, storytelling, up to 30 hashtags, use line breaks and emojis',
      twitter: 'Twitter/X: Concise, max 280 chars, 2-3 hashtags, punchy and engaging',
      linkedin: 'LinkedIn: Professional, thought leadership, 2-3 paragraphs, 3-5 hashtags',
    };

    const prompt = `You are a social media marketing expert. Create a ${input.platform} post for the following:

Topic: ${input.topic}
Content Type: ${input.contentType}
${brandContext}
${input.targetAudience ? `Target Audience: ${input.targetAudience}` : ''}

Platform Guidelines: ${platformGuides[input.platform]}

Requirements:
- Create engaging content that drives ${input.contentType === 'promotional' ? 'conversions' : input.contentType === 'educational' ? 'shares' : 'engagement'}
- Include a clear call-to-action
- Be authentic to the brand voice
- Optimize for the ${input.platform} algorithm

Return JSON:
{
  "text": "The post content (without hashtags)",
  "hashtags": ["hashtag1", "hashtag2"],
  "callToAction": "The CTA",
  "suggestedImagePrompt": "A prompt for generating an accompanying image"
}

Return ONLY valid JSON.`;

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1500,
      messages: [{ role: 'user', content: prompt }],
    });

    const responseText = response.content[0];
    if (!responseText || responseText.type !== 'text') {
      throw new Error('Failed to generate content');
    }

    const jsonMatch = responseText.text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('Invalid content response format');
    }

    const generatedContent = JSON.parse(jsonMatch[0]) as {
      text: string;
      hashtags: string[];
      callToAction: string;
      suggestedImagePrompt: string;
    };

    console.log(`[MarketingWorkflow] Generated content for ${input.platform}`);

    // Step 4: Generate image if requested
    let imageUrl: string | undefined;
    if (input.generateImage) {
      try {
        const assets = await assetGenerationService.generateSocialContent(input.companyId, {
          platform: input.platform,
          contentType: 'post',
          topic: generatedContent.suggestedImagePrompt || input.topic,
          style: 'engaging',
          agentId: input.agentId,
        });

        if (assets && assets.length > 0 && assets[0]) {
          imageUrl = assets[0].publicUrl || assets[0].url;
          console.log(`[MarketingWorkflow] Generated image: ${imageUrl}`);
        }
      } catch (error) {
        console.warn('[MarketingWorkflow] Image generation failed, proceeding without image:', error);
      }
    }

    // Step 5: Create post via Distribution Engine
    const postContent = `${generatedContent.text}\n\n${generatedContent.callToAction}`;
    const scheduledFor = input.scheduledTime || new Date();

    const postId = await distributionEngine.createPost({
      companyId: input.companyId,
      connectionId: connection.id,
      platform: input.platform,
      contentText: postContent,
      hashtags: generatedContent.hashtags,
      mediaUrls: imageUrl ? [imageUrl] : undefined,
      scheduledFor,
      campaignName: input.campaignName,
      createdByAgentId: input.agentId,
    });

    console.log(`[MarketingWorkflow] Created post ${postId}`);

    // Step 6: Publish immediately if no scheduled time
    if (!input.scheduledTime) {
      const result = await distributionEngine.publishPost(postId);

      if (!result.success) {
        return {
          success: false,
          postId,
          content: {
            text: postContent,
            hashtags: generatedContent.hashtags,
            imageUrl,
          },
          status: 'failed',
          error: result.error,
        };
      }

      console.log(`[MarketingWorkflow] Published post to ${input.platform}: ${result.platformPostId}`);

      return {
        success: true,
        postId,
        content: {
          text: postContent,
          hashtags: generatedContent.hashtags,
          imageUrl,
        },
        status: 'published',
        platformPostId: result.platformPostId,
        platformPostUrl: result.platformPostUrl,
      };
    }

    // Scheduled post
    return {
      success: true,
      postId,
      content: {
        text: postContent,
        hashtags: generatedContent.hashtags,
        imageUrl,
      },
      status: 'scheduled',
    };
  } catch (error) {
    console.error('[MarketingWorkflow] Workflow failed:', error);
    return {
      success: false,
      status: 'failed',
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Create a content calendar with scheduled posts
 */
export async function createContentCalendar(
  companyId: string,
  agentId: string,
  options: {
    platform: 'facebook' | 'instagram' | 'twitter' | 'linkedin';
    postsPerWeek: number;
    topics: string[];
    startDate?: Date;
    campaignName?: string;
  }
): Promise<{
  success: boolean;
  scheduledPosts: Array<{ postId: string; scheduledFor: Date; topic: string }>;
  errors: string[];
}> {
  const results: Array<{ postId: string; scheduledFor: Date; topic: string }> = [];
  const errors: string[] = [];

  const startDate = options.startDate || new Date();
  const daysPerPost = 7 / options.postsPerWeek;

  for (let i = 0; i < options.topics.length; i++) {
    const topic = options.topics[i];
    if (!topic) continue; // Skip empty topics
    const scheduledTime = new Date(startDate.getTime() + i * daysPerPost * 24 * 60 * 60 * 1000);

    // Set to a reasonable posting time (10 AM)
    scheduledTime.setHours(10, 0, 0, 0);

    try {
      const result = await executeMarketingDistributionWorkflow({
        companyId,
        agentId,
        topic,
        platform: options.platform,
        contentType: 'engagement',
        scheduledTime,
        generateImage: true,
        campaignName: options.campaignName,
      });

      if (result.success && result.postId) {
        results.push({
          postId: result.postId,
          scheduledFor: scheduledTime,
          topic,
        });
      } else {
        errors.push(`Failed to create post for "${topic}": ${result.error}`);
      }
    } catch (error) {
      errors.push(`Error creating post for "${topic}": ${error}`);
    }
  }

  return {
    success: results.length > 0,
    scheduledPosts: results,
    errors,
  };
}

/**
 * Analyze post performance and generate recommendations
 */
export async function analyzeAndOptimize(
  companyId: string,
  days: number = 7
): Promise<{
  topPosts: Array<{ postId: string; platform: string; engagementRate: number }>;
  recommendations: string[];
  bestPostingTimes: Record<string, string>;
}> {
  // Get metrics summary
  const metrics = await distributionEngine.getMetricsSummary(companyId);

  // Get recent posts
  const recentPosts = await db.query.scheduledPosts.findMany({
    where: and(
      eq(scheduledPosts.companyId, companyId),
      eq(scheduledPosts.status, 'published')
    ),
    orderBy: desc(scheduledPosts.publishedAt),
    limit: 50,
  });

  // Simple analysis - in production this would be more sophisticated
  const topPosts = recentPosts
    .slice(0, 5)
    .map((p: ScheduledPost) => ({
      postId: p.id,
      platform: p.platform,
      engagementRate: Math.random() * 10, // Placeholder - would come from real metrics
    }));

  const recommendations = [
    `Based on ${metrics.totalPosts} posts, your average engagement is ${metrics.avgEngagementRate?.toFixed(2) || 'N/A'}%`,
    'Consider posting more visual content for higher engagement',
    'Experiment with different posting times to find your optimal schedule',
    'Engage with comments within the first hour for better reach',
  ];

  const bestPostingTimes: Record<string, string> = {
    facebook: '9:00 AM - 11:00 AM',
    instagram: '11:00 AM - 1:00 PM',
    twitter: '12:00 PM - 3:00 PM',
    linkedin: '7:00 AM - 9:00 AM',
  };

  return {
    topPosts,
    recommendations,
    bestPostingTimes,
  };
}

export const marketingDistributionWorkflow = {
  execute: executeMarketingDistributionWorkflow,
  createContentCalendar,
  analyzeAndOptimize,
};
