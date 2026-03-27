import { Worker, Job } from 'bullmq';
import { redis, QUEUES, type AgentCommandJob, queueTaskExecution } from '../lib/queue';
import { processAgentCommand } from '../services/agent-runtime';

// Event emitter for real-time updates (will be connected to WebSocket)
type CommandEventHandler = (agentId: string, data: unknown) => void;
let onCommandComplete: CommandEventHandler | null = null;
let onCommandProgress: CommandEventHandler | null = null;

export function setCommandEventHandlers(
  onComplete: CommandEventHandler,
  onProgress: CommandEventHandler
) {
  onCommandComplete = onComplete;
  onCommandProgress = onProgress;
}

export function createCommandWorker() {
  const worker = new Worker<AgentCommandJob>(
    QUEUES.AGENT_COMMAND,
    async (job: Job<AgentCommandJob>) => {
      console.log(`[Command Worker] Processing command for agent ${job.data.agentId}`);

      // Emit progress
      if (onCommandProgress) {
        onCommandProgress(job.data.agentId, {
          status: 'processing',
          command: job.data.command,
        });
      }

      const result = await processAgentCommand(
        job.data.agentId,
        job.data.command,
        job.data.userId
      );

      console.log(`[Command Worker] Response generated, tokens: ${result.tokensUsed}`);

      // If a task was created, queue it for execution
      if (result.taskCreated) {
        console.log(`[Command Worker] Task created: ${result.taskCreated.title}`);
        await queueTaskExecution({
          taskId: result.taskCreated.id,
          agentId: job.data.agentId,
          companyId: job.data.companyId,
          taskType: result.taskCreated.type,
          title: result.taskCreated.title,
          description: '',
          priority: 'medium',
        });
      }

      // Emit completion
      if (onCommandComplete) {
        onCommandComplete(job.data.agentId, {
          status: 'completed',
          response: result.response,
          taskCreated: result.taskCreated,
          tokensUsed: result.tokensUsed,
          cost: result.cost,
        });
      }

      return result;
    },
    {
      connection: redis,
      concurrency: 10,
    }
  );

  worker.on('completed', (job, result) => {
    console.log(`[Command Worker] Command processed for agent ${job.data.agentId}`);
  });

  worker.on('failed', (job, error) => {
    console.error(`[Command Worker] Command failed:`, error.message);
    if (onCommandComplete && job) {
      onCommandComplete(job.data.agentId, {
        status: 'error',
        error: error.message,
      });
    }
  });

  return worker;
}
