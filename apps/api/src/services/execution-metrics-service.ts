import { eq, and, gte, lte, sql, desc, count } from 'drizzle-orm';
import { db } from '../lib/db';
import { executionTasks, generatedAssets } from '@1person/core/db';

// Metric types
export interface ExecutionMetrics {
  totalTasks: number;
  completedTasks: number;
  failedTasks: number;
  pendingTasks: number;
  successRate: number;
  averageExecutionTime: number;
  totalCost: number;
  tasksByAgentType: Record<string, number>;
  tasksBySkill: Record<string, number>;
  tasksByStatus: Record<string, number>;
}

export interface TimeSeriesMetric {
  timestamp: string;
  value: number;
  label?: string;
}

export interface AgentPerformanceMetrics {
  agentType: string;
  totalTasks: number;
  completedTasks: number;
  failedTasks: number;
  successRate: number;
  averageExecutionTime: number;
  topSkills: { skill: string; count: number }[];
  costIncurred: number;
}

export interface CostBreakdown {
  total: number;
  byAgentType: Record<string, number>;
  bySkill: Record<string, number>;
  byTool: Record<string, number>;
}

export class ExecutionMetricsService {
  /**
   * Get overall execution metrics for a company
   */
  async getMetrics(
    companyId: string,
    options?: {
      startDate?: Date;
      endDate?: Date;
    }
  ): Promise<ExecutionMetrics> {
    const conditions = [eq(executionTasks.companyId, companyId)];

    if (options?.startDate) {
      conditions.push(gte(executionTasks.createdAt, options.startDate));
    }
    if (options?.endDate) {
      conditions.push(lte(executionTasks.createdAt, options.endDate));
    }

    const tasks = await db.query.executionTasks.findMany({
      where: and(...conditions),
    });

    const totalTasks = tasks.length;
    const completedTasks = tasks.filter((t) => t.status === 'completed').length;
    const failedTasks = tasks.filter((t) => t.status === 'failed').length;
    const pendingTasks = tasks.filter((t) => t.status === 'pending' || t.status === 'queued').length;
    const successRate = totalTasks > 0 ? (completedTasks / totalTasks) * 100 : 0;

    // Calculate average execution time for completed tasks
    const completedWithTime = tasks.filter(
      (t) => t.status === 'completed' && t.startedAt && t.completedAt
    );
    const averageExecutionTime =
      completedWithTime.length > 0
        ? completedWithTime.reduce((sum, t) => {
            const start = new Date(t.startedAt!).getTime();
            const end = new Date(t.completedAt!).getTime();
            return sum + (end - start);
          }, 0) / completedWithTime.length
        : 0;

    // Total cost
    const totalCost = tasks.reduce(
      (sum, t) => sum + (t.actualCost ? parseFloat(t.actualCost) : 0),
      0
    );

    // Group by agent type
    const tasksByAgentType: Record<string, number> = {};
    tasks.forEach((t) => {
      tasksByAgentType[t.agentType] = (tasksByAgentType[t.agentType] || 0) + 1;
    });

    // Group by skill
    const tasksBySkill: Record<string, number> = {};
    tasks.forEach((t) => {
      tasksBySkill[t.skillSlug] = (tasksBySkill[t.skillSlug] || 0) + 1;
    });

    // Group by status
    const tasksByStatus: Record<string, number> = {};
    tasks.forEach((t) => {
      tasksByStatus[t.status] = (tasksByStatus[t.status] || 0) + 1;
    });

    return {
      totalTasks,
      completedTasks,
      failedTasks,
      pendingTasks,
      successRate,
      averageExecutionTime,
      totalCost,
      tasksByAgentType,
      tasksBySkill,
      tasksByStatus,
    };
  }

  /**
   * Get time series data for tasks
   */
  async getTaskTimeSeries(
    companyId: string,
    options: {
      metric: 'count' | 'cost' | 'success_rate';
      granularity: 'hour' | 'day' | 'week';
      startDate: Date;
      endDate: Date;
    }
  ): Promise<TimeSeriesMetric[]> {
    const tasks = await db.query.executionTasks.findMany({
      where: and(
        eq(executionTasks.companyId, companyId),
        gte(executionTasks.createdAt, options.startDate),
        lte(executionTasks.createdAt, options.endDate)
      ),
      orderBy: desc(executionTasks.createdAt),
    });

    // Group by time bucket
    const buckets = new Map<string, { count: number; cost: number; completed: number }>();

    tasks.forEach((task) => {
      const date = new Date(task.createdAt);
      let bucketKey: string;

      if (options.granularity === 'hour') {
        bucketKey = `${date.toISOString().substring(0, 13)}:00:00Z`;
      } else if (options.granularity === 'day') {
        bucketKey = date.toISOString().substring(0, 10);
      } else {
        // Week - use start of week
        const dayOfWeek = date.getDay();
        const startOfWeek = new Date(date);
        startOfWeek.setDate(date.getDate() - dayOfWeek);
        bucketKey = startOfWeek.toISOString().substring(0, 10);
      }

      const current = buckets.get(bucketKey) || { count: 0, cost: 0, completed: 0 };
      current.count += 1;
      current.cost += task.actualCost ? parseFloat(task.actualCost) : 0;
      if (task.status === 'completed') {
        current.completed += 1;
      }
      buckets.set(bucketKey, current);
    });

    // Convert to time series
    const result: TimeSeriesMetric[] = [];
    buckets.forEach((data, timestamp) => {
      let value: number;
      switch (options.metric) {
        case 'count':
          value = data.count;
          break;
        case 'cost':
          value = data.cost;
          break;
        case 'success_rate':
          value = data.count > 0 ? (data.completed / data.count) * 100 : 0;
          break;
        default:
          value = data.count;
      }
      result.push({ timestamp, value });
    });

    // Sort by timestamp
    result.sort((a, b) => a.timestamp.localeCompare(b.timestamp));

    return result;
  }

  /**
   * Get agent performance metrics
   */
  async getAgentPerformance(
    companyId: string,
    options?: {
      agentType?: string;
      startDate?: Date;
      endDate?: Date;
    }
  ): Promise<AgentPerformanceMetrics[]> {
    const conditions = [eq(executionTasks.companyId, companyId)];

    if (options?.agentType) {
      conditions.push(eq(executionTasks.agentType, options.agentType as any));
    }
    if (options?.startDate) {
      conditions.push(gte(executionTasks.createdAt, options.startDate));
    }
    if (options?.endDate) {
      conditions.push(lte(executionTasks.createdAt, options.endDate));
    }

    const tasks = await db.query.executionTasks.findMany({
      where: and(...conditions),
    });

    // Group by agent type
    const agentGroups = new Map<
      string,
      {
        tasks: typeof tasks;
        skillCounts: Map<string, number>;
      }
    >();

    tasks.forEach((task) => {
      const group = agentGroups.get(task.agentType) || {
        tasks: [],
        skillCounts: new Map(),
      };
      group.tasks.push(task);
      const skillCount = group.skillCounts.get(task.skillSlug) || 0;
      group.skillCounts.set(task.skillSlug, skillCount + 1);
      agentGroups.set(task.agentType, group);
    });

    // Calculate metrics per agent type
    const results: AgentPerformanceMetrics[] = [];

    agentGroups.forEach((group, agentType) => {
      const totalTasks = group.tasks.length;
      const completedTasks = group.tasks.filter((t) => t.status === 'completed').length;
      const failedTasks = group.tasks.filter((t) => t.status === 'failed').length;
      const successRate = totalTasks > 0 ? (completedTasks / totalTasks) * 100 : 0;

      const completedWithTime = group.tasks.filter(
        (t) => t.status === 'completed' && t.startedAt && t.completedAt
      );
      const averageExecutionTime =
        completedWithTime.length > 0
          ? completedWithTime.reduce((sum, t) => {
              const start = new Date(t.startedAt!).getTime();
              const end = new Date(t.completedAt!).getTime();
              return sum + (end - start);
            }, 0) / completedWithTime.length
          : 0;

      const costIncurred = group.tasks.reduce(
        (sum, t) => sum + (t.actualCost ? parseFloat(t.actualCost) : 0),
        0
      );

      // Top skills
      const skillCounts = Array.from(group.skillCounts.entries())
        .map(([skill, count]) => ({ skill, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 5);

      results.push({
        agentType,
        totalTasks,
        completedTasks,
        failedTasks,
        successRate,
        averageExecutionTime,
        topSkills: skillCounts,
        costIncurred,
      });
    });

    return results;
  }

  /**
   * Get cost breakdown
   */
  async getCostBreakdown(
    companyId: string,
    options?: {
      startDate?: Date;
      endDate?: Date;
    }
  ): Promise<CostBreakdown> {
    const conditions = [eq(executionTasks.companyId, companyId)];

    if (options?.startDate) {
      conditions.push(gte(executionTasks.createdAt, options.startDate));
    }
    if (options?.endDate) {
      conditions.push(lte(executionTasks.createdAt, options.endDate));
    }

    const tasks = await db.query.executionTasks.findMany({
      where: and(...conditions),
    });

    let total = 0;
    const byAgentType: Record<string, number> = {};
    const bySkill: Record<string, number> = {};
    const byTool: Record<string, number> = {};

    tasks.forEach((task) => {
      const cost = task.actualCost ? parseFloat(task.actualCost) : 0;
      total += cost;

      byAgentType[task.agentType] = (byAgentType[task.agentType] || 0) + cost;
      bySkill[task.skillSlug] = (bySkill[task.skillSlug] || 0) + cost;

      // Extract tool from task type if available
      if (task.taskType) {
        byTool[task.taskType] = (byTool[task.taskType] || 0) + cost;
      }
    });

    return {
      total,
      byAgentType,
      bySkill,
      byTool,
    };
  }

  /**
   * Get recent errors for monitoring
   */
  async getRecentErrors(
    companyId: string,
    limit: number = 20
  ): Promise<
    {
      id: string;
      skillSlug: string;
      agentType: string;
      error: string;
      createdAt: Date;
    }[]
  > {
    const failedTasks = await db.query.executionTasks.findMany({
      where: and(
        eq(executionTasks.companyId, companyId),
        eq(executionTasks.status, 'failed')
      ),
      orderBy: desc(executionTasks.createdAt),
      limit,
    });

    return failedTasks.map((task) => ({
      id: task.id,
      skillSlug: task.skillSlug,
      agentType: task.agentType,
      error: task.lastError || 'Unknown error',
      createdAt: task.createdAt,
    }));
  }

  /**
   * Get asset generation stats
   */
  async getAssetGenerationStats(
    companyId: string,
    options?: {
      startDate?: Date;
      endDate?: Date;
    }
  ): Promise<{
    totalAssets: number;
    byType: Record<string, number>;
    totalCost: number;
    averageCostPerAsset: number;
  }> {
    const conditions = [eq(generatedAssets.companyId, companyId)];

    if (options?.startDate) {
      conditions.push(gte(generatedAssets.createdAt, options.startDate));
    }
    if (options?.endDate) {
      conditions.push(lte(generatedAssets.createdAt, options.endDate));
    }

    const assets = await db.query.generatedAssets.findMany({
      where: and(...conditions),
    });

    const totalAssets = assets.length;
    const byType: Record<string, number> = {};
    let totalCost = 0;

    assets.forEach((asset) => {
      byType[asset.assetType] = (byType[asset.assetType] || 0) + 1;
      if (asset.generationCost) {
        totalCost += parseFloat(asset.generationCost);
      }
    });

    const averageCostPerAsset = totalAssets > 0 ? totalCost / totalAssets : 0;

    return {
      totalAssets,
      byType,
      totalCost,
      averageCostPerAsset,
    };
  }

  /**
   * Get real-time execution status
   */
  async getRealTimeStatus(companyId: string): Promise<{
    activeJobs: number;
    queuedJobs: number;
    recentlyCompleted: number;
    recentlyFailed: number;
    lastExecutionTime: Date | null;
  }> {
    const now = new Date();
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);

    const tasks = await db.query.executionTasks.findMany({
      where: and(
        eq(executionTasks.companyId, companyId),
        gte(executionTasks.createdAt, oneHourAgo)
      ),
      orderBy: desc(executionTasks.createdAt),
    });

    const activeJobs = tasks.filter((t) => t.status === 'processing').length;
    const queuedJobs = tasks.filter((t) => t.status === 'queued' || t.status === 'pending').length;
    const recentlyCompleted = tasks.filter((t) => t.status === 'completed').length;
    const recentlyFailed = tasks.filter((t) => t.status === 'failed').length;

    const lastCompletedTask = tasks.find((t) => t.completedAt);

    return {
      activeJobs,
      queuedJobs,
      recentlyCompleted,
      recentlyFailed,
      lastExecutionTime: lastCompletedTask?.completedAt || null,
    };
  }
}

// Export singleton
export const executionMetrics = new ExecutionMetricsService();
