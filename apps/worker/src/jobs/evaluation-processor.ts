import { Worker, Job } from 'bullmq';
import { redis, QUEUES, type AgentEvaluationJob } from '../lib/queue';
import { evaluateAgent } from '../services/agent-runtime';

export function createEvaluationWorker() {
  const worker = new Worker<AgentEvaluationJob>(
    QUEUES.AGENT_EVALUATION,
    async (job: Job<AgentEvaluationJob>) => {
      console.log(`[Evaluation Worker] Evaluating agent ${job.data.agentId}`);

      await evaluateAgent(
        job.data.agentId,
        job.data.periodType,
        new Date(job.data.periodStart),
        new Date(job.data.periodEnd)
      );

      console.log(`[Evaluation Worker] Evaluation complete for agent ${job.data.agentId}`);
    },
    {
      connection: redis,
      concurrency: 3,
    }
  );

  worker.on('completed', (job) => {
    console.log(`[Evaluation Worker] Agent ${job.data.agentId} evaluated`);
  });

  worker.on('failed', (job, error) => {
    console.error(`[Evaluation Worker] Evaluation failed:`, error.message);
  });

  return worker;
}
