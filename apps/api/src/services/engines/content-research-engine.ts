/**
 * Content Research Engine
 *
 * Transforms market intelligence into actionable content topics:
 * - Convert pain points to content opportunities
 * - Generate topic ideas from trends
 * - Create content briefs
 * - Prioritize content based on impact
 *
 * Position in Architecture:
 * Market Intelligence Engine → Content Research Engine → Content Planning Engine
 */

import { db } from '../../lib/db';
import { eq } from 'drizzle-orm';
import { companies, brandIdentities } from '@1person/core/db';
import {
  marketIntelligenceEngine,
  type MarketIntelligenceReport,
  type AudiencePainPoint,
  type KeywordOpportunity,
} from './market-intelligence-engine';
import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic();

// Content Research Types
export interface ContentTopic {
  id: string;
  title: string;
  description: string;
  audience: string;
  painPoint?: string;
  keyword?: string;
  contentType: 'social_post' | 'blog' | 'video' | 'ad' | 'email' | 'infographic';
  channel: 'facebook' | 'instagram' | 'twitter' | 'linkedin' | 'blog' | 'email' | 'youtube';
  priorityScore: number; // 0-1
  estimatedImpact: 'low' | 'medium' | 'high';
  suggestedFormat: string;
  hooks: string[];
  callToAction: string;
}

export interface ContentBrief {
  topicId: string;
  title: string;
  objective: string;
  targetAudience: string;
  keyMessages: string[];
  tone: string;
  format: string;
  length: string;
  keywords: string[];
  competitorGap: string;
  uniqueAngle: string;
  outline: string[];
  resources: string[];
}

export interface ContentResearchReport {
  companyId: string;
  generatedAt: Date;
  marketIntelligence: MarketIntelligenceReport;
  topics: ContentTopic[];
  prioritizedTopics: ContentTopic[];
  contentGaps: string[];
  quickWins: ContentTopic[];
}

/**
 * Content Research Engine Class
 */
export class ContentResearchEngine {
  /**
   * Generate comprehensive content research from market intelligence
   */
  async research(companyId: string): Promise<ContentResearchReport> {
    console.log(`[ContentResearch] Starting research for company ${companyId}`);

    // Step 1: Get market intelligence
    const marketIntelligence = await marketIntelligenceEngine.analyzeMarket(companyId);

    // Step 2: Generate topics from pain points
    const painPointTopics = await this.generateTopicsFromPainPoints(
      companyId,
      marketIntelligence.painPoints
    );

    // Step 3: Generate topics from keywords
    const keywordTopics = await this.generateTopicsFromKeywords(
      companyId,
      marketIntelligence.keywords
    );

    // Step 4: Generate topics from trends
    const trendTopics = await this.generateTopicsFromTrends(
      companyId,
      marketIntelligence.trends.map((t) => t.title)
    );

    // Combine all topics
    const allTopics = [...painPointTopics, ...keywordTopics, ...trendTopics];

    // Step 5: Prioritize topics
    const prioritizedTopics = this.prioritizeTopics(allTopics);

    // Step 6: Identify quick wins (high impact, easy to execute)
    const quickWins = prioritizedTopics
      .filter((t) => t.priorityScore > 0.7 && t.contentType === 'social_post')
      .slice(0, 5);

    // Step 7: Identify content gaps
    const contentGaps = await this.identifyContentGaps(companyId, marketIntelligence);

    const report: ContentResearchReport = {
      companyId,
      generatedAt: new Date(),
      marketIntelligence,
      topics: allTopics,
      prioritizedTopics: prioritizedTopics.slice(0, 20),
      contentGaps,
      quickWins,
    };

    console.log(`[ContentResearch] Generated ${allTopics.length} topics, ${quickWins.length} quick wins`);

    return report;
  }

  /**
   * Generate content topics from audience pain points
   */
  async generateTopicsFromPainPoints(
    companyId: string,
    painPoints: AudiencePainPoint[]
  ): Promise<ContentTopic[]> {
    if (!painPoints.length) return [];

    const company = await db.query.companies.findFirst({
      where: eq(companies.id, companyId),
    });

    const prompt = `Generate content topics from these audience pain points:

${painPoints.map((p, i) => `${i + 1}. ${p.painPoint} (Severity: ${p.severity}, Segment: ${p.affectedSegment})`).join('\n')}

Company: ${company?.name || 'N/A'}
Industry: ${company?.industry || 'business'}

For each pain point, generate 2 content topic ideas.
Each topic should:
- Directly address the pain point
- Be actionable and valuable
- Specify the best channel and format

Return JSON array:
[
  {
    "id": "topic-1",
    "title": "Content title",
    "description": "What this content covers",
    "audience": "Target audience",
    "painPoint": "The pain point addressed",
    "contentType": "social_post",
    "channel": "facebook",
    "priorityScore": 0.85,
    "estimatedImpact": "high",
    "suggestedFormat": "carousel post with tips",
    "hooks": ["Hook 1", "Hook 2"],
    "callToAction": "Learn more / Sign up / etc"
  }
]

Return ONLY valid JSON array.`;

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 3000,
      messages: [{ role: 'user', content: prompt }],
    });

    const content = response.content[0];
    if (!content || content.type !== 'text') {
      return [];
    }

    const jsonMatch = content.text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      return [];
    }

    try {
      return JSON.parse(jsonMatch[0]);
    } catch {
      return [];
    }
  }

  /**
   * Generate content topics from keyword opportunities
   */
  async generateTopicsFromKeywords(
    companyId: string,
    keywords: KeywordOpportunity[]
  ): Promise<ContentTopic[]> {
    if (!keywords.length) return [];

    const company = await db.query.companies.findFirst({
      where: eq(companies.id, companyId),
    });

    const prompt = `Generate content topics from these keyword opportunities:

${keywords.map((k, i) => `${i + 1}. "${k.keyword}" (Volume: ${k.searchVolume}, Competition: ${k.competition})`).join('\n')}

Company: ${company?.name || 'N/A'}
Industry: ${company?.industry || 'business'}

For the top 6 keywords, generate content topic ideas.
Focus on:
- SEO-optimized content
- High-value educational content
- Content that ranks and converts

Return JSON array:
[
  {
    "id": "kw-topic-1",
    "title": "Content title targeting keyword",
    "description": "What this content covers",
    "audience": "Target audience",
    "keyword": "target keyword",
    "contentType": "blog",
    "channel": "blog",
    "priorityScore": 0.8,
    "estimatedImpact": "medium",
    "suggestedFormat": "how-to guide",
    "hooks": ["Hook 1", "Hook 2"],
    "callToAction": "Download guide / Contact us"
  }
]

Return ONLY valid JSON array.`;

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 3000,
      messages: [{ role: 'user', content: prompt }],
    });

    const content = response.content[0];
    if (!content || content.type !== 'text') {
      return [];
    }

    const jsonMatch = content.text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      return [];
    }

    try {
      return JSON.parse(jsonMatch[0]);
    } catch {
      return [];
    }
  }

  /**
   * Generate content topics from market trends
   */
  async generateTopicsFromTrends(
    companyId: string,
    trends: string[]
  ): Promise<ContentTopic[]> {
    if (!trends.length) return [];

    const company = await db.query.companies.findFirst({
      where: eq(companies.id, companyId),
    });

    const prompt = `Generate content topics from these market trends:

${trends.map((t, i) => `${i + 1}. ${t}`).join('\n')}

Company: ${company?.name || 'N/A'}
Industry: ${company?.industry || 'business'}

For each trend, generate 1-2 content ideas that:
- Position the company as a thought leader
- Help the audience understand and adapt to the trend
- Create urgency and relevance

Return JSON array:
[
  {
    "id": "trend-topic-1",
    "title": "Content title about trend",
    "description": "What this content covers",
    "audience": "Target audience",
    "contentType": "video",
    "channel": "linkedin",
    "priorityScore": 0.75,
    "estimatedImpact": "high",
    "suggestedFormat": "thought leadership video",
    "hooks": ["Hook 1", "Hook 2"],
    "callToAction": "Follow for more insights"
  }
]

Return ONLY valid JSON array.`;

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 2000,
      messages: [{ role: 'user', content: prompt }],
    });

    const content = response.content[0];
    if (!content || content.type !== 'text') {
      return [];
    }

    const jsonMatch = content.text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      return [];
    }

    try {
      return JSON.parse(jsonMatch[0]);
    } catch {
      return [];
    }
  }

  /**
   * Prioritize topics based on multiple factors
   */
  private prioritizeTopics(topics: ContentTopic[]): ContentTopic[] {
    return topics
      .map((topic) => {
        // Adjust priority based on impact and content type
        let adjustedScore = topic.priorityScore;

        // Boost high-impact topics
        if (topic.estimatedImpact === 'high') adjustedScore += 0.1;
        if (topic.estimatedImpact === 'low') adjustedScore -= 0.1;

        // Boost social content (faster to execute)
        if (topic.contentType === 'social_post') adjustedScore += 0.05;

        // Ensure score stays in 0-1 range
        adjustedScore = Math.max(0, Math.min(1, adjustedScore));

        return { ...topic, priorityScore: adjustedScore };
      })
      .sort((a, b) => b.priorityScore - a.priorityScore);
  }

  /**
   * Identify content gaps compared to competitors
   */
  private async identifyContentGaps(
    companyId: string,
    intelligence: MarketIntelligenceReport
  ): Promise<string[]> {
    const competitorStrategies = intelligence.competitors
      .map((c) => c.contentStrategy)
      .join('; ');

    const prompt = `Based on competitor content strategies:
${competitorStrategies}

And these market opportunities:
${intelligence.opportunities.join('; ')}

Identify 5-7 content gaps that this company should fill.
Focus on underserved topics that competitors aren't covering well.

Return JSON array of strings:
["Content gap 1", "Content gap 2", ...]

Return ONLY valid JSON array.`;

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1000,
      messages: [{ role: 'user', content: prompt }],
    });

    const content = response.content[0];
    if (!content || content.type !== 'text') {
      return [];
    }

    const jsonMatch = content.text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      return [];
    }

    try {
      return JSON.parse(jsonMatch[0]);
    } catch {
      return [];
    }
  }

  /**
   * Generate a detailed content brief for a topic
   */
  async generateContentBrief(
    companyId: string,
    topic: ContentTopic
  ): Promise<ContentBrief> {
    const company = await db.query.companies.findFirst({
      where: eq(companies.id, companyId),
    });

    const brand = await db.query.brandIdentities.findFirst({
      where: eq(brandIdentities.companyId, companyId),
    });

    const voice = brand?.voice as { tone?: string[] } | undefined;

    const prompt = `Create a detailed content brief for:

Topic: ${topic.title}
Description: ${topic.description}
Content Type: ${topic.contentType}
Channel: ${topic.channel}
Target Audience: ${topic.audience}

Company: ${company?.name || 'N/A'}
Brand Tone: ${voice?.tone?.join(', ') || 'professional'}

Generate a comprehensive content brief with:
- Clear objective
- Key messages (3-5)
- Recommended tone
- Content format and length
- Target keywords
- Unique angle
- Content outline (5-7 points)

Return JSON:
{
  "topicId": "${topic.id}",
  "title": "${topic.title}",
  "objective": "What this content aims to achieve",
  "targetAudience": "Specific audience description",
  "keyMessages": ["message1", "message2"],
  "tone": "professional and helpful",
  "format": "carousel / video / article",
  "length": "500 words / 60 seconds / 5 slides",
  "keywords": ["keyword1", "keyword2"],
  "competitorGap": "What competitors miss",
  "uniqueAngle": "Our unique perspective",
  "outline": ["Point 1", "Point 2"],
  "resources": ["Reference 1", "Data source"]
}

Return ONLY valid JSON.`;

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 2000,
      messages: [{ role: 'user', content: prompt }],
    });

    const content = response.content[0];
    if (!content || content.type !== 'text') {
      throw new Error('Failed to generate content brief');
    }

    const jsonMatch = content.text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('Invalid response format');
    }

    return JSON.parse(jsonMatch[0]);
  }

  /**
   * Quick research for a specific topic/keyword
   */
  async quickResearch(
    companyId: string,
    topic: string
  ): Promise<ContentTopic[]> {
    const company = await db.query.companies.findFirst({
      where: eq(companies.id, companyId),
    });

    const prompt = `Generate 5 content ideas for this topic:

Topic: ${topic}
Company: ${company?.name || 'N/A'}
Industry: ${company?.industry || 'business'}

Create diverse content ideas across different formats and channels.

Return JSON array:
[
  {
    "id": "quick-1",
    "title": "Content title",
    "description": "Brief description",
    "audience": "Target audience",
    "contentType": "social_post",
    "channel": "facebook",
    "priorityScore": 0.8,
    "estimatedImpact": "medium",
    "suggestedFormat": "image post",
    "hooks": ["Hook"],
    "callToAction": "Learn more"
  }
]

Return ONLY valid JSON array.`;

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 2000,
      messages: [{ role: 'user', content: prompt }],
    });

    const content = response.content[0];
    if (!content || content.type !== 'text') {
      return [];
    }

    const jsonMatch = content.text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      return [];
    }

    try {
      return JSON.parse(jsonMatch[0]);
    } catch {
      return [];
    }
  }
}

export const contentResearchEngine = new ContentResearchEngine();
