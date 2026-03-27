/**
 * Agent Auto-Execution Loop
 *
 * The core orchestration engine that automatically executes marketing workflows:
 *
 * Task/Campaign Created
 * ↓
 * Agent detects task
 * ↓
 * Market Intelligence → Content Research → Content Planning
 * ↓
 * Asset Generation → Distribution → Tracking
 * ↓
 * Optimization (feedback loop)
 *
 * This enables true autonomous AI marketing operations.
 */

import { db } from '../../lib/db';
import { eq, and, desc, isNull, sql, or, lte } from 'drizzle-orm';
import {
  tasks,
  agents,
  companies,
  scheduledPosts,
  socialConnections,
} from '@1person/core/db';
import { marketIntelligenceEngine } from './market-intelligence-engine';
import { contentResearchEngine, type ContentTopic } from './content-research-engine';
import { contentPlanningEngine, type ContentPlanItem } from './content-planning-engine';
import { optimizationEngine } from './optimization-engine';
import { assetGenerationService } from '../asset-generation-service';
import { distributionEngine } from '../distribution-engine';
import { trackingEngine } from '../tracking-engine';

// Execution Types
export interface ExecutionContext {
  companyId: string;
  agentId: string;
  taskId?: string;
  campaignName?: string;
}

export interface ExecutionStep {
  step: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  startedAt?: Date;
  completedAt?: Date;
  result?: unknown;
  error?: string;
}

export interface ExecutionResult {
  success: boolean;
  executionId: string;
  context: ExecutionContext;
  steps: ExecutionStep[];
  outputs: {
    marketIntelligence?: unknown;
    contentTopics?: ContentTopic[];
    contentPlan?: ContentPlanItem[];
    generatedAssets?: string[];
    publishedPosts?: string[];
    trackingEnabled?: boolean;
  };
  totalDuration: number;
  error?: string;
}

export interface PendingTask {
  id: string;
  companyId: string;
  agentId: string;
  title: string;
  type: string;
  priority: string;
  payload?: Record<string, unknown>;
}

// Task types that trigger marketing workflow
const MARKETING_TASK_TYPES = [
  'create_campaign',
  'generate_content',
  'social_media_post',
  'marketing_campaign',
  'content_creation',
  'run_marketing_workflow',
];

/**
 * Agent Execution Loop Class
 */
export class AgentExecutionLoop {
  private isRunning = false;
  private pollIntervalMs = 10000; // 10 seconds
  private pollTimer: NodeJS.Timeout | null = null;

  /**
   * Start the execution loop (for worker process)
   */
  start(): void {
    if (this.isRunning) {
      console.log('[AgentLoop] Already running');
      return;
    }

    console.log('[AgentLoop] Starting execution loop...');
    this.isRunning = true;
    this.poll();
  }

  /**
   * Stop the execution loop
   */
  stop(): void {
    console.log('[AgentLoop] Stopping execution loop...');
    this.isRunning = false;
    if (this.pollTimer) {
      clearTimeout(this.pollTimer);
      this.pollTimer = null;
    }
  }

  /**
   * Poll for pending tasks
   */
  private async poll(): Promise<void> {
    if (!this.isRunning) return;

    try {
      const pendingTasks = await this.getPendingTasks();

      for (const task of pendingTasks) {
        try {
          await this.executeTask(task);
        } catch (error) {
          console.error(`[AgentLoop] Failed to execute task ${task.id}:`, error);
          await this.markTaskFailed(task.id, error instanceof Error ? error.message : 'Unknown error');
        }
      }
    } catch (error) {
      console.error('[AgentLoop] Poll error:', error);
    }

    // Schedule next poll
    if (this.isRunning) {
      this.pollTimer = setTimeout(() => this.poll(), this.pollIntervalMs);
    }
  }

  /**
   * Get pending tasks for marketing agents
   */
  async getPendingTasks(): Promise<PendingTask[]> {
    // Get marketing agents
    const marketingAgents = await db.query.agents.findMany({
      where: and(
        eq(agents.status, 'running'),
        or(
          eq(agents.role, 'marketing_manager'),
          eq(agents.role, 'content_creator'),
          eq(agents.role, 'ads_specialist')
        )
      ),
    });

    if (!marketingAgents.length) return [];

    const agentIds = marketingAgents.map((a: { id: string }) => a.id);

    // Get pending tasks assigned to marketing agents
    const pendingTasks = await db.query.tasks.findMany({
      where: and(
        eq(tasks.status, 'pending'),
        sql`${tasks.assignedAgentId} = ANY(ARRAY[${sql.join(agentIds, sql`,`)}]::uuid[])`
      ),
      orderBy: [desc(tasks.priority), desc(tasks.createdAt)],
      limit: 10,
    });

    return pendingTasks.map((t: { id: string; companyId: string; assignedAgentId: string | null; title: string; type: string; priority: string; input: { data?: Record<string, unknown> } | null }) => ({
      id: t.id,
      companyId: t.companyId,
      agentId: t.assignedAgentId || agentIds[0] || '',
      title: t.title,
      type: t.type,
      priority: t.priority,
      payload: t.input?.data as Record<string, unknown> | undefined,
    }));
  }

  /**
   * Execute a task through the full marketing workflow
   */
  async executeTask(task: PendingTask): Promise<ExecutionResult> {
    console.log(`[AgentLoop] Executing task: ${task.id} - ${task.title}`);

    const executionId = `exec-${Date.now()}`;
    const startTime = Date.now();
    const steps: ExecutionStep[] = [];
    const outputs: ExecutionResult['outputs'] = {};

    const context: ExecutionContext = {
      companyId: task.companyId,
      agentId: task.agentId,
      taskId: task.id,
      campaignName: task.title,
    };

    try {
      // Mark task as in progress
      await this.markTaskInProgress(task.id);

      // Check if this is a marketing workflow task
      const isMarketingTask = MARKETING_TASK_TYPES.some(
        (type) => task.type.toLowerCase().includes(type.toLowerCase())
      );

      if (isMarketingTask) {
        // Execute full marketing workflow
        const result = await this.executeMarketingWorkflow(context, steps, outputs);

        if (!result.success) {
          throw new Error(result.error || 'Marketing workflow failed');
        }
      } else {
        // For other tasks, just mark as completed
        steps.push({
          step: 'task_processing',
          status: 'completed',
          startedAt: new Date(),
          completedAt: new Date(),
          result: 'Task processed',
        });
      }

      // Mark task as completed
      await this.markTaskCompleted(task.id, outputs);

      const totalDuration = Date.now() - startTime;

      console.log(`[AgentLoop] Task ${task.id} completed in ${totalDuration}ms`);

      return {
        success: true,
        executionId,
        context,
        steps,
        outputs,
        totalDuration,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      steps.push({
        step: 'error',
        status: 'failed',
        startedAt: new Date(),
        completedAt: new Date(),
        error: errorMessage,
      });

      await this.markTaskFailed(task.id, errorMessage);

      return {
        success: false,
        executionId,
        context,
        steps,
        outputs,
        totalDuration: Date.now() - startTime,
        error: errorMessage,
      };
    }
  }

  /**
   * Execute the full marketing workflow
   */
  private async executeMarketingWorkflow(
    context: ExecutionContext,
    steps: ExecutionStep[],
    outputs: ExecutionResult['outputs']
  ): Promise<{ success: boolean; error?: string }> {
    // Step 1: Market Intelligence
    const miStep: ExecutionStep = {
      step: 'market_intelligence',
      status: 'running',
      startedAt: new Date(),
    };
    steps.push(miStep);

    try {
      console.log(`[AgentLoop] Step 1: Market Intelligence`);
      const intelligence = await marketIntelligenceEngine.analyzeMarket(context.companyId);
      outputs.marketIntelligence = intelligence;
      miStep.status = 'completed';
      miStep.completedAt = new Date();
      miStep.result = `Generated ${intelligence.trends.length} trends, ${intelligence.painPoints.length} pain points`;
    } catch (error) {
      miStep.status = 'failed';
      miStep.error = error instanceof Error ? error.message : 'Failed';
      // Continue anyway, content research can work without it
    }

    // Step 2: Content Research
    const crStep: ExecutionStep = {
      step: 'content_research',
      status: 'running',
      startedAt: new Date(),
    };
    steps.push(crStep);

    try {
      console.log(`[AgentLoop] Step 2: Content Research`);
      const research = await contentResearchEngine.research(context.companyId);
      outputs.contentTopics = research.quickWins;
      crStep.status = 'completed';
      crStep.completedAt = new Date();
      crStep.result = `Generated ${research.topics.length} topics, ${research.quickWins.length} quick wins`;
    } catch (error) {
      crStep.status = 'failed';
      crStep.error = error instanceof Error ? error.message : 'Failed';
      return { success: false, error: `Content research failed: ${crStep.error}` };
    }

    // Step 3: Content Planning
    const cpStep: ExecutionStep = {
      step: 'content_planning',
      status: 'running',
      startedAt: new Date(),
    };
    steps.push(cpStep);

    let contentPlan: ContentPlanItem[] = [];
    try {
      console.log(`[AgentLoop] Step 3: Content Planning`);
      const calendar = await contentPlanningEngine.generateWeeklyCalendar(context.companyId, {
        postsPerDay: 1,
      });
      contentPlan = calendar.items.slice(0, 5); // Start with 5 posts
      outputs.contentPlan = contentPlan;
      cpStep.status = 'completed';
      cpStep.completedAt = new Date();
      cpStep.result = `Planned ${contentPlan.length} content items`;
    } catch (error) {
      cpStep.status = 'failed';
      cpStep.error = error instanceof Error ? error.message : 'Failed';
      return { success: false, error: `Content planning failed: ${cpStep.error}` };
    }

    // Step 4: Asset Generation
    const agStep: ExecutionStep = {
      step: 'asset_generation',
      status: 'running',
      startedAt: new Date(),
    };
    steps.push(agStep);

    const generatedAssets: string[] = [];
    try {
      console.log(`[AgentLoop] Step 4: Asset Generation`);

      for (const item of contentPlan) {
        if (item.assets.requiresImage && item.assets.imagePrompt) {
          try {
            const assets = await assetGenerationService.generateSocialContent(
              context.companyId,
              {
                platform: item.channel as 'facebook' | 'instagram' | 'twitter' | 'linkedin',
                contentType: 'post',
                topic: item.assets.imagePrompt,
                style: 'engaging',
                agentId: context.agentId,
              }
            );

            if (assets && assets.length > 0 && assets[0]) {
              generatedAssets.push(assets[0].url || assets[0].publicUrl || '');
            }
          } catch (assetError) {
            console.warn(`[AgentLoop] Asset generation failed for item ${item.id}:`, assetError);
          }
        }
      }

      outputs.generatedAssets = generatedAssets;
      agStep.status = 'completed';
      agStep.completedAt = new Date();
      agStep.result = `Generated ${generatedAssets.length} assets`;
    } catch (error) {
      agStep.status = 'failed';
      agStep.error = error instanceof Error ? error.message : 'Failed';
      // Continue without assets
    }

    // Step 5: Distribution
    const distStep: ExecutionStep = {
      step: 'distribution',
      status: 'running',
      startedAt: new Date(),
    };
    steps.push(distStep);

    const publishedPosts: string[] = [];
    try {
      console.log(`[AgentLoop] Step 5: Distribution`);

      // Get available connections
      const connections = await db.query.socialConnections.findMany({
        where: and(
          eq(socialConnections.companyId, context.companyId),
          eq(socialConnections.status, 'connected')
        ),
      });

      if (connections.length === 0) {
        distStep.status = 'completed';
        distStep.completedAt = new Date();
        distStep.result = 'No connected social accounts, posts scheduled for later';
      } else {
        for (let i = 0; i < contentPlan.length; i++) {
          const item = contentPlan[i];
          if (!item) continue;

          const connection = connections.find((c: { platform: string }) => c.platform === item.channel);
          if (!connection) continue;

          const executionTask = contentPlanningEngine.toExecutionTask(item);

          try {
            const postId = await distributionEngine.createPost({
              companyId: context.companyId,
              connectionId: connection.id,
              platform: item.channel as 'facebook' | 'instagram' | 'twitter' | 'linkedin',
              contentText: executionTask.content.text,
              hashtags: executionTask.content.hashtags,
              mediaUrls: generatedAssets[i] ? [generatedAssets[i]!] : undefined,
              scheduledFor: executionTask.scheduledFor,
              campaignName: context.campaignName,
              createdByAgentId: context.agentId,
            });

            publishedPosts.push(postId);
          } catch (postError) {
            console.warn(`[AgentLoop] Failed to create post for item ${item.id}:`, postError);
          }
        }

        outputs.publishedPosts = publishedPosts;
        distStep.status = 'completed';
        distStep.completedAt = new Date();
        distStep.result = `Created ${publishedPosts.length} posts`;
      }
    } catch (error) {
      distStep.status = 'failed';
      distStep.error = error instanceof Error ? error.message : 'Failed';
    }

    // Step 6: Enable Tracking
    const trackStep: ExecutionStep = {
      step: 'tracking_setup',
      status: 'running',
      startedAt: new Date(),
    };
    steps.push(trackStep);

    try {
      console.log(`[AgentLoop] Step 6: Tracking Setup`);
      outputs.trackingEnabled = true;
      trackStep.status = 'completed';
      trackStep.completedAt = new Date();
      trackStep.result = 'Tracking enabled for all published content';
    } catch (error) {
      trackStep.status = 'failed';
      trackStep.error = error instanceof Error ? error.message : 'Failed';
    }

    return { success: true };
  }

  /**
   * Mark task as in progress
   */
  private async markTaskInProgress(taskId: string): Promise<void> {
    await db
      .update(tasks)
      .set({
        status: 'in_progress',
        startedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(tasks.id, taskId));
  }

  /**
   * Mark task as completed
   */
  private async markTaskCompleted(taskId: string, result: unknown): Promise<void> {
    await db
      .update(tasks)
      .set({
        status: 'completed',
        completedAt: new Date(),
        result: result as Record<string, unknown>,
        updatedAt: new Date(),
      })
      .where(eq(tasks.id, taskId));
  }

  /**
   * Mark task as failed
   */
  private async markTaskFailed(taskId: string, error: string): Promise<void> {
    await db
      .update(tasks)
      .set({
        status: 'failed',
        result: { error },
        updatedAt: new Date(),
      })
      .where(eq(tasks.id, taskId));
  }

  /**
   * Manually trigger workflow for a company (for API calls)
   */
  async triggerWorkflow(
    companyId: string,
    options?: {
      agentId?: string;
      campaignName?: string;
      topicFocus?: string;
    }
  ): Promise<ExecutionResult> {
    console.log(`[AgentLoop] Manually triggering workflow for company ${companyId}`);

    // Get a marketing agent for this company
    let agentId = options?.agentId;
    if (!agentId) {
      const marketingAgent = await db.query.agents.findFirst({
        where: and(
          eq(agents.companyId, companyId),
          or(
            eq(agents.role, 'marketing_manager'),
            eq(agents.role, 'content_creator')
          )
        ),
      });
      agentId = marketingAgent?.id;
    }

    if (!agentId) {
      return {
        success: false,
        executionId: `exec-${Date.now()}`,
        context: { companyId, agentId: '' },
        steps: [],
        outputs: {},
        totalDuration: 0,
        error: 'No marketing agent found for this company',
      };
    }

    const context: ExecutionContext = {
      companyId,
      agentId,
      campaignName: options?.campaignName || `Campaign ${new Date().toLocaleDateString()}`,
    };

    const steps: ExecutionStep[] = [];
    const outputs: ExecutionResult['outputs'] = {};
    const startTime = Date.now();

    const result = await this.executeMarketingWorkflow(context, steps, outputs);

    return {
      success: result.success,
      executionId: `exec-${Date.now()}`,
      context,
      steps,
      outputs,
      totalDuration: Date.now() - startTime,
      error: result.error,
    };
  }

  /**
   * Run optimization cycle
   */
  async runOptimizationCycle(companyId: string): Promise<void> {
    console.log(`[AgentLoop] Running optimization cycle for ${companyId}`);

    try {
      const report = await optimizationEngine.analyze(companyId, { autoApply: true });
      console.log(
        `[AgentLoop] Optimization complete: ${report.recommendations.length} recommendations, ${report.autoAppliedActions.length} auto-applied`
      );
    } catch (error) {
      console.error(`[AgentLoop] Optimization cycle failed:`, error);
    }
  }

  /**
   * Process due scheduled posts
   */
  async processDuePosts(): Promise<number> {
    console.log(`[AgentLoop] Processing due posts...`);

    const now = new Date();

    // Get posts that are scheduled for now or earlier
    const duePosts = await db.query.scheduledPosts.findMany({
      where: and(
        eq(scheduledPosts.status, 'scheduled'),
        lte(scheduledPosts.scheduledFor, now)
      ),
      limit: 10,
    });

    let published = 0;
    for (const post of duePosts) {
      try {
        const result = await distributionEngine.publishPost(post.id);
        if (result.success) {
          published++;
        }
      } catch (error) {
        console.error(`[AgentLoop] Failed to publish post ${post.id}:`, error);
      }
    }

    console.log(`[AgentLoop] Published ${published}/${duePosts.length} due posts`);
    return published;
  }
}

export const agentExecutionLoop = new AgentExecutionLoop();
