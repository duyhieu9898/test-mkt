import { Queue } from 'bullmq';
import IORedis from 'ioredis';
import { env } from './env';

// Redis connection
const redis = new IORedis(env.REDIS_URL || 'redis://localhost:6379', {
  maxRetriesPerRequest: null,
});

// Queue names (must match worker)
export const QUEUES = {
  TASK_EXECUTION: 'task-execution',
  AGENT_COMMAND: 'agent-command',
  AGENT_EVALUATION: 'agent-evaluation',
  NOTIFICATION: 'notification',
} as const;

// Create queue instances
export const taskExecutionQueue = new Queue(QUEUES.TASK_EXECUTION, { connection: redis });
export const agentCommandQueue = new Queue(QUEUES.AGENT_COMMAND, { connection: redis });
export const agentEvaluationQueue = new Queue(QUEUES.AGENT_EVALUATION, { connection: redis });

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
  });
}

// Add command to agent queue
export async function queueAgentCommand(job: AgentCommandJob) {
  const queueJob = await agentCommandQueue.add('command', job, {
    attempts: 2,
    backoff: {
      type: 'fixed',
      delay: 2000,
    },
  });

  return queueJob;
}

// Get job status
export async function getJobStatus(queueName: string, jobId: string) {
  const queue = queueName === 'task-execution' ? taskExecutionQueue : agentCommandQueue;
  const job = await queue.getJob(jobId);

  if (!job) {
    return null;
  }

  const state = await job.getState();
  return {
    id: job.id,
    state,
    progress: job.progress,
    data: job.data,
    returnvalue: job.returnvalue,
    failedReason: job.failedReason,
  };
}

// Get queue stats
export async function getQueueStats() {
  const [taskStats, commandStats] = await Promise.all([
    taskExecutionQueue.getJobCounts(),
    agentCommandQueue.getJobCounts(),
  ]);

  return {
    taskExecution: taskStats,
    agentCommand: commandStats,
  };
}

export { redis };
