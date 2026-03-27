import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { eq, and, inArray } from 'drizzle-orm';
import * as schema from '@1person/core/db';
import { callLLM, type LLMMessage, type AgentContext } from '../lib/llm';
import { agentLogger } from '../lib/logger';
import { queueTaskExecution, queueNotification } from '../lib/queue';

const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/oneperson';
const client = postgres(DATABASE_URL);
const db = drizzle(client, { schema });

export interface CollaborationTask {
  id: string;
  mainTaskId: string;
  companyId: string;
  coordinatorAgentId: string;
  participants: Array<{
    agentId: string;
    role: string;
    subtaskId?: string;
    status: 'pending' | 'assigned' | 'in_progress' | 'completed' | 'failed';
  }>;
  status: 'planning' | 'executing' | 'reviewing' | 'completed' | 'failed';
  plan: {
    subtasks: Array<{
      id: string;
      title: string;
      description: string;
      assignedAgentId?: string;
      dependencies: string[];
      priority: number;
    }>;
    strategy: string;
  };
}

export interface AgentCapabilityMatch {
  agentId: string;
  agentName: string;
  role: string;
  matchScore: number;
  relevantCapabilities: string[];
}

// Find best agents for a task based on capabilities
export async function findBestAgentsForTask(
  companyId: string,
  taskDescription: string,
  requiredCapabilities: string[],
  excludeAgentIds: string[] = []
): Promise<AgentCapabilityMatch[]> {
  const logger = agentLogger.child({ companyId });

  // Get all available agents
  const agents = await db.query.agents.findMany({
    where: and(
      eq(schema.agents.companyId, companyId),
      eq(schema.agents.status, 'ready')
    ),
  });

  // Filter and score agents
  const matches: AgentCapabilityMatch[] = [];

  for (const agent of agents) {
    if (excludeAgentIds.includes(agent.id)) continue;

    const capabilities = (agent.capabilities || []) as Array<{
      name: string;
      level: string;
      description: string;
    }>;

    const capabilityNames = capabilities.map((c) => c.name.toLowerCase());
    const relevantCapabilities: string[] = [];
    let matchScore = 0;

    for (const required of requiredCapabilities) {
      const requiredLower = required.toLowerCase();
      for (const cap of capabilities) {
        if (cap.name.toLowerCase().includes(requiredLower) ||
            (cap.description && cap.description.toLowerCase().includes(requiredLower))) {
          relevantCapabilities.push(cap.name);
          matchScore += parseInt(cap.level) || 50;
        }
      }
    }

    // Role-based bonus
    const roleLower = agent.role.toLowerCase();
    if (taskDescription.toLowerCase().includes(roleLower)) {
      matchScore += 20;
    }

    if (matchScore > 0 || relevantCapabilities.length > 0) {
      matches.push({
        agentId: agent.id,
        agentName: agent.name,
        role: agent.role,
        matchScore: relevantCapabilities.length > 0 ? matchScore / relevantCapabilities.length : 0,
        relevantCapabilities,
      });
    }
  }

  // Sort by match score
  matches.sort((a, b) => b.matchScore - a.matchScore);

  logger.info('Found matching agents', {
    taskDescription: taskDescription.slice(0, 50),
    matchCount: matches.length,
  });

  return matches;
}

// Plan a collaborative task
export async function planCollaborativeTask(
  mainTaskId: string,
  coordinatorAgentId: string
): Promise<CollaborationTask> {
  const logger = agentLogger.child({ mainTaskId, coordinatorAgentId });
  logger.info('Planning collaborative task');

  // Get main task
  const mainTask = await db.query.tasks.findFirst({
    where: eq(schema.tasks.id, mainTaskId),
  });

  if (!mainTask) {
    throw new Error(`Task not found: ${mainTaskId}`);
  }

  // Get coordinator agent
  const coordinator = await db.query.agents.findFirst({
    where: eq(schema.agents.id, coordinatorAgentId),
    with: { company: true },
  });

  if (!coordinator) {
    throw new Error(`Coordinator agent not found: ${coordinatorAgentId}`);
  }

  // Get available agents
  const availableAgents = await db.query.agents.findMany({
    where: and(
      eq(schema.agents.companyId, coordinator.companyId),
      eq(schema.agents.status, 'ready')
    ),
  });

  // Use LLM to plan the collaboration
  const agentProfiles = availableAgents.map((a) => ({
    id: a.id,
    name: a.name,
    role: a.role,
    capabilities: (a.capabilities || []) as Array<{ name: string; level: string }>,
  }));

  const messages: LLMMessage[] = [
    {
      role: 'system',
      content: `You are a task planning coordinator. Break down complex tasks into subtasks and assign them to the most suitable agents based on their roles and capabilities.`,
    },
    {
      role: 'user',
      content: `Main Task:
Title: ${mainTask.title}
Description: ${mainTask.description || 'No description'}
Type: ${mainTask.type}

Available Agents:
${JSON.stringify(agentProfiles, null, 2)}

Create a collaboration plan in JSON format:
{
  "strategy": "Brief description of the collaboration approach",
  "subtasks": [
    {
      "id": "subtask_1",
      "title": "Subtask title",
      "description": "What needs to be done",
      "assignedAgentId": "agent_id or null if not assigned",
      "assignedReason": "Why this agent was chosen",
      "dependencies": ["subtask_ids this depends on"],
      "priority": 1
    }
  ]
}

Assign tasks based on agent capabilities. Use null for assignedAgentId if no suitable agent is found.`,
    },
  ];

  let plan: CollaborationTask['plan'] = {
    subtasks: [],
    strategy: 'Sequential execution',
  };

  try {
    const response = await callLLM(messages, { temperature: 0.3 });
    const jsonMatch = response.content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      plan = {
        strategy: parsed.strategy || 'Sequential execution',
        subtasks: (parsed.subtasks || []).map((s: {
          id?: string;
          title: string;
          description?: string;
          assignedAgentId?: string;
          dependencies?: string[];
          priority?: number;
        }, i: number) => ({
          id: s.id || `subtask_${i + 1}`,
          title: s.title,
          description: s.description || s.title,
          assignedAgentId: s.assignedAgentId || null,
          dependencies: s.dependencies || [],
          priority: s.priority || i + 1,
        })),
      };
    }
  } catch (error) {
    logger.error('Failed to plan collaboration', { error: String(error) });
    // Fallback: single subtask assigned to coordinator
    plan = {
      strategy: 'Direct execution by coordinator',
      subtasks: [
        {
          id: 'subtask_1',
          title: mainTask.title,
          description: mainTask.description || mainTask.title,
          assignedAgentId: coordinatorAgentId,
          dependencies: [],
          priority: 1,
        },
      ],
    };
  }

  // Build participants list
  const participants = plan.subtasks
    .filter((s) => s.assignedAgentId)
    .map((s) => {
      const agent = availableAgents.find((a) => a.id === s.assignedAgentId);
      return {
        agentId: s.assignedAgentId!,
        role: agent?.role || 'unknown',
        subtaskId: s.id,
        status: 'pending' as const,
      };
    });

  const collaboration: CollaborationTask = {
    id: `collab_${Date.now()}`,
    mainTaskId,
    companyId: coordinator.companyId,
    coordinatorAgentId,
    participants,
    status: 'planning',
    plan,
  };

  logger.info('Collaboration plan created', {
    subtaskCount: plan.subtasks.length,
    participantCount: participants.length,
    strategy: plan.strategy,
  });

  return collaboration;
}

// Execute a collaborative task
export async function executeCollaborativeTask(
  collaboration: CollaborationTask
): Promise<{ success: boolean; results: Array<{ subtaskId: string; success: boolean; output?: string }> }> {
  const logger = agentLogger.child({
    collaborationId: collaboration.id,
    mainTaskId: collaboration.mainTaskId,
  });

  logger.info('Starting collaborative execution', {
    strategy: collaboration.plan.strategy,
    subtasks: collaboration.plan.subtasks.length,
  });

  const results: Array<{ subtaskId: string; success: boolean; output?: string }> = [];

  // Sort subtasks by priority and dependencies
  const sortedSubtasks = [...collaboration.plan.subtasks].sort((a, b) => {
    // First by dependency count (fewer deps first)
    const depDiff = a.dependencies.length - b.dependencies.length;
    if (depDiff !== 0) return depDiff;
    // Then by priority
    return a.priority - b.priority;
  });

  const completedSubtasks = new Set<string>();

  for (const subtask of sortedSubtasks) {
    // Check if dependencies are met
    const unmetDeps = subtask.dependencies.filter((d) => !completedSubtasks.has(d));
    if (unmetDeps.length > 0) {
      logger.warn('Subtask has unmet dependencies', {
        subtaskId: subtask.id,
        unmetDeps,
      });
      // Still try to execute but note the issue
    }

    if (!subtask.assignedAgentId) {
      logger.warn('Subtask has no assigned agent', { subtaskId: subtask.id });
      results.push({ subtaskId: subtask.id, success: false, output: 'No agent assigned' });
      continue;
    }

    // Create subtask in database
    const [dbSubtask] = await db
      .insert(schema.tasks)
      .values({
        companyId: collaboration.companyId,
        assignedAgentId: subtask.assignedAgentId,
        title: subtask.title,
        description: subtask.description,
        type: 'collaboration_subtask',
        status: 'pending',
        priority: 'medium',
        metadata: {
          parentTaskId: collaboration.mainTaskId,
          collaborationId: collaboration.id,
          subtaskId: subtask.id,
        },
      })
      .returning();

    // Queue the subtask for execution
    await queueTaskExecution({
      taskId: dbSubtask.id,
      agentId: subtask.assignedAgentId,
      priority: subtask.priority,
    });

    logger.info('Subtask queued', {
      subtaskId: subtask.id,
      dbTaskId: dbSubtask.id,
      agentId: subtask.assignedAgentId,
    });

    // Mark as completed for dependency tracking
    completedSubtasks.add(subtask.id);

    results.push({
      subtaskId: subtask.id,
      success: true,
      output: `Task queued: ${dbSubtask.id}`,
    });
  }

  // Update main task status
  await db
    .update(schema.tasks)
    .set({
      status: 'in_progress',
      metadata: {
        collaborationId: collaboration.id,
        subtaskCount: collaboration.plan.subtasks.length,
      },
    })
    .where(eq(schema.tasks.id, collaboration.mainTaskId));

  // Notify coordinator
  await queueNotification({
    type: 'collaboration_started',
    userId: '', // Will be filled by company owner
    companyId: collaboration.companyId,
    title: 'Collaboration Started',
    message: `${collaboration.plan.subtasks.length} subtasks distributed to ${collaboration.participants.length} agents`,
    metadata: { collaborationId: collaboration.id },
  });

  logger.info('Collaborative execution initiated', {
    successfulAssignments: results.filter((r) => r.success).length,
    totalSubtasks: results.length,
  });

  return {
    success: results.every((r) => r.success),
    results,
  };
}

// Agent communication/handoff
export async function agentHandoff(
  fromAgentId: string,
  toAgentId: string,
  context: {
    taskId: string;
    message: string;
    data?: Record<string, unknown>;
  }
): Promise<{ success: boolean; response?: string }> {
  const logger = agentLogger.child({
    fromAgentId,
    toAgentId,
    taskId: context.taskId,
  });

  logger.info('Agent handoff initiated');

  // Get both agents
  const [fromAgent, toAgent] = await Promise.all([
    db.query.agents.findFirst({ where: eq(schema.agents.id, fromAgentId) }),
    db.query.agents.findFirst({ where: eq(schema.agents.id, toAgentId) }),
  ]);

  if (!fromAgent || !toAgent) {
    throw new Error('One or both agents not found');
  }

  // Log the handoff
  await db.insert(schema.messages).values({
    companyId: fromAgent.companyId,
    agentId: toAgentId,
    role: 'system',
    content: `Handoff from ${fromAgent.name}: ${context.message}`,
    metadata: {
      handoff: true,
      fromAgentId,
      taskId: context.taskId,
      data: context.data,
    },
  });

  // Notify the receiving agent (through their task queue)
  await queueNotification({
    type: 'agent_handoff',
    userId: '',
    companyId: fromAgent.companyId,
    title: 'Task Handoff',
    message: `${fromAgent.name} handed off a task to ${toAgent.name}`,
    metadata: {
      fromAgentId,
      toAgentId,
      taskId: context.taskId,
    },
  });

  logger.info('Handoff completed');

  return {
    success: true,
    response: `Handoff to ${toAgent.name} completed`,
  };
}

// Request help from another agent
export async function requestAgentHelp(
  requestingAgentId: string,
  helpType: string,
  context: {
    taskId?: string;
    question: string;
    urgency: 'low' | 'medium' | 'high';
  }
): Promise<{ helperId?: string; response?: string }> {
  const logger = agentLogger.child({ requestingAgentId, helpType });
  logger.info('Agent requesting help', { urgency: context.urgency });

  const agent = await db.query.agents.findFirst({
    where: eq(schema.agents.id, requestingAgentId),
  });

  if (!agent) {
    throw new Error(`Agent not found: ${requestingAgentId}`);
  }

  // Find agents that can help
  const helpers = await findBestAgentsForTask(
    agent.companyId,
    context.question,
    [helpType],
    [requestingAgentId]
  );

  if (helpers.length === 0) {
    return { response: 'No suitable helper agents found' };
  }

  const helper = helpers[0];

  // Ask the helper agent
  const helperAgent = await db.query.agents.findFirst({
    where: eq(schema.agents.id, helper.agentId),
    with: { company: true },
  });

  if (!helperAgent) {
    return { response: 'Helper agent not available' };
  }

  const messages: LLMMessage[] = [
    {
      role: 'system',
      content: `You are ${helperAgent.name}, a ${helperAgent.role} AI agent.
Another agent (${agent.name}, ${agent.role}) is requesting your help.
Provide helpful, actionable assistance based on your expertise.`,
    },
    {
      role: 'user',
      content: `Help request from ${agent.name}:

Type: ${helpType}
Urgency: ${context.urgency}
Question: ${context.question}

Please provide your expert assistance.`,
    },
  ];

  try {
    const response = await callLLM(messages, { temperature: 0.5 });

    // Log the help interaction
    await db.insert(schema.messages).values({
      companyId: agent.companyId,
      agentId: requestingAgentId,
      role: 'system',
      content: `Help from ${helperAgent.name}: ${response.content}`,
      metadata: {
        helpRequest: true,
        helperId: helper.agentId,
        helpType,
      },
    });

    logger.info('Help provided', {
      helperId: helper.agentId,
      responseLength: response.content.length,
    });

    return {
      helperId: helper.agentId,
      response: response.content,
    };
  } catch (error) {
    logger.error('Failed to get help', { error: String(error) });
    return { response: 'Failed to get assistance' };
  }
}
