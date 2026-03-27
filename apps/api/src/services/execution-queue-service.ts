import { Queue, QueueEvents } from 'bullmq';
import { eq } from 'drizzle-orm';
import { db } from '../lib/db';
import { executionTasks } from '@1person/core/db';
import type { ExecutionResult } from '@1person/core/db';
import { skillRegistry } from './skill-registry-service';
import { toolRegistry } from './tool-registry-service';

// Redis connection config
const REDIS_CONFIG = {
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  password: process.env.REDIS_PASSWORD,
};

// Queue names
export const QUEUE_NAMES = {
  EXECUTION: 'execution-tasks',
  IMAGE_GENERATION: 'image-generation',
  VIDEO_GENERATION: 'video-generation',
  SOCIAL_POST: 'social-post',
  EMAIL: 'email-send',
  ANALYTICS: 'analytics',
} as const;

// Task priorities
export const TASK_PRIORITY = {
  URGENT: 1,
  HIGH: 3,
  NORMAL: 5,
  LOW: 7,
  BACKGROUND: 10,
} as const;

export interface ExecutionTaskData {
  taskId: string;
  companyId: string;
  agentId?: string;
  agentType: string;
  skillSlug: string;
  taskType: string;
  payload: Record<string, unknown>;
  priority?: number;
  parentTaskId?: string;
}

export interface TaskResult {
  success: boolean;
  data?: unknown;
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };
  metadata?: {
    executionTimeMs: number;
    toolCalls: number;
    tokensUsed?: number;
    costIncurred?: number;
  };
}

class ExecutionQueueService {
  private queues: Map<string, Queue> = new Map();
  private queueEvents: Map<string, QueueEvents> = new Map();
  private initialized = false;

  /**
   * Initialize all queues
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    console.log('[ExecutionQueue] Initializing queues...');

    // Create main execution queue
    const executionQueue = new Queue(QUEUE_NAMES.EXECUTION, {
      connection: REDIS_CONFIG,
      defaultJobOptions: {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 2000,
        },
        removeOnComplete: {
          age: 24 * 3600, // Keep completed jobs for 24 hours
          count: 1000,
        },
        removeOnFail: {
          age: 7 * 24 * 3600, // Keep failed jobs for 7 days
        },
      },
    });

    this.queues.set(QUEUE_NAMES.EXECUTION, executionQueue);

    // Create specialized queues for different task types
    for (const queueName of Object.values(QUEUE_NAMES)) {
      if (queueName === QUEUE_NAMES.EXECUTION) continue;

      const queue = new Queue(queueName, {
        connection: REDIS_CONFIG,
        defaultJobOptions: {
          attempts: 3,
          backoff: { type: 'exponential', delay: 1000 },
          removeOnComplete: { age: 3600, count: 500 },
          removeOnFail: { age: 7 * 24 * 3600 },
        },
      });

      this.queues.set(queueName, queue);
    }

    // Setup queue events for main queue
    const events = new QueueEvents(QUEUE_NAMES.EXECUTION, {
      connection: REDIS_CONFIG,
    });

    events.on('completed', async ({ jobId, returnvalue }) => {
      console.log(`[ExecutionQueue] Job ${jobId} completed`);
      // Job completion handled in worker
    });

    events.on('failed', async ({ jobId, failedReason }) => {
      console.log(`[ExecutionQueue] Job ${jobId} failed: ${failedReason}`);
    });

    events.on('progress', ({ jobId, data }) => {
      console.log(`[ExecutionQueue] Job ${jobId} progress:`, data);
    });

    this.queueEvents.set(QUEUE_NAMES.EXECUTION, events);

    this.initialized = true;
    console.log('[ExecutionQueue] All queues initialized');
  }

  /**
   * Create and queue an execution task
   */
  async createTask(data: {
    companyId: string;
    agentId?: string;
    agentType: string;
    skillSlug: string;
    taskType: string;
    payload: Record<string, unknown>;
    priority?: number;
    parentTaskId?: string;
    estimatedCost?: number;
  }): Promise<string> {
    // Create task in database
    const insertedTasks = await db
      .insert(executionTasks)
      .values({
        companyId: data.companyId,
        agentId: data.agentId,
        agentType: data.agentType as any,
        skillSlug: data.skillSlug,
        taskType: data.taskType,
        taskPayload: data.payload,
        status: 'pending',
        priority: data.priority || TASK_PRIORITY.NORMAL,
        parentTaskId: data.parentTaskId,
        estimatedCost: data.estimatedCost?.toString(),
      })
      .returning();

    const task = insertedTasks[0];
    if (!task) throw new Error('Failed to create task');

    // Add to queue
    await this.enqueueTask({
      taskId: task.id,
      companyId: data.companyId,
      agentId: data.agentId,
      agentType: data.agentType,
      skillSlug: data.skillSlug,
      taskType: data.taskType,
      payload: data.payload,
      priority: data.priority,
      parentTaskId: data.parentTaskId,
    });

    return task.id;
  }

  /**
   * Add task to appropriate queue
   */
  async enqueueTask(data: ExecutionTaskData): Promise<void> {
    await this.initialize();

    // Update task status to queued
    await db
      .update(executionTasks)
      .set({
        status: 'queued',
        queuedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(executionTasks.id, data.taskId));

    // Determine which queue to use based on skill/task type
    const queueName = this.getQueueForTask(data);
    const queue = this.queues.get(queueName);

    if (!queue) {
      throw new Error(`Queue ${queueName} not initialized`);
    }

    // Add to queue with priority
    await queue.add(
      data.taskType,
      data,
      {
        priority: data.priority || TASK_PRIORITY.NORMAL,
        jobId: data.taskId,
      }
    );

    console.log(`[ExecutionQueue] Task ${data.taskId} queued to ${queueName}`);
  }

  /**
   * Determine which queue to use for a task
   */
  private getQueueForTask(data: ExecutionTaskData): string {
    const skillSlug = data.skillSlug;

    // Route to specialized queues based on skill
    if (skillSlug.includes('banner') || skillSlug.includes('image')) {
      return QUEUE_NAMES.IMAGE_GENERATION;
    }
    if (skillSlug.includes('video')) {
      return QUEUE_NAMES.VIDEO_GENERATION;
    }
    if (skillSlug.includes('social') || skillSlug.includes('post')) {
      return QUEUE_NAMES.SOCIAL_POST;
    }
    if (skillSlug.includes('email') || skillSlug.includes('outreach')) {
      return QUEUE_NAMES.EMAIL;
    }
    if (skillSlug.includes('analyze') || skillSlug.includes('campaign')) {
      return QUEUE_NAMES.ANALYTICS;
    }

    // Default to main execution queue
    return QUEUE_NAMES.EXECUTION;
  }

  /**
   * Update task status and result
   */
  async updateTaskResult(
    taskId: string,
    result: ExecutionResult,
    status: 'completed' | 'failed'
  ): Promise<void> {
    await db
      .update(executionTasks)
      .set({
        status,
        result,
        completedAt: new Date(),
        actualCost: result.metadata?.costIncurred?.toString(),
        updatedAt: new Date(),
      })
      .where(eq(executionTasks.id, taskId));
  }

  /**
   * Mark task as processing
   */
  async markTaskProcessing(taskId: string): Promise<void> {
    await db
      .update(executionTasks)
      .set({
        status: 'processing',
        startedAt: new Date(),
        attempts: (await db.query.executionTasks.findFirst({
          where: eq(executionTasks.id, taskId)
        }))?.attempts ?? 0 + 1,
        updatedAt: new Date(),
      })
      .where(eq(executionTasks.id, taskId));
  }

  /**
   * Get task by ID
   */
  async getTask(taskId: string) {
    return db.query.executionTasks.findFirst({
      where: eq(executionTasks.id, taskId),
    });
  }

  /**
   * Get tasks for a company
   */
  async getCompanyTasks(companyId: string, options?: {
    status?: string;
    agentType?: string;
    limit?: number;
    offset?: number;
  }) {
    return db.query.executionTasks.findMany({
      where: (t, { and, eq: e }) => {
        const conditions = [e(t.companyId, companyId)];
        if (options?.status) {
          conditions.push(e(t.status, options.status as any));
        }
        if (options?.agentType) {
          conditions.push(e(t.agentType, options.agentType as any));
        }
        return and(...conditions);
      },
      limit: options?.limit || 50,
      offset: options?.offset || 0,
      orderBy: (t, { desc }) => [desc(t.createdAt)],
    });
  }

  /**
   * Cancel a pending task
   */
  async cancelTask(taskId: string): Promise<boolean> {
    const task = await this.getTask(taskId);
    if (!task) return false;

    if (task.status !== 'pending' && task.status !== 'queued') {
      return false;
    }

    await db
      .update(executionTasks)
      .set({
        status: 'cancelled',
        updatedAt: new Date(),
      })
      .where(eq(executionTasks.id, taskId));

    // Remove from queue if possible
    const queueName = this.getQueueForTask({
      taskId,
      companyId: task.companyId,
      agentType: task.agentType,
      skillSlug: task.skillSlug,
      taskType: task.taskType,
      payload: task.taskPayload,
    });

    const queue = this.queues.get(queueName);
    if (queue) {
      const job = await queue.getJob(taskId);
      if (job) {
        await job.remove();
      }
    }

    return true;
  }

  /**
   * Retry a failed task
   */
  async retryTask(taskId: string): Promise<boolean> {
    const task = await this.getTask(taskId);
    if (!task || task.status !== 'failed') return false;

    if ((task.attempts || 0) >= (task.maxAttempts || 3)) {
      return false;
    }

    // Reset status and re-queue
    await db
      .update(executionTasks)
      .set({
        status: 'pending',
        lastError: null,
        updatedAt: new Date(),
      })
      .where(eq(executionTasks.id, taskId));

    await this.enqueueTask({
      taskId,
      companyId: task.companyId,
      agentId: task.agentId || undefined,
      agentType: task.agentType,
      skillSlug: task.skillSlug,
      taskType: task.taskType,
      payload: task.taskPayload,
      priority: task.priority || TASK_PRIORITY.NORMAL,
      parentTaskId: task.parentTaskId || undefined,
    });

    return true;
  }

  /**
   * Get queue statistics
   */
  async getQueueStats() {
    await this.initialize();

    const stats: Record<string, {
      waiting: number;
      active: number;
      completed: number;
      failed: number;
      delayed: number;
    }> = {};

    for (const [name, queue] of this.queues) {
      const counts = await queue.getJobCounts();
      stats[name] = {
        waiting: counts.waiting || 0,
        active: counts.active || 0,
        completed: counts.completed || 0,
        failed: counts.failed || 0,
        delayed: counts.delayed || 0,
      };
    }

    return stats;
  }

  /**
   * Pause a queue
   */
  async pauseQueue(queueName: string): Promise<void> {
    const queue = this.queues.get(queueName);
    if (queue) {
      await queue.pause();
      console.log(`[ExecutionQueue] Queue ${queueName} paused`);
    }
  }

  /**
   * Resume a queue
   */
  async resumeQueue(queueName: string): Promise<void> {
    const queue = this.queues.get(queueName);
    if (queue) {
      await queue.resume();
      console.log(`[ExecutionQueue] Queue ${queueName} resumed`);
    }
  }

  /**
   * Clean up old jobs
   */
  async cleanOldJobs(queueName: string, gracePeriodMs = 24 * 3600 * 1000): Promise<void> {
    const queue = this.queues.get(queueName);
    if (queue) {
      await queue.clean(gracePeriodMs, 1000, 'completed');
      await queue.clean(gracePeriodMs * 7, 1000, 'failed');
      console.log(`[ExecutionQueue] Cleaned old jobs from ${queueName}`);
    }
  }

  /**
   * Get queue instance
   */
  getQueue(name: string): Queue | undefined {
    return this.queues.get(name);
  }

  /**
   * Shutdown all queues
   */
  async shutdown(): Promise<void> {
    console.log('[ExecutionQueue] Shutting down...');

    for (const events of this.queueEvents.values()) {
      await events.close();
    }

    for (const queue of this.queues.values()) {
      await queue.close();
    }

    this.queues.clear();
    this.queueEvents.clear();
    this.initialized = false;

    console.log('[ExecutionQueue] Shutdown complete');
  }
}

// Export singleton
export const executionQueue = new ExecutionQueueService();
