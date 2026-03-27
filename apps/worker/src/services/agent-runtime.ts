import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { eq, and } from 'drizzle-orm';
import * as schema from '@1person/core/db';
import {
  callLLM,
  agentThink,
  buildAgentSystemPrompt,
  buildTaskExecutionPrompt,
  analyzeTask,
  type AgentContext,
  type LLMResponse,
} from '../lib/llm';
import { queueNotification, queueAgentEvaluation } from '../lib/queue';
import { budgetGuard, recordCost, checkBudget, estimateCost } from '../lib/budget';
import { workerMetrics } from '../lib/metrics';
import { taskLogger, agentLogger } from '../lib/logger';
import {
  getAgentMemoryContext,
  buildMemoryEnhancedPrompt,
  createMemoryFromTask,
  storeMemory,
  searchMemories,
} from './memory';
import { env } from '../lib/env';

// Database connection
const client = postgres(env.DATABASE_URL);
const db = drizzle(client, { schema });

export interface TaskExecutionResult {
  success: boolean;
  output: string;
  tokensUsed: number;
  cost: number;
  executionTime: number;
  steps?: string[];
  error?: string;
}

export interface CommandResult {
  response: string;
  tokensUsed: number;
  cost: number;
  taskCreated?: {
    id: string;
    title: string;
    type: string;
  };
}

// Get agent with company context
async function getAgentWithContext(agentId: string) {
  const agent = await db.query.agents.findFirst({
    where: eq(schema.agents.id, agentId),
    with: {
      company: true,
      department: true,
    },
  });

  if (!agent) {
    throw new Error(`Agent not found: ${agentId}`);
  }

  return agent;
}

// Build context for agent
function buildContext(agent: Awaited<ReturnType<typeof getAgentWithContext>>): AgentContext {
  const capabilities = Array.isArray(agent.capabilities)
    ? agent.capabilities.map((c: { name?: string } | string) =>
        typeof c === 'string' ? c : c.name || 'unknown'
      )
    : [];

  return {
    agentName: agent.name,
    agentRole: agent.role,
    companyName: agent.company?.name || 'Unknown Company',
    companyDescription: agent.company?.description || undefined,
    capabilities,
  };
}

// Execute a task
export async function executeTask(
  taskId: string,
  agentId: string
): Promise<TaskExecutionResult> {
  const startTime = Date.now();
  workerMetrics.tasksReceived.inc();
  workerMetrics.activeJobs.inc();

  const logger = taskLogger.child({ taskId, agentId });
  logger.info('Starting task execution');

  try {
    // Get task
    const task = await db.query.tasks.findFirst({
      where: eq(schema.tasks.id, taskId),
    });

    if (!task) {
      throw new Error(`Task not found: ${taskId}`);
    }

    // Get agent with context
    const agent = await getAgentWithContext(agentId);
    const context = buildContext(agent);

    // Check budget before execution
    const model = env.AGENT_AI_MODEL;
    const budgetCheck = await checkBudget(agentId, estimateCost(model, 4000).estimatedCost);
    if (!budgetCheck.allowed) {
      logger.warn('Budget exceeded, skipping task', { reason: budgetCheck.reason });
      throw new Error(budgetCheck.reason || 'Budget exceeded');
    }

    // Update task status to in_progress
    await db
      .update(schema.tasks)
      .set({
        status: 'in_progress',
        startedAt: new Date(),
        assignedAgentId: agentId,
      })
      .where(eq(schema.tasks.id, taskId));

    // Update agent status
    await db
      .update(schema.agents)
      .set({
        status: 'running',
        lastActiveAt: new Date(),
      })
      .where(eq(schema.agents.id, agentId));

    // Analyze task first
    const analysis = await analyzeTask(context, {
      title: task.title,
      description: task.description || '',
      type: task.type,
    });

    // Get memory context for enhanced task execution
    let memoryContext;
    try {
      memoryContext = await getAgentMemoryContext(agentId, {
        title: task.title,
        description: task.description || '',
        type: task.type,
      });
      logger.info('Memory context loaded', {
        memories: memoryContext.recentMemories.length,
        strategies: memoryContext.pastStrategies.length,
        lessons: memoryContext.failureLessons.length,
      });
    } catch (err) {
      logger.warn('Failed to load memory context, continuing without memories', {
        error: String(err),
      });
    }

    // Execute task with memory-enhanced prompt
    let executionPrompt = buildTaskExecutionPrompt({
      title: task.title,
      description: task.description || '',
      type: task.type,
      input: task.input,
    });

    // Enhance prompt with memory context if available
    if (memoryContext) {
      executionPrompt = buildMemoryEnhancedPrompt(executionPrompt, memoryContext);
    }

    context.currentTask = {
      title: task.title,
      description: task.description || '',
      type: task.type,
    };

    const response = await agentThink(context, executionPrompt);

    // Update task as completed
    await db
      .update(schema.tasks)
      .set({
        status: 'completed',
        completedAt: new Date(),
        output: { result: response.content, analysis },
        progress: 100,
      })
      .where(eq(schema.tasks.id, taskId));

    // Store task result as memory for future reference
    try {
      await createMemoryFromTask(taskId, agentId, {
        success: true,
        output: response.content,
        insights: analysis.steps,
      });
      logger.info('Task memory stored');
    } catch (err) {
      logger.warn('Failed to store task memory', { error: String(err) });
    }

    // Update agent stats
    await db
      .update(schema.agents)
      .set({
        status: 'ready',
        tasksCompleted: (agent.tasksCompleted || 0) + 1,
        lastActiveAt: new Date(),
      })
      .where(eq(schema.agents.id, agentId));

    // Log action
    await db.insert(schema.actionLogs).values({
      companyId: agent.companyId,
      agentId: agentId,
      taskId: taskId,
      toolName: 'task_execution',
      action: 'execute_task',
      input: { taskId, title: task.title },
      output: { success: true },
      tokensUsed: response.tokensUsed.total,
      promptTokens: response.tokensUsed.prompt,
      completionTokens: response.tokensUsed.completion,
      cost: String(response.cost),
      latencyMs: Date.now() - startTime,
      status: 'success',
    });

    // Record cost
    await recordCost(agentId, response.cost, {
      model: response.model,
      promptTokens: response.tokensUsed.prompt,
      completionTokens: response.tokensUsed.completion,
      taskId,
    });

    // Update metrics
    workerMetrics.tasksCompleted.inc();
    workerMetrics.taskDuration.observe(Date.now() - startTime);
    workerMetrics.llmTokensUsed.inc(response.tokensUsed.total);
    workerMetrics.llmCost.inc(Math.round(response.cost * 100)); // cents
    workerMetrics.activeJobs.dec();

    // Send notification
    await queueNotification({
      type: 'task_completed',
      userId: agent.company?.ownerId || '',
      companyId: agent.companyId,
      title: 'Task Completed',
      message: `${agent.name} completed: ${task.title}`,
      metadata: { taskId, agentId },
    });

    logger.info('Task completed successfully', {
      duration: Date.now() - startTime,
      tokens: response.tokensUsed.total,
      cost: response.cost,
    });

    return {
      success: true,
      output: response.content,
      tokensUsed: response.tokensUsed.total,
      cost: response.cost,
      executionTime: Date.now() - startTime,
      steps: analysis.steps,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    // Update metrics
    workerMetrics.tasksFailed.inc();
    workerMetrics.activeJobs.dec();

    logger.error('Task execution failed', {
      error: errorMessage,
      duration: Date.now() - startTime,
    });

    // Update task as failed
    await db
      .update(schema.tasks)
      .set({
        status: 'failed',
        errorMessage,
        errorDetails: { error: errorMessage, stack: error instanceof Error ? error.stack : undefined },
      })
      .where(eq(schema.tasks.id, taskId));

    // Store failure as memory to learn from
    try {
      await createMemoryFromTask(taskId, agentId, {
        success: false,
        output: errorMessage,
      });
    } catch {
      // Ignore memory storage errors during failure handling
    }

    // Update agent
    const agent = await getAgentWithContext(agentId);
    await db
      .update(schema.agents)
      .set({
        status: 'error',
        statusMessage: errorMessage,
        tasksFailed: (agent.tasksFailed || 0) + 1,
      })
      .where(eq(schema.agents.id, agentId));

    // Log failure
    await db.insert(schema.actionLogs).values({
      companyId: agent.companyId,
      agentId: agentId,
      taskId: taskId,
      toolName: 'task_execution',
      action: 'execute_task',
      input: { taskId },
      status: 'error',
      errorType: 'execution_error',
      errorMessage,
      latencyMs: Date.now() - startTime,
    });

    return {
      success: false,
      output: '',
      tokensUsed: 0,
      cost: 0,
      executionTime: Date.now() - startTime,
      error: errorMessage,
    };
  }
}

// Process agent command (chat)
export async function processAgentCommand(
  agentId: string,
  command: string,
  userId: string
): Promise<CommandResult> {
  const startTime = Date.now();

  // Get agent
  const agent = await getAgentWithContext(agentId);
  const context = buildContext(agent);

  // Get recent conversation history (messages to/from this agent)
  const recentMessages = await db.query.messages.findMany({
    where: and(
      eq(schema.messages.companyId, agent.companyId),
      eq(schema.messages.type, 'chat')
    ),
    orderBy: (messages, { desc }) => [desc(messages.createdAt)],
    limit: 10,
  });

  // Build conversation history - determine role based on sender
  context.conversationHistory = recentMessages
    .filter(msg => msg.senderAgentId === agentId || msg.receiverAgentId === agentId)
    .reverse()
    .map((msg) => ({
      role: msg.senderAgentId === agentId ? 'assistant' : 'user' as 'user' | 'assistant',
      content: msg.content,
    }));

  // Update agent status
  await db
    .update(schema.agents)
    .set({
      status: 'running',
      lastActiveAt: new Date(),
    })
    .where(eq(schema.agents.id, agentId));

  // Save user message
  await db.insert(schema.messages).values({
    companyId: agent.companyId,
    senderUserId: userId,
    receiverAgentId: agentId,
    type: 'chat',
    content: command,
    metadata: { userId },
  });

  // Think and respond
  const response = await agentThink(context, command);

  // Save assistant message
  const [savedMessage] = await db
    .insert(schema.messages)
    .values({
      companyId: agent.companyId,
      senderAgentId: agentId,
      receiverUserId: userId,
      type: 'chat',
      content: response.content,
      metadata: { model: response.model, tokensUsed: response.tokensUsed.total, cost: response.cost },
    })
    .returning();

  // Check if we should create a task from the command
  let taskCreated: { id: string; title: string; type: string } | undefined;

  // Simple task detection
  const taskIndicators = ['create', 'make', 'build', 'write', 'generate', 'analyze', 'review'];
  const shouldCreateTask = taskIndicators.some((indicator) =>
    command.toLowerCase().includes(indicator)
  );

  if (shouldCreateTask) {
    // Ask LLM to extract task info
    const taskExtractionPrompt = `Based on this command, extract task information in JSON format:
Command: "${command}"

If this is a request to do something, respond with:
{"isTask": true, "title": "Brief task title", "description": "Detailed description", "type": "content|campaign|analysis|research|report|other", "priority": "high|medium|low"}

If this is just a question or conversation, respond with:
{"isTask": false}`;

    const taskExtraction = await callLLM([
      { role: 'system', content: 'You extract task information from user commands. Respond only with valid JSON.' },
      { role: 'user', content: taskExtractionPrompt },
    ], { temperature: 0.1 });

    try {
      const jsonMatch = taskExtraction.content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const taskInfo = JSON.parse(jsonMatch[0]);
        if (taskInfo.isTask) {
          const [task] = await db
            .insert(schema.tasks)
            .values({
              companyId: agent.companyId,
              assignedAgentId: agentId,
              title: taskInfo.title,
              description: taskInfo.description,
              type: taskInfo.type || 'other',
              status: 'pending',
              priority: taskInfo.priority || 'medium',
            })
            .returning();

          taskCreated = {
            id: task.id,
            title: task.title,
            type: task.type,
          };
        }
      }
    } catch {
      // Ignore task extraction errors
    }
  }

  // Update agent status
  await db
    .update(schema.agents)
    .set({
      status: 'ready',
      lastActiveAt: new Date(),
    })
    .where(eq(schema.agents.id, agentId));

  // Log action
  await db.insert(schema.actionLogs).values({
    companyId: agent.companyId,
    agentId: agentId,
    toolName: 'chat',
    action: 'respond_to_command',
    input: { command },
    output: { messageId: savedMessage.id, taskCreated },
    tokensUsed: response.tokensUsed.total,
    promptTokens: response.tokensUsed.prompt,
    completionTokens: response.tokensUsed.completion,
    cost: String(response.cost),
    latencyMs: Date.now() - startTime,
    status: 'success',
  });

  return {
    response: response.content,
    tokensUsed: response.tokensUsed.total,
    cost: response.cost,
    taskCreated,
  };
}

// Evaluate agent performance
export async function evaluateAgent(
  agentId: string,
  periodType: 'daily' | 'weekly' | 'monthly',
  periodStart: Date,
  periodEnd: Date
): Promise<void> {
  const agent = await getAgentWithContext(agentId);

  // Get tasks in period
  const tasks = await db.query.tasks.findMany({
    where: and(
      eq(schema.tasks.assignedAgentId, agentId),
      eq(schema.tasks.companyId, agent.companyId)
    ),
  });

  const completedTasks = tasks.filter((t) => t.status === 'completed');
  const failedTasks = tasks.filter((t) => t.status === 'failed');

  // Get action logs for cost calculation
  const actionLogs = await db.query.actionLogs.findMany({
    where: eq(schema.actionLogs.agentId, agentId),
  });

  const totalCost = actionLogs.reduce((sum, log) => sum + parseFloat(log.cost || '0'), 0);
  const totalTokens = actionLogs.reduce((sum, log) => sum + (log.tokensUsed || 0), 0);

  // Calculate score
  const successRate = tasks.length > 0 ? completedTasks.length / tasks.length : 0;
  const overallScore = Math.round(successRate * 100);

  // Create evaluation
  await db.insert(schema.evaluations).values({
    companyId: agent.companyId,
    agentId: agentId,
    periodType,
    periodStart,
    periodEnd,
    overallScore: String(overallScore),
    tasksCompleted: completedTasks.length,
    tasksFailed: failedTasks.length,
    tokensUsed: totalTokens,
    costIncurred: String(totalCost),
    recommendations: [
      successRate < 0.8 ? 'Consider improving task execution reliability' : 'Maintain current performance',
      totalCost > 10 ? 'Monitor costs closely' : 'Cost efficiency is good',
    ],
  });

  // Update agent performance score
  await db
    .update(schema.agents)
    .set({
      performanceScore: String(overallScore),
    })
    .where(eq(schema.agents.id, agentId));
}
