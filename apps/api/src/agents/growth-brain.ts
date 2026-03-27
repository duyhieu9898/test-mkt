/**
 * Growth Brain - The autonomous decision engine
 *
 * Reads:
 * - Page performance data (impressions, clicks, CTR, position)
 * - Memory (winning patterns, failed strategies)
 * - Current pages and tasks
 *
 * Outputs:
 * - Data-driven task list with reasoning
 *
 * Decision rules:
 * - position > 30 → create new content targeting keyword
 * - position 10-30 → optimize/expand existing content
 * - CTR < 1% with impressions → optimize title/meta description
 * - impressions high but clicks low → improve snippet
 * - position 5-15 → expand content depth
 * - no traffic → generate more pages
 * - winning keyword pattern → generate similar content
 * - failing pattern → avoid and try alternatives
 */

import { db } from '../lib/db';
import { eq, and } from 'drizzle-orm';
import { tasks, landingPages, agents, knowledgeBase } from '@1person/core/db';
import { queueTaskExecution } from '../lib/queue';
import type { PagePerformance } from '../services/performance-tracker';

interface GrowthDecision {
  action: string;
  taskType: string;
  reason: string;
  priority: 'critical' | 'high' | 'medium' | 'low';
  input: Record<string, unknown>;
}

interface MarketingOpportunity {
  goal: string;
  audience: string;
  reason: string;
  suggestedBudget?: number;
  channel?: string;
}

export class GrowthBrain {
  /**
   * Analyze company performance and generate data-driven tasks
   */
  async analyze(companyId: string, performances: PagePerformance[]): Promise<GrowthDecision[]> {
    const decisions: GrowthDecision[] = [];

    // Load memory: winning patterns and failed strategies
    const winningPatterns = await this.loadMemory(companyId, 'winning_patterns');
    const failedStrategies = await this.loadMemory(companyId, 'failed_strategies');

    // Analyze each page
    for (const page of performances) {
      const pageDecisions = this.analyzePagePerformance(page, winningPatterns, failedStrategies);
      decisions.push(...pageDecisions);
    }

    // Global decisions based on overall performance
    const globalDecisions = this.analyzeGlobalPerformance(performances, winningPatterns);
    decisions.push(...globalDecisions);

    // Deduplicate and prioritize
    const uniqueDecisions = this.deduplicateDecisions(decisions);

    // Detect complexity — trigger Intelligence Engine for strategic decisions
    const isComplex = this.isComplexScenario(performances, uniqueDecisions);

    if (isComplex) {
      console.log('[GrowthBrain] Complex scenario detected — calling Intelligence Engine');
      try {
        const { intelligenceEngine } = await import('../intelligence/engine');
        const goal = this.buildIntelligenceGoal(performances, uniqueDecisions);
        const plan = await intelligenceEngine.think(companyId, goal);
        console.log(`[GrowthBrain] Intelligence Engine returned ${plan.tasks.length} tasks with reflection`);
        // Intelligence Engine already enqueues tasks — no need to create from decisions
        return uniqueDecisions;
      } catch (err) {
        console.warn('[GrowthBrain] Intelligence Engine failed, falling back to rule-based:', err);
      }
    }

    // Simple scenario — create tasks from rule-based decisions
    await this.createTasksFromDecisions(companyId, uniqueDecisions);

    return uniqueDecisions;
  }

  /**
   * Per-page performance analysis with data-driven rules
   */
  private analyzePagePerformance(
    page: PagePerformance,
    winningPatterns: any[],
    failedStrategies: any[]
  ): GrowthDecision[] {
    const decisions: GrowthDecision[] = [];

    // Skip pages with no data yet
    if (page.avgPosition === 0 && page.impressions === 0) {
      return decisions;
    }

    // Rule 1: Low ranking (position > 30) → heavy optimization needed
    if (page.avgPosition > 30) {
      decisions.push({
        action: `Re-optimize content for "${page.keyword}"`,
        taskType: 'optimize_content',
        reason: `Ranking at position ${page.avgPosition} — needs major content improvement to reach page 1`,
        priority: 'high',
        input: { pageId: page.pageId, keyword: page.keyword, reason: 'low_ranking', currentPosition: page.avgPosition },
      });
    }

    // Rule 2: Mid ranking (position 10-30) → optimize to push to page 1
    if (page.avgPosition >= 10 && page.avgPosition <= 30) {
      decisions.push({
        action: `Expand and optimize "${page.keyword}" content`,
        taskType: 'optimize_content',
        reason: `Position ${page.avgPosition} — close to page 1. Expanding content depth can push ranking up`,
        priority: 'high',
        input: { pageId: page.pageId, keyword: page.keyword, reason: 'mid_ranking', currentPosition: page.avgPosition },
      });
    }

    // Rule 3: Good ranking but low CTR → optimize title/meta
    if (page.avgPosition < 15 && page.impressions > 50 && page.ctr < 1) {
      decisions.push({
        action: `Optimize title/meta for "${page.keyword}"`,
        taskType: 'optimize_page_seo',
        reason: `Ranking well (position ${page.avgPosition}) but CTR only ${page.ctr}% — title/meta not compelling enough`,
        priority: 'critical',
        input: { pageId: page.pageId, keyword: page.keyword, reason: 'low_ctr', currentCTR: page.ctr },
      });
    }

    // Rule 4: High impressions but low clicks → improve snippet
    if (page.impressions > 100 && page.clicks < 5) {
      decisions.push({
        action: `Improve search snippet for "${page.keyword}"`,
        taskType: 'optimize_page_seo',
        reason: `${page.impressions} impressions but only ${page.clicks} clicks — snippet not attracting clicks`,
        priority: 'high',
        input: { pageId: page.pageId, keyword: page.keyword, reason: 'low_snippet_performance' },
      });
    }

    // Rule 5: Ranking 5-15 → expand content to reach top 5
    if (page.avgPosition >= 5 && page.avgPosition <= 15) {
      decisions.push({
        action: `Deep-dive content expansion for "${page.keyword}"`,
        taskType: 'optimize_content',
        reason: `Position ${page.avgPosition} — adding more depth can push to top 5`,
        priority: 'medium',
        input: { pageId: page.pageId, keyword: page.keyword, reason: 'expand_depth' },
      });
    }

    return decisions;
  }

  /**
   * Global performance analysis
   */
  private analyzeGlobalPerformance(
    performances: PagePerformance[],
    winningPatterns: any[]
  ): GrowthDecision[] {
    const decisions: GrowthDecision[] = [];

    // Rule: No traffic at all → generate more content
    const pagesWithTraffic = performances.filter((p) => p.impressions > 0);
    if (pagesWithTraffic.length === 0 && performances.length > 0) {
      decisions.push({
        action: 'Generate new content pages to increase visibility',
        taskType: 'generate_plan',
        reason: 'No pages receiving impressions — need more content to build organic presence',
        priority: 'high',
        input: { reason: 'no_traffic' },
      });
    }

    // Rule: Pages with traffic but no campaigns → create marketing campaign
    const pagesWithGoodTraffic = performances.filter((p) => p.impressions > 200 && p.ctr > 1.5);
    if (pagesWithGoodTraffic.length > 0) {
      const topPage = pagesWithGoodTraffic[0]!;
      decisions.push({
        action: `Create paid campaign for high-performing keyword: "${topPage.keyword}"`,
        taskType: 'create_campaign',
        reason: `"${topPage.keyword}" has ${topPage.impressions} impressions and ${topPage.ctr}% CTR — paid ads can amplify this organic success`,
        priority: 'high',
        input: {
          keyword: topPage.keyword,
          pageId: topPage.pageId,
          reason: 'amplify_organic_success',
          opportunity: {
            goal: `Drive more traffic for "${topPage.keyword}"`,
            audience: `People searching for ${topPage.keyword}`,
            reason: `Organic performance strong (${topPage.impressions} impressions, ${topPage.ctr}% CTR) — paid ads can scale this`,
            suggestedBudget: 15,
            channel: 'google',
          } as MarketingOpportunity,
        },
      });
    }

    // Rule: No traffic at all → create awareness campaign
    if (pagesWithTraffic.length === 0 && performances.length >= 3) {
      decisions.push({
        action: 'Create awareness campaign — no organic traffic yet',
        taskType: 'create_campaign',
        reason: `${performances.length} pages published but no traffic — a social media campaign can kickstart visibility`,
        priority: 'high',
        input: {
          reason: 'no_traffic_kickstart',
          opportunity: {
            goal: 'Build brand awareness and drive initial traffic',
            audience: 'Target audience for the business',
            reason: `${performances.length} pages live but zero impressions — need paid/social boost to start`,
            suggestedBudget: 10,
            channel: 'meta',
          } as MarketingOpportunity,
        },
      });
    }

    // Rule: Winning patterns found → generate similar content
    if (winningPatterns.length > 0) {
      const topKeywords = winningPatterns.slice(0, 3);
      for (const pattern of topKeywords) {
        const keyword = pattern.keyword || pattern;
        // Check if we already have content for similar keywords
        const existing = performances.find((p) =>
          p.keyword.toLowerCase().includes(keyword.toString().toLowerCase().split(' ')[0])
        );
        if (!existing) {
          decisions.push({
            action: `Create content similar to winning keyword: "${keyword}"`,
            taskType: 'create_landing_page',
            reason: `"${keyword}" is a winning pattern — creating related content can capture similar traffic`,
            priority: 'medium',
            input: { keyword, reason: 'winning_pattern_expansion' },
          });
        }
      }
    }

    return decisions;
  }

  /**
   * Create tasks from decisions and enqueue them
   */
  private async createTasksFromDecisions(companyId: string, decisions: GrowthDecision[]): Promise<void> {
    const ceo = await db.query.agents.findFirst({
      where: eq(agents.companyId, companyId),
    });

    for (const decision of decisions.slice(0, 10)) { // Max 10 tasks per cycle
      // Check if similar task already pending
      const existing = await db.query.tasks.findFirst({
        where: and(
          eq(tasks.companyId, companyId),
          eq(tasks.type, decision.taskType),
          eq(tasks.status, 'pending')
        ),
      });
      if (existing) continue;

      try {
        // Handle create_campaign decisions via MarketingAutonomous
        if (decision.taskType === 'create_campaign' && (decision.input as any)?.opportunity) {
          try {
            const { marketingAutonomous } = await import('../services/marketing-autonomous');
            const opportunity = (decision.input as any).opportunity as MarketingOpportunity;
            const campaignId = await marketingAutonomous.createAutonomousCampaign(companyId, opportunity);
            console.log(`[GrowthBrain] Created autonomous campaign: ${campaignId}`);
            continue;
          } catch (campaignErr) {
            console.warn(`[GrowthBrain] Autonomous campaign creation failed, falling back to task:`, campaignErr);
          }
        }

        const [task] = await db.insert(tasks).values({
          companyId,
          title: decision.action,
          description: `${decision.reason}\n\nPriority: ${decision.priority}\nDecision by: Growth Brain`,
          type: decision.taskType,
          priority: decision.priority,
          status: 'pending',
          assignedAgentId: ceo?.id,
          input: decision.input as any,
        }).returning();

        // Enqueue to BullMQ
        if (!task) continue;
        try {
          await queueTaskExecution({
            taskId: task.id,
            agentId: ceo?.id || '',
            companyId,
            taskType: decision.taskType,
            title: decision.action,
            description: decision.reason,
            input: decision.input,
            priority: decision.priority,
          });
        } catch {}
      } catch (err) {
        console.warn(`[GrowthBrain] Failed to create task: ${decision.action}`, err);
      }
    }
  }

  private async loadMemory(companyId: string, category: string): Promise<any[]> {
    try {
      const entries = await db.query.knowledgeBase.findMany({
        where: and(eq(knowledgeBase.companyId, companyId), eq(knowledgeBase.category, category)),
        limit: 5,
      });
      return entries.flatMap((e) => {
        try { return JSON.parse(e.content); } catch { return []; }
      });
    } catch { return []; }
  }

  /**
   * Detect if the scenario is complex enough for Intelligence Engine
   * Complex = multiple issues + strategic thinking needed
   */
  private isComplexScenario(performances: PagePerformance[], decisions: GrowthDecision[]): boolean {
    // Complex if: many decisions (5+) OR critical priority OR no traffic at all
    const criticalCount = decisions.filter((d) => d.priority === 'critical' || d.priority === 'high').length;
    const noTraffic = performances.every((p) => p.impressions === 0);
    const manyIssues = decisions.length >= 5;

    return criticalCount >= 3 || noTraffic || manyIssues;
  }

  /**
   * Build a strategic goal for the Intelligence Engine
   */
  private buildIntelligenceGoal(performances: PagePerformance[], decisions: GrowthDecision[]): string {
    const issues = decisions.slice(0, 3).map((d) => d.reason).join('; ');
    const pageCount = performances.length;
    const avgPosition = performances.filter((p) => p.avgPosition > 0)
      .reduce((s, p) => s + p.avgPosition, 0) / Math.max(performances.filter((p) => p.avgPosition > 0).length, 1);

    return `Improve growth for ${pageCount} pages. Average ranking position: ${Math.round(avgPosition)}. Key issues: ${issues}`;
  }

  private deduplicateDecisions(decisions: GrowthDecision[]): GrowthDecision[] {
    const seen = new Set<string>();
    return decisions.filter((d) => {
      const key = `${d.taskType}:${(d.input as any)?.pageId || d.action}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }
}

export const growthBrain = new GrowthBrain();
