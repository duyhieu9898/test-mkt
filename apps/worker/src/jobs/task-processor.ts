import { Worker, Job } from 'bullmq';
import { redis, QUEUES, type TaskExecutionJob } from '../lib/queue';
import { executeTask } from '../services/agent-runtime';

export function createTaskWorker() {
  const worker = new Worker<TaskExecutionJob>(
    QUEUES.TASK_EXECUTION,
    async (job: Job<TaskExecutionJob>) => {
      console.log(`[Task Worker] Processing job ${job.id}: ${job.data.title}`);

      const result = await executeTask(job.data.taskId, job.data.agentId);

      if (!result.success) {
        throw new Error(result.error || 'Task execution failed');
      }

      console.log(`[Task Worker] Completed job ${job.id} in ${result.executionTime}ms`);
      console.log(`[Task Worker] Tokens used: ${result.tokensUsed}, Cost: $${result.cost.toFixed(4)}`);

      return result;
    },
    {
      connection: redis,
      concurrency: 5,
      limiter: {
        max: 10,
        duration: 60000, // 10 jobs per minute per agent type
      },
    }
  );

  worker.on('completed', (job, result) => {
    console.log(`[Task Worker] Job ${job.id} completed successfully`);
  });

  worker.on('failed', (job, error) => {
    console.error(`[Task Worker] Job ${job?.id} failed:`, error.message);
  });

  worker.on('error', (error) => {
    console.error('[Task Worker] Error:', error);
  });

  return worker;
}
