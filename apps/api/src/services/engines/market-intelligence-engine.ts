/**
 * Market Intelligence Engine
 *
 * Analyzes market conditions and provides actionable intelligence:
 * - Market trends detection
 * - Competitor analysis
 * - Keyword discovery
 * - Industry signals
 * - Audience pain points
 *
 * Position in Architecture:
 * Company Generator → Market Intelligence Engine → Content Research Engine
 */

import { db } from '../../lib/db';
import { eq, and, desc, gte } from 'drizzle-orm';
import { companies, brandIdentities } from '@1person/core/db';
import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic();

// Market Intelligence Types
export interface MarketSignal {
  type: 'trend' | 'competitor' | 'opportunity' | 'threat' | 'keyword';
  title: string;
  description: string;
  relevanceScore: number; // 0-1
  source: string;
  detectedAt: Date;
  metadata?: Record<string, unknown>;
}

export interface CompetitorInsight {
  name: string;
  domain?: string;
  strengths: string[];
  weaknesses: string[];
  contentStrategy: string;
  channels: string[];
  estimatedSize?: string;
}

export interface AudiencePainPoint {
  painPoint: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  affectedSegment: string;
  frequency: string;
  potentialSolution: string;
}

export interface KeywordOpportunity {
  keyword: string;
  searchVolume: 'low' | 'medium' | 'high';
  competition: 'low' | 'medium' | 'high';
  relevance: number;
  suggestedContent: string;
}

export interface MarketIntelligenceReport {
  companyId: string;
  industry: string;
  generatedAt: Date;
  trends: MarketSignal[];
  competitors: CompetitorInsight[];
  painPoints: AudiencePainPoint[];
  keywords: KeywordOpportunity[];
  opportunities: string[];
  threats: string[];
  recommendations: string[];
}

/**
 * Market Intelligence Engine Class
 */
export class MarketIntelligenceEngine {
  /**
   * Generate comprehensive market intelligence report
   */
  async analyzeMarket(companyId: string): Promise<MarketIntelligenceReport> {
    console.log(`[MarketIntelligence] Analyzing market for company ${companyId}`);

    // Get company and brand context
    const company = await db.query.companies.findFirst({
      where: eq(companies.id, companyId),
    });

    if (!company) {
      throw new Error('Company not found');
    }

    const brand = await db.query.brandIdentities.findFirst({
      where: eq(brandIdentities.companyId, companyId),
    });

    const industry = company.industry || 'general business';
    const targetAudience = (brand?.targetAudience as string) || 'small businesses';

    // Generate market intelligence using AI
    const prompt = `You are a market intelligence analyst. Analyze the market for:

Industry: ${industry}
Company: ${company.name}
Description: ${company.description || 'N/A'}
Target Audience: ${targetAudience}

Generate a comprehensive market intelligence report with:

1. MARKET TRENDS (3-5 current trends affecting this industry)
2. COMPETITOR INSIGHTS (3-4 typical competitor profiles in this space)
3. AUDIENCE PAIN POINTS (4-6 common problems the target audience faces)
4. KEYWORD OPPORTUNITIES (5-8 keywords for content marketing)
5. OPPORTUNITIES (3-4 market opportunities to capitalize on)
6. THREATS (2-3 potential market threats)
7. RECOMMENDATIONS (3-5 actionable recommendations)

Return JSON:
{
  "trends": [
    {"type": "trend", "title": "...", "description": "...", "relevanceScore": 0.8, "source": "industry analysis"}
  ],
  "competitors": [
    {"name": "...", "strengths": ["..."], "weaknesses": ["..."], "contentStrategy": "...", "channels": ["facebook", "instagram"]}
  ],
  "painPoints": [
    {"painPoint": "...", "severity": "high", "affectedSegment": "...", "frequency": "daily", "potentialSolution": "..."}
  ],
  "keywords": [
    {"keyword": "...", "searchVolume": "medium", "competition": "low", "relevance": 0.9, "suggestedContent": "..."}
  ],
  "opportunities": ["..."],
  "threats": ["..."],
  "recommendations": ["..."]
}

Return ONLY valid JSON.`;

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4000,
      messages: [{ role: 'user', content: prompt }],
    });

    const content = response.content[0];
    if (!content || content.type !== 'text') {
      throw new Error('Failed to generate market intelligence');
    }

    const jsonMatch = content.text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('Invalid response format');
    }

    const data = JSON.parse(jsonMatch[0]);

    // Add timestamps to trends
    const trends = (data.trends || []).map((t: Partial<MarketSignal>) => ({
      ...t,
      detectedAt: new Date(),
    }));

    const report: MarketIntelligenceReport = {
      companyId,
      industry,
      generatedAt: new Date(),
      trends,
      competitors: data.competitors || [],
      painPoints: data.painPoints || [],
      keywords: data.keywords || [],
      opportunities: data.opportunities || [],
      threats: data.threats || [],
      recommendations: data.recommendations || [],
    };

    console.log(`[MarketIntelligence] Generated report with ${trends.length} trends, ${report.painPoints.length} pain points`);

    return report;
  }

  /**
   * Analyze specific competitors
   */
  async analyzeCompetitors(
    companyId: string,
    competitorNames?: string[]
  ): Promise<CompetitorInsight[]> {
    const company = await db.query.companies.findFirst({
      where: eq(companies.id, companyId),
    });

    if (!company) {
      throw new Error('Company not found');
    }

    const competitorList = competitorNames?.length
      ? competitorNames.join(', ')
      : 'typical competitors in this industry';

    const prompt = `Analyze competitors for a ${company.industry || 'business'} company.

Company: ${company.name}
Competitors to analyze: ${competitorList}

For each competitor, provide:
- Name
- Key strengths (2-3)
- Key weaknesses (2-3)
- Content/marketing strategy summary
- Main marketing channels

Return JSON array:
[
  {
    "name": "Competitor Name",
    "strengths": ["strength1", "strength2"],
    "weaknesses": ["weakness1", "weakness2"],
    "contentStrategy": "Focus on educational content...",
    "channels": ["facebook", "linkedin", "blog"]
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
      throw new Error('Failed to analyze competitors');
    }

    const jsonMatch = content.text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      throw new Error('Invalid response format');
    }

    return JSON.parse(jsonMatch[0]);
  }

  /**
   * Discover trending topics in industry
   */
  async discoverTrends(companyId: string): Promise<MarketSignal[]> {
    const company = await db.query.companies.findFirst({
      where: eq(companies.id, companyId),
    });

    if (!company) {
      throw new Error('Company not found');
    }

    const prompt = `Identify current market trends for the ${company.industry || 'business'} industry.

Company focus: ${company.name} - ${company.description || 'N/A'}

Generate 5-7 current market trends including:
- Technology trends
- Consumer behavior changes
- Industry-specific developments
- Marketing channel trends
- Economic factors

Return JSON array:
[
  {
    "type": "trend",
    "title": "Trend title",
    "description": "Detailed description of the trend and its impact",
    "relevanceScore": 0.85,
    "source": "industry analysis"
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
      throw new Error('Failed to discover trends');
    }

    const jsonMatch = content.text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      throw new Error('Invalid response format');
    }

    const trends = JSON.parse(jsonMatch[0]);
    return trends.map((t: Partial<MarketSignal>) => ({
      ...t,
      detectedAt: new Date(),
    }));
  }

  /**
   * Identify audience pain points
   */
  async identifyPainPoints(companyId: string): Promise<AudiencePainPoint[]> {
    const company = await db.query.companies.findFirst({
      where: eq(companies.id, companyId),
    });

    if (!company) {
      throw new Error('Company not found');
    }

    const brand = await db.query.brandIdentities.findFirst({
      where: eq(brandIdentities.companyId, companyId),
    });

    const prompt = `Identify customer pain points for:

Industry: ${company.industry || 'business'}
Target Audience: ${(brand?.targetAudience as string) || 'small businesses'}
Company Focus: ${company.description || 'general services'}

Generate 5-7 pain points including:
- The specific pain point
- Severity level (low/medium/high/critical)
- Which customer segment is most affected
- How often they encounter this issue
- Potential solution the company could offer

Return JSON array:
[
  {
    "painPoint": "Description of the pain point",
    "severity": "high",
    "affectedSegment": "Small business owners",
    "frequency": "daily",
    "potentialSolution": "How to address this pain point"
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
      throw new Error('Failed to identify pain points');
    }

    const jsonMatch = content.text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      throw new Error('Invalid response format');
    }

    return JSON.parse(jsonMatch[0]);
  }

  /**
   * Discover keyword opportunities
   */
  async discoverKeywords(companyId: string): Promise<KeywordOpportunity[]> {
    const company = await db.query.companies.findFirst({
      where: eq(companies.id, companyId),
    });

    if (!company) {
      throw new Error('Company not found');
    }

    const prompt = `Generate keyword opportunities for:

Industry: ${company.industry || 'business'}
Company: ${company.name}
Focus: ${company.description || 'general services'}

Generate 8-12 keyword opportunities for content marketing:
- Mix of short-tail and long-tail keywords
- Include search volume estimate
- Include competition level
- Suggest content type for each keyword

Return JSON array:
[
  {
    "keyword": "keyword phrase",
    "searchVolume": "medium",
    "competition": "low",
    "relevance": 0.9,
    "suggestedContent": "blog post / social content / video"
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
      throw new Error('Failed to discover keywords');
    }

    const jsonMatch = content.text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      throw new Error('Invalid response format');
    }

    return JSON.parse(jsonMatch[0]);
  }
}

export const marketIntelligenceEngine = new MarketIntelligenceEngine();
