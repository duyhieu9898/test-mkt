import { Queue, Worker, Job } from 'bullmq';
import IORedis from 'ioredis';

// Redis connection
const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
export const redis = new IORedis(REDIS_URL, {
  maxRetriesPerRequest: null,
});

// Queue names
export const QUEUES = {
  TASK_EXECUTION: 'task-execution',
  AGENT_COMMAND: 'agent-command',
  AGENT_EVALUATION: 'agent-evaluation',
  NOTIFICATION: 'notification',
  SCHEDULED: 'scheduled-tasks',
} as const;

// Create queues
export const taskExecutionQueue = new Queue(QUEUES.TASK_EXECUTION, { connection: redis });
export const agentCommandQueue = new Queue(QUEUES.AGENT_COMMAND, { connection: redis });
export const agentEvaluationQueue = new Queue(QUEUES.AGENT_EVALUATION, { connection: redis });
export const notificationQueue = new Queue(QUEUES.NOTIFICATION, { connection: redis });
export const scheduledQueue = new Queue(QUEUES.SCHEDULED, { connection: redis });

// Job types
export interface TaskExecutionJob {
  taskId: string;
  agentId: string;
  companyId: string;
  taskType: string;
  title: string;
  description: string;
  input?: unknown;
  priority: 'critical' | 'high' | 'medium' | 'low';
}

export interface AgentCommandJob {
  agentId: string;
  companyId: string;
  command: string;
  userId: string;
  messageId?: string;
}

export interface AgentEvaluationJob {
  agentId: string;
  companyId: string;
  periodType: 'daily' | 'weekly' | 'monthly';
  periodStart: string;
  periodEnd: string;
}

export interface NotificationJob {
  type: 'task_completed' | 'task_failed' | 'agent_status' | 'budget_alert' | 'system_alert';
  userId: string;
  companyId: string;
  title: string;
  message: string;
  metadata?: Record<string, unknown>;
}

// Priority mapping
const PRIORITY_MAP = {
  critical: 1,
  high: 2,
  medium: 3,
  low: 4,
};

// Add task to execution queue
export async function queueTaskExecution(job: TaskExecutionJob) {
  return taskExecutionQueue.add('execute', job, {
    priority: PRIORITY_MAP[job.priority],
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 5000,
    },
    removeOnComplete: { count: 1000 },
    removeOnFail: { count: 5000 },
  });
}

// Add command to agent queue
export async function queueAgentCommand(job: AgentCommandJob) {
  return agentCommandQueue.add('command', job, {
    attempts: 2,
    backoff: {
      type: 'fixed',
      delay: 2000,
    },
    removeOnComplete: { count: 500 },
    removeOnFail: { count: 1000 },
  });
}

// Schedule agent evaluation
export async function queueAgentEvaluation(job: AgentEvaluationJob, delay?: number) {
  return agentEvaluationQueue.add('evaluate', job, {
    delay,
    attempts: 2,
    removeOnComplete: { count: 100 },
  });
}

// Send notification
export async function queueNotification(job: NotificationJob) {
  return notificationQueue.add('notify', job, {
    attempts: 3,
    removeOnComplete: { count: 1000 },
  });
}

// Get queue stats
export async function getQueueStats() {
  const [taskStats, commandStats, evalStats] = await Promise.all([
    taskExecutionQueue.getJobCounts(),
    agentCommandQueue.getJobCounts(),
    agentEvaluationQueue.getJobCounts(),
  ]);

  return {
    taskExecution: taskStats,
    agentCommand: commandStats,
    agentEvaluation: evalStats,
  };
}

// Cleanup completed jobs
export async function cleanupQueues() {
  await Promise.all([
    taskExecutionQueue.clean(24 * 60 * 60 * 1000, 1000, 'completed'),
    agentCommandQueue.clean(24 * 60 * 60 * 1000, 500, 'completed'),
    agentEvaluationQueue.clean(7 * 24 * 60 * 60 * 1000, 100, 'completed'),
  ]);
}
