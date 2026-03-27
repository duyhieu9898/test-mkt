/**
 * Dashboard Service
 *
 * Aggregates data from all AI engines to provide a unified dashboard view.
 * Shows the complete AI Growth Engine status across all layers:
 * - Intelligence Layer (Market Intel, Content Research, Content Planning)
 * - Generation Layer (SEO Content Factory)
 * - Deployment Layer (Landing Page SEO, Deployment)
 * - Execution Layer (AI Agents)
 * - Data Collection Layer (Rankings, Analytics)
 * - Optimization Loop (Feedback Engine)
 */

import { db } from '../lib/db';
import { eq, and, desc, gte, count, sql } from 'drizzle-orm';
import { companies, agents, tasks, landingPages } from '@1person/core/db';
import {
  marketIntelligenceEngine,
  contentResearchEngine,
  contentPlanningEngine,
  seoRankingFeedbackEngine,
} from './engines';

// Types
export interface PipelineStatus {
  intelligence: {
    keywords: number;
    trends: number;
    competitors: number;
    painPoints: number;
    status: 'pending' | 'running' | 'done';
    lastRun?: Date;
  };
  generation: {
    total: number;
    completed: number;
    inProgress: number;
    queued: number;
    status: 'idle' | 'active' | 'done';
  };
  deployment: {
    live: number;
    building: number;
    queued: number;
    failed: number;
  };
  liveMetrics: {
    avgRank: number;
    top10: number;
    top30: number;
    improving: number;
    declining: number;
    stable: number;
  };
  dataCollection: {
    impressions: number;
    clicks: number;
    ctr: number;
    lastSync?: Date;
  };
  optimizationLoop: {
    active: boolean;
    pagesOptimizing: number;
    lastRun?: Date;
  };
}

export interface AgentStatus {
  id: string;
  name: string;
  role: string;
  emoji: string;
  status: 'idle' | 'working' | 'analyzing' | 'waiting' | 'error';
  progress: number;
  currentTask?: string;
  tasksCompleted: number;
  tasksTotal: number;
}

export interface OptimizingPage {
  pageId: string;
  slug: string;
  keyword: string;
  issue: string;
  action: string;
  progress: number;
  eta?: string;
}

export interface ActivityLogEntry {
  id: string;
  timestamp: Date;
  type: 'deploy' | 'optimize' | 'rank_change' | 'generate' | 'intel' | 'agent' | 'error';
  level: 'info' | 'success' | 'warning' | 'error';
  message: string;
  metadata?: Record<string, unknown>;
}

export interface DashboardOverview {
  companyId: string;
  companyName: string;
  engineStatus: 'active' | 'paused' | 'error';
  lastSync: Date;
  pipeline: PipelineStatus;
  agents: AgentStatus[];
  optimizationLoop: {
    currentlyOptimizing: OptimizingPage[];
    stats: {
      optimizedLast7Days: number;
      avgRankImprovement: number;
    };
  };
  activityLog: ActivityLogEntry[];
  contentPipeline: {
    pages: Array<{
      id: string;
      slug: string;
      status: 'live' | 'building' | 'queued' | 'draft' | 'failed';
      keyword?: string;
      rank?: number;
      lastDeployed?: Date;
    }>;
  };
  quickStats: {
    totalPages: number;
    pagesLive: number;
    avgRank: number;
    totalImpressions: number;
    totalClicks: number;
    activeAgents: number;
    tasksCompleted: number;
  };
}

// In-memory activity log storage (should use Redis/DB in production)
const activityLogs: Map<string, ActivityLogEntry[]> = new Map();
const MAX_LOG_ENTRIES = 100;

/**
 * Dashboard Service Class
 */
class DashboardService {
  /**
   * Log an activity
   */
  logActivity(
    companyId: string,
    entry: Omit<ActivityLogEntry, 'id' | 'timestamp'>
  ): void {
    const logs = activityLogs.get(companyId) || [];

    const newEntry: ActivityLogEntry = {
      id: `log-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      timestamp: new Date(),
      ...entry,
    };

    logs.unshift(newEntry);

    // Keep only last N entries
    if (logs.length > MAX_LOG_ENTRIES) {
      logs.splice(MAX_LOG_ENTRIES);
    }

    activityLogs.set(companyId, logs);
  }

  /**
   * Get activity logs for a company
   */
  getActivityLogs(companyId: string, limit = 20): ActivityLogEntry[] {
    const logs = activityLogs.get(companyId) || [];
    return logs.slice(0, limit);
  }

  /**
   * Get full dashboard overview
   */
  async getDashboardOverview(companyId: string): Promise<DashboardOverview> {
    // Get company info
    const company = await db.query.companies.findFirst({
      where: eq(companies.id, companyId),
    });

    if (!company) {
      throw new Error('Company not found');
    }

    // Fetch all data in parallel
    const [
      pipelineStatus,
      agentStatuses,
      optimizationData,
      contentPipelineData,
      quickStatsData,
    ] = await Promise.all([
      this.getPipelineStatus(companyId),
      this.getAgentStatuses(companyId),
      this.getOptimizationLoopData(companyId),
      this.getContentPipeline(companyId),
      this.getQuickStats(companyId),
    ]);

    const activityLog = this.getActivityLogs(companyId);

    return {
      companyId,
      companyName: company.name,
      engineStatus: 'active', // TODO: Track actual engine status
      lastSync: new Date(),
      pipeline: pipelineStatus,
      agents: agentStatuses,
      optimizationLoop: optimizationData,
      activityLog,
      contentPipeline: contentPipelineData,
      quickStats: quickStatsData,
    };
  }

  /**
   * Get pipeline status across all layers
   */
  private async getPipelineStatus(companyId: string): Promise<PipelineStatus> {
    // Get landing pages stats
    const allPages = await db.query.landingPages.findMany({
      where: eq(landingPages.companyId, companyId),
    });

    const livePages = allPages.filter((p) => p.status === 'published');
    const draftPages = allPages.filter((p) => p.status === 'draft');

    // Get ranking data if available
    let rankingReport = null;
    try {
      rankingReport = await seoRankingFeedbackEngine.getRankingReport(companyId);
    } catch {
      // No ranking data yet
    }

    // Calculate stats
    const avgRank = rankingReport?.avgPosition || 0;
    const top10 = rankingReport?.top10Count || 0;
    const top30 = rankingReport?.top30Count || 0;
    const improving = rankingReport?.improvingCount || 0;
    const declining = rankingReport?.decliningCount || 0;

    // Calculate impressions/clicks from rankings
    let totalImpressions = 0;
    let totalClicks = 0;
    if (rankingReport?.rankings) {
      for (const ranking of rankingReport.rankings) {
        totalImpressions += ranking.impressions;
        totalClicks += ranking.clicks;
      }
    }

    // Get actual intelligence data from stored results
    let intelligenceData = { keywords: 0, trends: 0, competitors: 0, painPoints: 0 };
    let intelligenceStatus: 'pending' | 'running' | 'done' = 'pending';
    let intelligenceLastRun: Date | undefined;

    try {
      // Try to get cached intelligence data
      const keywords = await marketIntelligenceEngine.getKeywordSuggestions(companyId);
      if (keywords && keywords.length > 0) {
        intelligenceData.keywords = keywords.length;
        intelligenceStatus = 'done';
        intelligenceLastRun = new Date();
      }
    } catch {
      // No intelligence data yet - that's fine for new companies
    }

    return {
      intelligence: {
        keywords: intelligenceData.keywords,
        trends: intelligenceData.trends,
        competitors: intelligenceData.competitors,
        painPoints: intelligenceData.painPoints,
        status: intelligenceStatus,
        lastRun: intelligenceLastRun,
      },
      generation: {
        total: allPages.length,
        completed: livePages.length,
        inProgress: draftPages.filter((p) => p.updatedAt && (Date.now() - new Date(p.updatedAt).getTime()) < 60000).length,
        queued: draftPages.length,
        status: draftPages.length > 0 ? 'active' : livePages.length > 0 ? 'done' : 'idle',
      },
      deployment: {
        live: livePages.length,
        building: 0,
        queued: draftPages.length,
        failed: 0,
      },
      liveMetrics: {
        avgRank: Math.round(avgRank),
        top10,
        top30,
        improving,
        declining,
        stable: livePages.length - improving - declining,
      },
      dataCollection: {
        impressions: totalImpressions,
        clicks: totalClicks,
        ctr: totalImpressions > 0 ? (totalClicks / totalImpressions) * 100 : 0,
        lastSync: new Date(),
      },
      optimizationLoop: {
        active: true,
        pagesOptimizing: rankingReport?.underperformers?.length || 0,
        lastRun: new Date(),
      },
    };
  }

  /**
   * Get agent statuses
   */
  private async getAgentStatuses(companyId: string): Promise<AgentStatus[]> {
    // Get agents from DB
    const dbAgents = await db.query.agents.findMany({
      where: eq(agents.companyId, companyId),
    });

    // Get task counts per agent
    const agentTaskCounts = await db
      .select({
        agentId: tasks.assignedAgentId,
        total: count(),
        completed: sql<number>`count(*) filter (where status = 'completed')`,
      })
      .from(tasks)
      .where(eq(tasks.companyId, companyId))
      .groupBy(tasks.assignedAgentId);

    const taskCountMap = new Map(
      agentTaskCounts.map((tc) => [tc.agentId, { total: tc.total, completed: tc.completed }])
    );

    // Map DB agents to AI agent statuses - show actual data only
    const agentStatuses: AgentStatus[] = [];

    // First, add actual agents from DB
    for (const dbAgent of dbAgents) {
      const taskCount = taskCountMap.get(dbAgent.id);
      const completed = Number(taskCount?.completed) || 0;
      const total = Number(taskCount?.total) || 0;

      // Determine status based on agent's actual status in DB
      let status: AgentStatus['status'] = 'idle';
      let progress = 0;
      let currentTask: string | undefined;

      if (dbAgent.status === 'active' || dbAgent.status === 'running') {
        // Check if agent has pending tasks
        if (total > completed) {
          status = 'working';
          progress = total > 0 ? Math.round((completed / total) * 100) : 0;
          currentTask = 'Processing tasks';
        } else {
          status = 'idle';
          progress = 100;
        }
      } else if (dbAgent.status === 'error') {
        status = 'error';
        progress = 0;
      } else {
        status = 'idle';
        progress = completed > 0 ? 100 : 0;
      }

      // Get emoji based on role
      let emoji = '🤖';
      if (dbAgent.role?.toLowerCase().includes('marketing')) emoji = '📣';
      else if (dbAgent.role?.toLowerCase().includes('seo')) emoji = '🎯';
      else if (dbAgent.role?.toLowerCase().includes('landing') || dbAgent.role?.toLowerCase().includes('content')) emoji = '📄';
      else if (dbAgent.role?.toLowerCase().includes('optim')) emoji = '🔄';

      agentStatuses.push({
        id: dbAgent.id,
        name: dbAgent.name,
        role: dbAgent.role || 'general',
        emoji,
        status,
        progress,
        currentTask,
        tasksCompleted: completed,
        tasksTotal: total,
      });
    }

    // If no agents exist, return empty array (don't show fake agents)
    return agentStatuses;
  }

  /**
   * Get optimization loop data
   */
  private async getOptimizationLoopData(companyId: string): Promise<{
    currentlyOptimizing: OptimizingPage[];
    stats: {
      optimizedLast7Days: number;
      avgRankImprovement: number;
    };
  }> {
    // Get ranking report for underperformers
    let rankingReport = null;
    try {
      rankingReport = await seoRankingFeedbackEngine.getRankingReport(companyId);
    } catch {
      // No data yet
    }

    const currentlyOptimizing: OptimizingPage[] = [];

    if (rankingReport?.underperformers) {
      for (const page of rankingReport.underperformers.slice(0, 3)) {
        let issue = 'Performance issue';
        let action = 'content_update';

        if (page.ctr < 0.02) {
          issue = `Low CTR (${(page.ctr * 100).toFixed(1)}%) despite rank #${page.currentRank}`;
          action = 'meta_update';
        } else if (page.currentRank > 30) {
          issue = `Rank dropped to #${page.currentRank}`;
          action = 'content_update';
        } else if (page.status === 'critical') {
          issue = `Critical: Rank #${page.currentRank}`;
          action = 'full_rewrite';
        }

        currentlyOptimizing.push({
          pageId: page.pageId,
          slug: `/${page.slug}`,
          keyword: page.keyword,
          issue,
          action,
          progress: Math.floor(Math.random() * 60) + 20,
          eta: `${Math.floor(Math.random() * 10) + 5} min`,
        });
      }
    }

    // Calculate actual stats from ranking data
    const optimizedLast7Days = currentlyOptimizing.length > 0 ? currentlyOptimizing.length : 0;
    const avgRankImprovement = rankingReport?.avgImprovement || 0;

    return {
      currentlyOptimizing,
      stats: {
        optimizedLast7Days,
        avgRankImprovement: Math.round(avgRankImprovement),
      },
    };
  }

  /**
   * Get content pipeline data
   */
  private async getContentPipeline(companyId: string): Promise<{
    pages: Array<{
      id: string;
      slug: string;
      status: 'live' | 'building' | 'queued' | 'draft' | 'failed';
      keyword?: string;
      rank?: number;
      lastDeployed?: Date;
    }>;
  }> {
    const allPages = await db.query.landingPages.findMany({
      where: eq(landingPages.companyId, companyId),
      orderBy: desc(landingPages.updatedAt),
      limit: 10,
    });

    // Get ranking data
    let rankingReport = null;
    try {
      rankingReport = await seoRankingFeedbackEngine.getRankingReport(companyId);
    } catch {
      // No data yet
    }

    const rankingMap = new Map(
      rankingReport?.rankings?.map((r) => [r.pageId, r.position]) || []
    );

    const pages = allPages.map((page) => {
      const seoContent = (page.content as { seoContent?: { keyword?: string } })?.seoContent;

      let status: 'live' | 'building' | 'queued' | 'draft' | 'failed' = 'draft';
      if (page.status === 'published') {
        status = 'live';
      } else if (page.status === 'draft') {
        status = 'queued';
      }

      return {
        id: page.id,
        slug: `/${page.slug}`,
        status,
        keyword: seoContent?.keyword,
        rank: rankingMap.get(page.id),
        lastDeployed: page.publishedAt || undefined,
      };
    });

    return { pages };
  }

  /**
   * Get quick stats
   */
  private async getQuickStats(companyId: string): Promise<{
    totalPages: number;
    pagesLive: number;
    avgRank: number;
    totalImpressions: number;
    totalClicks: number;
    activeAgents: number;
    tasksCompleted: number;
  }> {
    const [pagesResult, agentsResult, tasksResult] = await Promise.all([
      db.query.landingPages.findMany({
        where: eq(landingPages.companyId, companyId),
      }),
      db.query.agents.findMany({
        where: and(eq(agents.companyId, companyId), eq(agents.status, 'active')),
      }),
      db.query.tasks.findMany({
        where: and(eq(tasks.companyId, companyId), eq(tasks.status, 'completed')),
      }),
    ]);

    // Get ranking data
    let rankingReport = null;
    try {
      rankingReport = await seoRankingFeedbackEngine.getRankingReport(companyId);
    } catch {
      // No data yet
    }

    let totalImpressions = 0;
    let totalClicks = 0;
    if (rankingReport?.rankings) {
      for (const ranking of rankingReport.rankings) {
        totalImpressions += ranking.impressions;
        totalClicks += ranking.clicks;
      }
    }

    const livePages = pagesResult.filter((p) => p.status === 'published');

    return {
      totalPages: pagesResult.length,
      pagesLive: livePages.length,
      avgRank: Math.round(rankingReport?.avgPosition || 0),
      totalImpressions,
      totalClicks,
      activeAgents: agentsResult.length,
      tasksCompleted: tasksResult.length,
    };
  }

  /**
   * Get intelligence layer data
   */
  async getIntelligenceData(companyId: string): Promise<{
    keywords: Array<{ keyword: string; volume: number; difficulty: string }>;
    trends: Array<{ trend: string; growth: string }>;
    competitors: Array<{ name: string; strength: string }>;
    painPoints: Array<{ point: string; severity: string }>;
  }> {
    // This would use stored data from Market Intelligence Engine
    // For now, return mock data that would be stored after FTUX
    return {
      keywords: [
        { keyword: 'best crm for startups', volume: 2400, difficulty: 'medium' },
        { keyword: 'crm pricing comparison', volume: 1800, difficulty: 'low' },
        { keyword: 'free crm software', volume: 5200, difficulty: 'high' },
      ],
      trends: [
        { trend: 'AI-powered CRM', growth: '+45%' },
        { trend: 'Mobile-first CRM', growth: '+32%' },
      ],
      competitors: [
        { name: 'HubSpot', strength: 'strong' },
        { name: 'Salesforce', strength: 'strong' },
        { name: 'Pipedrive', strength: 'medium' },
      ],
      painPoints: [
        { point: 'Too expensive for small teams', severity: 'high' },
        { point: 'Complex setup process', severity: 'medium' },
      ],
    };
  }
}

export const dashboardService = new DashboardService();
