import { Worker, Job } from 'bullmq';
import { eq } from 'drizzle-orm';
import { createDb, executionTasks, ExecutionResult, skills } from '@1person/core/db';

// Create database connection
const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/oneperson';
const db = createDb(DATABASE_URL);

// Redis connection config
const REDIS_CONFIG = {
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  password: process.env.REDIS_PASSWORD,
};

// Queue names (must match api service)
const QUEUE_NAMES = {
  EXECUTION: 'execution-tasks',
  IMAGE_GENERATION: 'image-generation',
  VIDEO_GENERATION: 'video-generation',
  SOCIAL_POST: 'social-post',
  EMAIL: 'email-send',
  ANALYTICS: 'analytics',
} as const;

interface ExecutionTaskData {
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

/**
 * Base class for skill executors
 */
abstract class SkillExecutor {
  abstract execute(
    skill: typeof skills.$inferSelect,
    payload: Record<string, unknown>,
    context: {
      companyId: string;
      agentId?: string;
      taskId: string;
    }
  ): Promise<ExecutionResult>;
}

/**
 * Text Generation Executor (Claude API)
 */
class TextGenerationExecutor extends SkillExecutor {
  async execute(
    skill: typeof skills.$inferSelect,
    payload: Record<string, unknown>,
    context: { companyId: string; agentId?: string; taskId: string }
  ): Promise<ExecutionResult> {
    const startTime = Date.now();
    const definition = skill.definition as {
      prompts: { system: string; task: string };
      parameters: Array<{ name: string; default?: unknown }>;
    };

    try {
      // Replace template variables in prompt
      let taskPrompt = definition.prompts.task;
      for (const [key, value] of Object.entries(payload)) {
        taskPrompt = taskPrompt.replace(new RegExp(`{{${key}}}`, 'g'), String(value));
      }

      // Get API key from environment (in production, get from company credentials)
      const apiKey = process.env.ANTHROPIC_API_KEY;
      if (!apiKey) {
        throw new Error('ANTHROPIC_API_KEY not configured');
      }

      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-3-5-sonnet-20241022',
          max_tokens: 4096,
          messages: [
            { role: 'user', content: taskPrompt },
          ],
          system: definition.prompts.system,
        }),
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`Claude API error: ${error}`);
      }

      const result = await response.json();
      const executionTimeMs = Date.now() - startTime;

      return {
        success: true,
        data: {
          content: result.content[0]?.text,
          model: result.model,
        },
        metadata: {
          executionTimeMs,
          toolCalls: 1,
          tokensUsed: result.usage?.input_tokens + result.usage?.output_tokens,
          costIncurred: (result.usage?.input_tokens * 0.003 + result.usage?.output_tokens * 0.015) / 1000,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'TEXT_GENERATION_FAILED',
          message: error instanceof Error ? error.message : 'Unknown error',
        },
        metadata: {
          executionTimeMs: Date.now() - startTime,
          toolCalls: 1,
        },
      };
    }
  }
}

/**
 * Image Generation Executor (Replicate)
 */
class ImageGenerationExecutor extends SkillExecutor {
  async execute(
    skill: typeof skills.$inferSelect,
    payload: Record<string, unknown>,
    context: { companyId: string; agentId?: string; taskId: string }
  ): Promise<ExecutionResult> {
    const startTime = Date.now();

    try {
      const apiKey = process.env.REPLICATE_API_TOKEN;
      if (!apiKey) {
        throw new Error('REPLICATE_API_TOKEN not configured');
      }

      // Create prediction
      const response = await fetch('https://api.replicate.com/v1/predictions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          version: 'black-forest-labs/flux-schnell', // Fast Flux model
          input: {
            prompt: payload.prompt as string,
            width: payload.width || 1024,
            height: payload.height || 1024,
            num_outputs: 1,
          },
        }),
      });

      if (!response.ok) {
        throw new Error(`Replicate API error: ${await response.text()}`);
      }

      let prediction = await response.json();

      // Poll for completion
      while (prediction.status !== 'succeeded' && prediction.status !== 'failed') {
        await new Promise(resolve => setTimeout(resolve, 1000));

        const pollResponse = await fetch(prediction.urls.get, {
          headers: { 'Authorization': `Bearer ${apiKey}` },
        });
        prediction = await pollResponse.json();
      }

      if (prediction.status === 'failed') {
        throw new Error(prediction.error || 'Image generation failed');
      }

      return {
        success: true,
        data: {
          images: prediction.output,
          prompt: payload.prompt,
        },
        metadata: {
          executionTimeMs: Date.now() - startTime,
          toolCalls: 1,
          costIncurred: 0.003, // Approximate cost per image
        },
      };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'IMAGE_GENERATION_FAILED',
          message: error instanceof Error ? error.message : 'Unknown error',
        },
        metadata: {
          executionTimeMs: Date.now() - startTime,
          toolCalls: 1,
        },
      };
    }
  }
}

/**
 * Social Post Executor (Facebook)
 */
class SocialPostExecutor extends SkillExecutor {
  async execute(
    skill: typeof skills.$inferSelect,
    payload: Record<string, unknown>,
    context: { companyId: string; agentId?: string; taskId: string }
  ): Promise<ExecutionResult> {
    const startTime = Date.now();

    try {
      // In production, get access token from company credentials
      const accessToken = process.env.FACEBOOK_ACCESS_TOKEN;
      if (!accessToken) {
        // For now, just simulate success
        console.log('[SocialPost] Would post to Facebook:', payload);

        return {
          success: true,
          data: {
            platform: payload.platform,
            postId: `simulated_${Date.now()}`,
            message: payload.content,
            scheduledAt: payload.scheduled_time,
          },
          metadata: {
            executionTimeMs: Date.now() - startTime,
            toolCalls: 1,
            costIncurred: 0,
          },
        };
      }

      const pageId = payload.page_id as string;
      const response = await fetch(`https://graph.facebook.com/v18.0/${pageId}/feed`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: payload.content,
          access_token: accessToken,
          ...(payload.scheduled_time && {
            published: false,
            scheduled_publish_time: Math.floor(new Date(payload.scheduled_time as string).getTime() / 1000),
          }),
        }),
      });

      if (!response.ok) {
        throw new Error(`Facebook API error: ${await response.text()}`);
      }

      const result = await response.json();

      return {
        success: true,
        data: {
          postId: result.id,
          platform: 'facebook',
        },
        metadata: {
          executionTimeMs: Date.now() - startTime,
          toolCalls: 1,
          costIncurred: 0,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'SOCIAL_POST_FAILED',
          message: error instanceof Error ? error.message : 'Unknown error',
        },
        metadata: {
          executionTimeMs: Date.now() - startTime,
          toolCalls: 1,
        },
      };
    }
  }
}

/**
 * Email Executor (SendGrid/Resend)
 */
class EmailExecutor extends SkillExecutor {
  async execute(
    skill: typeof skills.$inferSelect,
    payload: Record<string, unknown>,
    context: { companyId: string; agentId?: string; taskId: string }
  ): Promise<ExecutionResult> {
    const startTime = Date.now();

    try {
      const apiKey = process.env.RESEND_API_KEY || process.env.SENDGRID_API_KEY;

      if (!apiKey) {
        // Simulate email sending for development
        console.log('[Email] Would send email:', payload);

        return {
          success: true,
          data: {
            messageId: `simulated_${Date.now()}`,
            to: payload.recipient_email,
            subject: payload.subject || 'No subject',
          },
          metadata: {
            executionTimeMs: Date.now() - startTime,
            toolCalls: 1,
            costIncurred: 0,
          },
        };
      }

      // Use Resend API
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          from: payload.from || 'noreply@1person.ai',
          to: [payload.recipient_email],
          subject: payload.subject,
          html: payload.html || payload.content,
        }),
      });

      if (!response.ok) {
        throw new Error(`Email API error: ${await response.text()}`);
      }

      const result = await response.json();

      return {
        success: true,
        data: {
          messageId: result.id,
          to: payload.recipient_email,
        },
        metadata: {
          executionTimeMs: Date.now() - startTime,
          toolCalls: 1,
          costIncurred: 0.0001,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'EMAIL_FAILED',
          message: error instanceof Error ? error.message : 'Unknown error',
        },
        metadata: {
          executionTimeMs: Date.now() - startTime,
          toolCalls: 1,
        },
      };
    }
  }
}

/**
 * Get executor for a skill based on its tools
 */
function getExecutorForSkill(skill: typeof skills.$inferSelect): SkillExecutor {
  const tools = (skill.definition as any)?.tools || [];

  if (tools.includes('replicate-flux') || tools.includes('openai-dalle3')) {
    return new ImageGenerationExecutor();
  }
  if (tools.includes('facebook-graph') || tools.includes('instagram-graph')) {
    return new SocialPostExecutor();
  }
  if (tools.includes('sendgrid-email') || tools.includes('resend-email')) {
    return new EmailExecutor();
  }
  // Default to text generation
  return new TextGenerationExecutor();
}

/**
 * Process execution task
 */
async function processTask(job: Job<ExecutionTaskData>): Promise<ExecutionResult> {
  const { taskId, companyId, agentId, skillSlug, payload } = job.data;

  console.log(`[ExecutionWorker] Processing task ${taskId}: ${skillSlug}`);

  // Update task status to processing
  await db
    .update(executionTasks)
    .set({
      status: 'processing',
      startedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(executionTasks.id, taskId));

  try {
    // Get skill definition
    const skill = await db.query.skills.findFirst({
      where: eq(skills.slug, skillSlug),
    });

    if (!skill) {
      throw new Error(`Skill not found: ${skillSlug}`);
    }

    // Get appropriate executor
    const executor = getExecutorForSkill(skill);

    // Execute skill
    const result = await executor.execute(skill, payload, {
      companyId,
      agentId,
      taskId,
    });

    // Update task with result
    await db
      .update(executionTasks)
      .set({
        status: result.success ? 'completed' : 'failed',
        result,
        completedAt: new Date(),
        actualCost: result.metadata?.costIncurred?.toString(),
        lastError: result.success ? null : result.error?.message,
        updatedAt: new Date(),
      })
      .where(eq(executionTasks.id, taskId));

    console.log(`[ExecutionWorker] Task ${taskId} ${result.success ? 'completed' : 'failed'}`);

    return result;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    const result: ExecutionResult = {
      success: false,
      error: {
        code: 'EXECUTION_ERROR',
        message: errorMessage,
      },
      metadata: {
        executionTimeMs: 0,
        toolCalls: 0,
      },
    };

    await db
      .update(executionTasks)
      .set({
        status: 'failed',
        result,
        lastError: errorMessage,
        updatedAt: new Date(),
      })
      .where(eq(executionTasks.id, taskId));

    throw error;
  }
}

/**
 * Create and start workers for all queues
 */
export function startExecutionWorkers(): Worker[] {
  const workers: Worker[] = [];

  // Main execution worker
  const mainWorker = new Worker(
    QUEUE_NAMES.EXECUTION,
    processTask,
    {
      connection: REDIS_CONFIG,
      concurrency: 5,
    }
  );

  mainWorker.on('completed', (job) => {
    console.log(`[Worker] Job ${job.id} completed`);
  });

  mainWorker.on('failed', (job, err) => {
    console.error(`[Worker] Job ${job?.id} failed:`, err.message);
  });

  workers.push(mainWorker);

  // Image generation worker (lower concurrency due to resource intensity)
  const imageWorker = new Worker(
    QUEUE_NAMES.IMAGE_GENERATION,
    processTask,
    {
      connection: REDIS_CONFIG,
      concurrency: 2,
    }
  );
  workers.push(imageWorker);

  // Video generation worker
  const videoWorker = new Worker(
    QUEUE_NAMES.VIDEO_GENERATION,
    processTask,
    {
      connection: REDIS_CONFIG,
      concurrency: 1, // Very resource intensive
    }
  );
  workers.push(videoWorker);

  // Social post worker
  const socialWorker = new Worker(
    QUEUE_NAMES.SOCIAL_POST,
    processTask,
    {
      connection: REDIS_CONFIG,
      concurrency: 5,
    }
  );
  workers.push(socialWorker);

  // Email worker
  const emailWorker = new Worker(
    QUEUE_NAMES.EMAIL,
    processTask,
    {
      connection: REDIS_CONFIG,
      concurrency: 10,
    }
  );
  workers.push(emailWorker);

  // Analytics worker
  const analyticsWorker = new Worker(
    QUEUE_NAMES.ANALYTICS,
    processTask,
    {
      connection: REDIS_CONFIG,
      concurrency: 3,
    }
  );
  workers.push(analyticsWorker);

  console.log(`[ExecutionWorker] Started ${workers.length} workers`);

  return workers;
}

/**
 * Graceful shutdown
 */
export async function stopExecutionWorkers(workers: Worker[]): Promise<void> {
  console.log('[ExecutionWorker] Shutting down workers...');

  await Promise.all(workers.map(w => w.close()));

  console.log('[ExecutionWorker] All workers stopped');
}
