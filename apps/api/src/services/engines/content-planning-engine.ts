/**
 * Content Planning Engine
 *
 * Transforms researched topics into structured marketing plans:
 * - Campaign planning
 * - Content calendars
 * - Channel allocation
 * - Scheduling optimization
 *
 * Position in Architecture:
 * Content Research Engine → Content Planning Engine → Execution Layer
 */

import { db } from '../../lib/db';
import { eq, and } from 'drizzle-orm';
import { companies, brandIdentities, socialConnections } from '@1person/core/db';
import {
  contentResearchEngine,
  type ContentTopic,
  type ContentResearchReport,
} from './content-research-engine';
import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic();

// Content Planning Types
export interface ContentPlanItem {
  id: string;
  topicId: string;
  title: string;
  contentType: 'social_post' | 'blog' | 'video' | 'ad' | 'email' | 'infographic';
  channel: string;
  scheduledDate: Date;
  scheduledTime: string; // HH:MM format
  status: 'planned' | 'in_production' | 'ready' | 'published';
  priority: 'low' | 'medium' | 'high';
  assignedAgent?: string;
  contentBrief: {
    headline: string;
    body: string;
    hashtags: string[];
    callToAction: string;
    visualDirection: string;
  };
  assets: {
    requiresImage: boolean;
    requiresVideo: boolean;
    imagePrompt?: string;
    videoScript?: string;
  };
}

export interface ContentCalendar {
  companyId: string;
  weekStart: Date;
  weekEnd: Date;
  generatedAt: Date;
  items: ContentPlanItem[];
  summary: {
    totalPosts: number;
    byChannel: Record<string, number>;
    byContentType: Record<string, number>;
  };
}

export interface CampaignPlan {
  id: string;
  companyId: string;
  name: string;
  objective: string;
  startDate: Date;
  endDate: Date;
  channels: string[];
  targetAudience: string;
  contentItems: ContentPlanItem[];
  kpis: {
    targetReach: number;
    targetEngagement: number;
    targetConversions: number;
  };
  budget?: {
    total: number;
    perChannel: Record<string, number>;
  };
}

// Optimal posting times by platform
const OPTIMAL_POSTING_TIMES: Record<string, string[]> = {
  facebook: ['09:00', '13:00', '16:00'],
  instagram: ['11:00', '14:00', '19:00'],
  twitter: ['08:00', '12:00', '17:00'],
  linkedin: ['07:30', '12:00', '17:30'],
  youtube: ['14:00', '16:00'],
};

/**
 * Content Planning Engine Class
 */
export class ContentPlanningEngine {
  /**
   * Generate a weekly content calendar
   */
  async generateWeeklyCalendar(
    companyId: string,
    options?: {
      weekStart?: Date;
      postsPerDay?: number;
      channels?: string[];
      focusTopics?: string[];
    }
  ): Promise<ContentCalendar> {
    console.log(`[ContentPlanning] Generating weekly calendar for ${companyId}`);

    // Get content research
    const research = await contentResearchEngine.research(companyId);

    // Get available social connections
    const connections = await db.query.socialConnections.findMany({
      where: and(
        eq(socialConnections.companyId, companyId),
        eq(socialConnections.status, 'connected')
      ),
    });

    const availableChannels = options?.channels ||
      connections.map((c: { platform: string }) => c.platform) ||
      ['facebook', 'instagram'];

    // Determine week range
    const weekStart = options?.weekStart || this.getNextMonday();
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 6);

    const postsPerDay = options?.postsPerDay || 2;

    // Select topics to use
    const topicsToUse = options?.focusTopics?.length
      ? research.prioritizedTopics.filter((t) =>
          options.focusTopics!.some((f) => t.title.toLowerCase().includes(f.toLowerCase()))
        )
      : research.prioritizedTopics;

    // Generate content plan items
    const items: ContentPlanItem[] = [];
    let topicIndex = 0;

    for (let day = 0; day < 7; day++) {
      const currentDate = new Date(weekStart);
      currentDate.setDate(currentDate.getDate() + day);

      // Skip weekends for B2B (LinkedIn), include for B2C
      const isWeekend = currentDate.getDay() === 0 || currentDate.getDay() === 6;

      for (let postNum = 0; postNum < postsPerDay; postNum++) {
        if (topicIndex >= topicsToUse.length) {
          topicIndex = 0; // Cycle through topics
        }

        const topic = topicsToUse[topicIndex];
        if (!topic) continue;

        // Select channel (rotate through available channels)
        const channel = availableChannels[postNum % availableChannels.length] || 'facebook';

        // Skip LinkedIn on weekends
        if (isWeekend && channel === 'linkedin') continue;

        // Get optimal posting time
        const times = OPTIMAL_POSTING_TIMES[channel] || ['12:00'];
        const time = times[postNum % times.length] || '12:00';

        // Generate content brief for this item
        const brief = await this.generateContentBrief(companyId, topic, channel);

        const item: ContentPlanItem = {
          id: `plan-${currentDate.toISOString().split('T')[0]}-${postNum}`,
          topicId: topic.id,
          title: topic.title,
          contentType: topic.contentType,
          channel,
          scheduledDate: currentDate,
          scheduledTime: time,
          status: 'planned',
          priority: topic.priorityScore > 0.8 ? 'high' : topic.priorityScore > 0.5 ? 'medium' : 'low',
          contentBrief: brief,
          assets: {
            requiresImage: ['social_post', 'ad'].includes(topic.contentType),
            requiresVideo: topic.contentType === 'video',
            imagePrompt: brief.visualDirection,
          },
        };

        items.push(item);
        topicIndex++;
      }
    }

    // Generate summary
    const summary = {
      totalPosts: items.length,
      byChannel: items.reduce(
        (acc, item) => {
          acc[item.channel] = (acc[item.channel] || 0) + 1;
          return acc;
        },
        {} as Record<string, number>
      ),
      byContentType: items.reduce(
        (acc, item) => {
          acc[item.contentType] = (acc[item.contentType] || 0) + 1;
          return acc;
        },
        {} as Record<string, number>
      ),
    };

    const calendar: ContentCalendar = {
      companyId,
      weekStart,
      weekEnd,
      generatedAt: new Date(),
      items,
      summary,
    };

    console.log(`[ContentPlanning] Generated calendar with ${items.length} items`);

    return calendar;
  }

  /**
   * Generate content brief for a specific topic and channel
   */
  private async generateContentBrief(
    companyId: string,
    topic: ContentTopic,
    channel: string
  ): Promise<ContentPlanItem['contentBrief']> {
    const company = await db.query.companies.findFirst({
      where: eq(companies.id, companyId),
    });

    const brand = await db.query.brandIdentities.findFirst({
      where: eq(brandIdentities.companyId, companyId),
    });

    const voice = brand?.voice as { tone?: string[] } | undefined;
    const colors = brand?.colors as { primary?: string } | undefined;

    const channelGuidelines: Record<string, string> = {
      facebook: 'Engaging, conversational, 100-200 words, 3-5 hashtags',
      instagram: 'Visual-first, storytelling, emojis welcome, up to 30 hashtags',
      twitter: 'Concise, max 280 chars, 2-3 hashtags, punchy',
      linkedin: 'Professional, thought leadership, 150-300 words, 3-5 hashtags',
    };

    const prompt = `Create social media content for:

Topic: ${topic.title}
Description: ${topic.description}
Channel: ${channel}
Guidelines: ${channelGuidelines[channel] || 'Professional and engaging'}

Company: ${company?.name || 'N/A'}
Brand Tone: ${voice?.tone?.join(', ') || 'professional'}
Primary Color: ${colors?.primary || '#000000'}

Generate:
1. Headline/Hook (attention-grabbing first line)
2. Body (main content)
3. Hashtags (relevant to topic and industry)
4. Call to Action
5. Visual Direction (for image/video)

Return JSON:
{
  "headline": "Attention-grabbing first line",
  "body": "Main content body",
  "hashtags": ["hashtag1", "hashtag2"],
  "callToAction": "Clear CTA",
  "visualDirection": "Description for image/video creation"
}

Return ONLY valid JSON.`;

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1000,
      messages: [{ role: 'user', content: prompt }],
    });

    const content = response.content[0];
    if (!content || content.type !== 'text') {
      return {
        headline: topic.title,
        body: topic.description,
        hashtags: [],
        callToAction: 'Learn more',
        visualDirection: 'Professional marketing image',
      };
    }

    const jsonMatch = content.text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return {
        headline: topic.title,
        body: topic.description,
        hashtags: [],
        callToAction: 'Learn more',
        visualDirection: 'Professional marketing image',
      };
    }

    try {
      return JSON.parse(jsonMatch[0]);
    } catch {
      return {
        headline: topic.title,
        body: topic.description,
        hashtags: [],
        callToAction: 'Learn more',
        visualDirection: 'Professional marketing image',
      };
    }
  }

  /**
   * Create a campaign plan from a specific topic or objective
   */
  async createCampaignPlan(
    companyId: string,
    options: {
      name: string;
      objective: string;
      durationDays: number;
      channels: string[];
      targetAudience: string;
      budget?: number;
    }
  ): Promise<CampaignPlan> {
    console.log(`[ContentPlanning] Creating campaign plan: ${options.name}`);

    // Research topics for this campaign
    const topics = await contentResearchEngine.quickResearch(companyId, options.objective);

    const startDate = new Date();
    const endDate = new Date();
    endDate.setDate(endDate.getDate() + options.durationDays);

    // Generate content items for the campaign
    const contentItems: ContentPlanItem[] = [];

    // Distribute content across campaign duration
    const itemsPerDay = Math.ceil(topics.length / options.durationDays);
    let topicIndex = 0;

    for (let day = 0; day < options.durationDays && topicIndex < topics.length; day++) {
      const currentDate = new Date(startDate);
      currentDate.setDate(currentDate.getDate() + day);

      for (let i = 0; i < itemsPerDay && topicIndex < topics.length; i++) {
        const topic = topics[topicIndex];
        if (!topic) continue;

        const channel = options.channels[i % options.channels.length] || 'facebook';
        const times = OPTIMAL_POSTING_TIMES[channel] || ['12:00'];
        const time = times[0] || '12:00';

        const brief = await this.generateContentBrief(companyId, topic, channel);

        contentItems.push({
          id: `campaign-${day}-${i}`,
          topicId: topic.id,
          title: topic.title,
          contentType: topic.contentType,
          channel,
          scheduledDate: currentDate,
          scheduledTime: time,
          status: 'planned',
          priority: 'high',
          contentBrief: brief,
          assets: {
            requiresImage: true,
            requiresVideo: topic.contentType === 'video',
            imagePrompt: brief.visualDirection,
          },
        });

        topicIndex++;
      }
    }

    const plan: CampaignPlan = {
      id: `campaign-${Date.now()}`,
      companyId,
      name: options.name,
      objective: options.objective,
      startDate,
      endDate,
      channels: options.channels,
      targetAudience: options.targetAudience,
      contentItems,
      kpis: {
        targetReach: contentItems.length * 1000, // Estimate
        targetEngagement: contentItems.length * 50,
        targetConversions: Math.ceil(contentItems.length * 2),
      },
      budget: options.budget
        ? {
            total: options.budget,
            perChannel: options.channels.reduce(
              (acc, ch) => {
                acc[ch] = options.budget! / options.channels.length;
                return acc;
              },
              {} as Record<string, number>
            ),
          }
        : undefined,
    };

    console.log(`[ContentPlanning] Created campaign with ${contentItems.length} content items`);

    return plan;
  }

  /**
   * Get next Monday for week start
   */
  private getNextMonday(): Date {
    const today = new Date();
    const dayOfWeek = today.getDay();
    const daysUntilMonday = dayOfWeek === 0 ? 1 : 8 - dayOfWeek;
    const nextMonday = new Date(today);
    nextMonday.setDate(today.getDate() + daysUntilMonday);
    nextMonday.setHours(0, 0, 0, 0);
    return nextMonday;
  }

  /**
   * Convert a content plan item to execution task
   */
  toExecutionTask(item: ContentPlanItem): {
    type: string;
    platform: string;
    scheduledFor: Date;
    content: {
      text: string;
      hashtags: string[];
      callToAction: string;
    };
    assets: {
      requiresImage: boolean;
      imagePrompt?: string;
    };
  } {
    const scheduledFor = new Date(item.scheduledDate);
    const [hours, minutes] = item.scheduledTime.split(':').map(Number);
    scheduledFor.setHours(hours || 0, minutes || 0, 0, 0);

    return {
      type: item.contentType,
      platform: item.channel,
      scheduledFor,
      content: {
        text: `${item.contentBrief.headline}\n\n${item.contentBrief.body}`,
        hashtags: item.contentBrief.hashtags,
        callToAction: item.contentBrief.callToAction,
      },
      assets: {
        requiresImage: item.assets.requiresImage,
        imagePrompt: item.assets.imagePrompt,
      },
    };
  }
}

export const contentPlanningEngine = new ContentPlanningEngine();
