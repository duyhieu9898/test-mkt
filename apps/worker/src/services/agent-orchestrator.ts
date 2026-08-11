/**
 * Agent Orchestrator - Central coordination layer for all agent activities
 *
 * This is the brain that coordinates:
 * - Receiving objectives from CEO
 * - Matching tasks to agents based on capabilities
 * - Managing workload distribution
 * - Handling agent spawning/retiring
 * - Monitoring execution and reassigning if needed
 */

import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { eq, and, desc, inArray, sql, or } from 'drizzle-orm';
import * as schema from '@1person/core/db';
import { agentLogger } from '../lib/logger';

// Import all integrated services
import { getCompanyState } from './company-state-engine';
import { decomposeGoal, createTasksFromDecomposition, type GoalInput } from './goal-decomposition';
import { buildTaskGraph, type TaskGraph } from './task-graph';
import { executeTask } from './agent-runtime';
import { delegateTask, updateAgentRelationship } from './agent-communication';
import { storeMemory, createMemoryFromTask } from './memory';
import { spawnAgent, determineAgentToSpawn, retireUnderperformingAgents } from './auto-spawn';
import { runSelfImprovementCycle } from './self-improvement';

const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/oneperson';
const client = postgres(DATABASE_URL);
const db = drizzle(client, { schema });

const logger = agentLogger.child({ service: 'orchestrator' });

// Orchestration context
export interface OrchestrationContext {
  companyId: string;
  initiator: 'user' | 'ceo_agent' | 'system';
  priority: 'critical' | 'high' | 'normal' | 'low';
  deadline?: Date;
}

// Agent assignment result
export interface AgentAssignment {
  taskId: string;
  agentId: string;
  agentName: string;
  matchScore: number;
  reason: string;
}

// Orchestration result
export interface OrchestrationResult {
  success: boolean;
  objectiveId?: string;
  taskGraphId?: string;
  assignments: AgentAssignment[];
  warnings: string[];
  errors: string[];
}

// Workload status
export interface WorkloadStatus {
  totalCapacity: number;
  usedCapacity: number;
  availableCapacity: number;
  utilizationPercent: number;
  overloadedAgents: string[];
  idleAgents: string[];
  recommendations: string[];
}

/**
 * Main orchestration entry point - Process a high-level objective
 */
export async function orchestrateObjective(
  objective: GoalInput,
  context: OrchestrationContext
): Promise<OrchestrationResult> {
  logger.info('Orchestrating objective', {
    title: objective.title,
    companyId: context.companyId,
    initiator: context.initiator,
  });

  const result: OrchestrationResult = {
    success: false,
    assignments: [],
    warnings: [],
    errors: [],
  };

  try {
    // Step 1: Read company state for decision making
    const companyState = await getCompanyState(context.companyId);
    logger.debug('Company state loaded', { healthScore: companyState.healthScore });

    // Check if we have capacity
    const workload = await getWorkloadStatus(context.companyId);
    if (workload.utilizationPercent > 95) {
      result.warnings.push('High workload detected, may need to spawn additional agents');

      // Auto-spawn if enabled
      const determination = await determineAgentToSpawn(context.companyId);
      if (determination.shouldSpawn) {
        const spawnResult = await spawnAgent({
          companyId: context.companyId,
          reason: determination.reason,
          templateKey: determination.templateKey,
        });
        if (spawnResult.success) {
          result.warnings.push(`Auto-spawned agent: ${spawnResult.agent?.name}`);
        }
      }
    }

    // Step 2: Decompose objective into tasks
    logger.info('Decomposing objective into tasks');
    const decomposition = await decomposeGoal(objective);

    // Step 3: Create task graph in database
    const { rootTaskId, createdTaskIds } = await createTasksFromDecomposition(
      decomposition,
      objective
    );
    result.taskGraphId = rootTaskId;

    // Step 4: Build the task graph
    const taskGraph = await buildTaskGraph(rootTaskId);
    logger.info('Task graph built', { totalTasks: taskGraph.nodes.size });

    // Step 5: Assign agents to all tasks
    const assignments = await assignAgentsToTaskGraph(taskGraph, context.companyId);
    result.assignments = assignments;

    // Log assignments
    for (const assignment of assignments) {
      logger.debug('Task assigned', {
        taskId: assignment.taskId,
        agentId: assignment.agentId,
        matchScore: assignment.matchScore,
      });
    }

    // Step 6: Notify agents via Communication Protocol
    await notifyAgentsOfAssignments(assignments, context.companyId);

    // Step 7: Create strategic objective record
    const [strategicObjective] = await db
      .insert(schema.strategicObjectives)
      .values({
        companyId: context.companyId,
        title: objective.title,
        description: objective.description,
        category: 'growth',
        status: 'active',
        progress: 0,
        taskGraphIds: [rootTaskId],
        startDate: new Date(),
        targetDate: objective.deadline,
      })
      .returning();

    result.objectiveId = strategicObjective.id;
    result.success = true;

    // Store orchestration as memory
    const ceoAgent = await db.query.agents.findFirst({
      where: and(
        eq(schema.agents.companyId, context.companyId),
        eq(schema.agents.role, 'ceo')
      ),
    });

    if (ceoAgent) {
      await storeMemory({
        agentId: ceoAgent.id,
        companyId: context.companyId,
        type: 'decision',
        title: `Orchestrated: ${objective.title}`,
        content: `Created ${createdTaskIds.length} tasks, assigned to ${assignments.length} agents`,
        importance: 'high',
        metadata: {
          tags: ['orchestration', 'objective'],
          context: { objectiveId: strategicObjective.id, taskGraphId: rootTaskId },
        },
      });
    }

    logger.info('Orchestration completed successfully', {
      objectiveId: strategicObjective.id,
      taskGraphId: rootTaskId,
      totalTasks: createdTaskIds.length,
      assignments: assignments.length,
    });

    return result;
  } catch (error) {
    logger.error('Orchestration failed', { error: String(error) });
    result.errors.push(String(error));
    return result;
  }
}

/**
 * Assign agents to all tasks in a task graph
 */
export async function assignAgentsToTaskGraph(
  taskGraph: TaskGraph,
  companyId: string
): Promise<AgentAssignment[]> {
  const assignments: AgentAssignment[] = [];

  // Get available agents
  const agents = await db.query.agents.findMany({
    where: and(
      eq(schema.agents.companyId, companyId),
      inArray(schema.agents.status, ['active', 'ready', 'idle'])
    ),
  });

  if (agents.length === 0) {
    logger.warn('No available agents for assignment');
    return assignments;
  }

  // Get current workload for each agent
  const agentWorkloads = new Map<string, number>();
  for (const agent of agents) {
    const inProgressTasks = await db.query.tasks.findMany({
      where: and(
        eq(schema.tasks.assignedAgentId, agent.id),
        inArray(schema.tasks.status, ['in_progress', 'pending', 'queued'])
      ),
    });
    agentWorkloads.set(agent.id, inProgressTasks.length);
  }

  // Assign each task to the best available agent
  for (const [taskId, node] of taskGraph.nodes) {
    // Skip if already assigned
    if (node.task.assignedAgentId) {
      const agent = agents.find(a => a.id === node.task.assignedAgentId);
      if (agent) {
        assignments.push({
          taskId,
          agentId: agent.id,
          agentName: agent.name,
          matchScore: 100,
          reason: 'Pre-assigned',
        });
        continue;
      }
    }

    // Find best agent for this task
    const bestMatch = findBestAgentForTask(node.task, agents, agentWorkloads);

    if (bestMatch) {
      // Update task assignment
      await db
        .update(schema.tasks)
        .set({ assignedAgentId: bestMatch.agentId })
        .where(eq(schema.tasks.id, taskId));

      // Update workload tracking
      agentWorkloads.set(
        bestMatch.agentId,
        (agentWorkloads.get(bestMatch.agentId) || 0) + 1
      );

      assignments.push(bestMatch);
    }
  }

  return assignments;
}

/**
 * Find the best agent for a specific task
 */
function findBestAgentForTask(
  task: typeof schema.tasks.$inferSelect,
  agents: Array<typeof schema.agents.$inferSelect>,
  workloads: Map<string, number>
): AgentAssignment | null {
  if (agents.length === 0) return null;

  const scores: Array<{
    agent: typeof schema.agents.$inferSelect;
    score: number;
    reasons: string[];
  }> = [];

  for (const agent of agents) {
    let score = 50; // Base score
    const reasons: string[] = [];

    // Factor 1: Capability match (0-30 points)
    const agentCapabilities = (agent.capabilities as string[]) || [];
    const taskType = task.type.toLowerCase();
    const capabilityMatch = agentCapabilities.some(cap =>
      cap.toLowerCase().includes(taskType) ||
      taskType.includes(cap.toLowerCase())
    );
    if (capabilityMatch) {
      score += 30;
      reasons.push('Capability match');
    }

    // Factor 2: Role match (0-20 points)
    const roleTypeMap: Record<string, string[]> = {
      marketing_manager: ['content', 'campaign', 'social'],
      sales_manager: ['outreach', 'sales', 'lead'],
      content_creator: ['content', 'writing', 'blog'],
      analyst: ['analysis', 'research', 'data'],
      support: ['support', 'customer', 'help'],
    };
    const roleMatches = roleTypeMap[agent.role] || [];
    if (roleMatches.some(r => taskType.includes(r))) {
      score += 20;
      reasons.push('Role match');
    }

    // Factor 3: Performance score (0-15 points)
    const perfScore = parseFloat(agent.performanceScore || '0');
    score += Math.min(15, perfScore * 0.15);
    if (perfScore > 80) {
      reasons.push('High performer');
    }

    // Factor 4: Current workload (-20 to +10 points)
    const currentWorkload = workloads.get(agent.id) || 0;
    if (currentWorkload === 0) {
      score += 10;
      reasons.push('Available');
    } else if (currentWorkload > 5) {
      score -= 20;
      reasons.push('Heavy workload');
    } else if (currentWorkload > 3) {
      score -= 10;
      reasons.push('Moderate workload');
    }

    // Factor 5: Priority handling
    if (task.priority === 'critical' && perfScore > 80) {
      score += 10;
      reasons.push('Critical task + high performer');
    }

    scores.push({ agent, score, reasons });
  }

  // Sort by score and get best
  scores.sort((a, b) => b.score - a.score);
  const best = scores[0];

  if (!best || best.score < 30) {
    return null;
  }

  return {
    taskId: task.id,
    agentId: best.agent.id,
    agentName: best.agent.name,
    matchScore: Math.min(100, best.score),
    reason: best.reasons.join(', '),
  };
}

/**
 * Notify agents of their new assignments via Communication Protocol
 */
async function notifyAgentsOfAssignments(
  assignments: AgentAssignment[],
  companyId: string
): Promise<void> {
  // Get CEO agent for sending delegation messages
  const ceoAgent = await db.query.agents.findFirst({
    where: and(
      eq(schema.agents.companyId, companyId),
      eq(schema.agents.role, 'ceo')
    ),
  });

  if (!ceoAgent) {
    logger.warn('No CEO agent found for delegation');
    return;
  }

  // Group assignments by agent
  const byAgent = new Map<string, AgentAssignment[]>();
  for (const assignment of assignments) {
    const existing = byAgent.get(assignment.agentId) || [];
    existing.push(assignment);
    byAgent.set(assignment.agentId, existing);
  }

  // Send delegation messages
  for (const [agentId, agentAssignments] of byAgent) {
    const tasks = await Promise.all(
      agentAssignments.map(a =>
        db.query.tasks.findFirst({ where: eq(schema.tasks.id, a.taskId) })
      )
    );

    for (const task of tasks) {
      if (!task) continue;

      await delegateTask(ceoAgent.id, agentId, {
        taskId: task.id,
        title: task.title,
        description: task.description || '',
        deadline: task.deadline || undefined,
        priority: task.priority as 'critical' | 'high' | 'medium' | 'low',
        context: `Assigned as part of strategic objective execution`,
      });
    }
  }

  logger.info('Delegation messages sent', { agentCount: byAgent.size });
}

/**
 * Get current workload status across all agents
 */
export async function getWorkloadStatus(companyId: string): Promise<WorkloadStatus> {
  const agents = await db.query.agents.findMany({
    where: and(
      eq(schema.agents.companyId, companyId),
      inArray(schema.agents.status, ['active', 'ready', 'running', 'idle'])
    ),
  });

  const tasks = await db.query.tasks.findMany({
    where: and(
      eq(schema.tasks.companyId, companyId),
      inArray(schema.tasks.status, ['in_progress', 'pending', 'queued'])
    ),
  });

  // Calculate capacity (assume 5 concurrent tasks per agent max)
  const maxTasksPerAgent = 5;
  const totalCapacity = agents.length * maxTasksPerAgent;
  const usedCapacity = tasks.length;
  const availableCapacity = Math.max(0, totalCapacity - usedCapacity);
  const utilizationPercent = totalCapacity > 0 ? (usedCapacity / totalCapacity) * 100 : 0;

  // Find overloaded and idle agents
  const agentTaskCounts = new Map<string, number>();
  for (const task of tasks) {
    if (task.assignedAgentId) {
      agentTaskCounts.set(
        task.assignedAgentId,
        (agentTaskCounts.get(task.assignedAgentId) || 0) + 1
      );
    }
  }

  const overloadedAgents: string[] = [];
  const idleAgents: string[] = [];

  for (const agent of agents) {
    const taskCount = agentTaskCounts.get(agent.id) || 0;
    if (taskCount > maxTasksPerAgent) {
      overloadedAgents.push(agent.id);
    } else if (taskCount === 0 && agent.status === 'idle') {
      idleAgents.push(agent.id);
    }
  }

  // Generate recommendations
  const recommendations: string[] = [];
  if (utilizationPercent > 80) {
    recommendations.push('Consider spawning additional agents');
  }
  if (idleAgents.length > agents.length * 0.3) {
    recommendations.push('Many idle agents - review task assignment');
  }
  if (overloadedAgents.length > 0) {
    recommendations.push('Rebalance tasks from overloaded agents');
  }

  return {
    totalCapacity,
    usedCapacity,
    availableCapacity,
    utilizationPercent,
    overloadedAgents,
    idleAgents,
    recommendations,
  };
}

/**
 * Rebalance workload across agents
 */
export async function rebalanceWorkload(companyId: string): Promise<{
  reassignments: number;
  details: string[];
}> {
  logger.info('Rebalancing workload', { companyId });

  const details: string[] = [];
  let reassignments = 0;

  const workload = await getWorkloadStatus(companyId);

  if (workload.overloadedAgents.length === 0 && workload.idleAgents.length === 0) {
    details.push('Workload is balanced');
    return { reassignments, details };
  }

  // Get idle agents
  const idleAgents = await db.query.agents.findMany({
    where: inArray(schema.agents.id, workload.idleAgents),
  });

  // Get tasks from overloaded agents
  for (const overloadedId of workload.overloadedAgents) {
    const tasks = await db.query.tasks.findMany({
      where: and(
        eq(schema.tasks.assignedAgentId, overloadedId),
        eq(schema.tasks.status, 'pending')
      ),
      orderBy: [desc(schema.tasks.priority)],
    });

    // Reassign some tasks to idle agents
    const tasksToReassign = tasks.slice(0, Math.ceil(tasks.length / 2));

    for (const task of tasksToReassign) {
      if (idleAgents.length === 0) break;

      const targetAgent = idleAgents.shift()!;

      await db
        .update(schema.tasks)
        .set({ assignedAgentId: targetAgent.id })
        .where(eq(schema.tasks.id, task.id));

      reassignments++;
      details.push(`Reassigned "${task.title}" to ${targetAgent.name}`);

      // Put agent back with lower priority
      idleAgents.push(targetAgent);
    }
  }

  logger.info('Workload rebalanced', { reassignments });
  return { reassignments, details };
}

/**
 * Monitor and handle task execution issues
 */
export async function monitorExecution(companyId: string): Promise<{
  issues: Array<{ taskId: string; issue: string; action: string }>;
}> {
  const issues: Array<{ taskId: string; issue: string; action: string }> = [];

  // Find stuck tasks (in_progress for too long)
  const stuckThreshold = new Date(Date.now() - 30 * 60 * 1000); // 30 minutes
  const stuckTasks = await db.query.tasks.findMany({
    where: and(
      eq(schema.tasks.companyId, companyId),
      eq(schema.tasks.status, 'in_progress'),
      sql`${schema.tasks.startedAt} < ${stuckThreshold}`
    ),
  });

  for (const task of stuckTasks) {
    issues.push({
      taskId: task.id,
      issue: 'Task stuck in progress',
      action: 'Monitoring - may need reassignment',
    });
  }

  // Find failed tasks that can be retried
  const failedTasks = await db.query.tasks.findMany({
    where: and(
      eq(schema.tasks.companyId, companyId),
      eq(schema.tasks.status, 'failed'),
      sql`${schema.tasks.retryCount} < ${schema.tasks.maxRetries}`
    ),
  });

  for (const task of failedTasks) {
    // Queue for retry
    await db
      .update(schema.tasks)
      .set({
        status: 'pending',
        retryCount: (task.retryCount || 0) + 1,
        errorMessage: null,
      })
      .where(eq(schema.tasks.id, task.id));

    issues.push({
      taskId: task.id,
      issue: 'Task failed - retrying',
      action: `Retry ${(task.retryCount || 0) + 1}/${task.maxRetries}`,
    });
  }

  // Find unassigned pending tasks
  const unassignedTasks = await db.query.tasks.findMany({
    where: and(
      eq(schema.tasks.companyId, companyId),
      eq(schema.tasks.status, 'pending'),
      sql`${schema.tasks.assignedAgentId} IS NULL`
    ),
    limit: 10,
  });

  if (unassignedTasks.length > 0) {
    // Try to assign
    const agents = await db.query.agents.findMany({
      where: and(
        eq(schema.agents.companyId, companyId),
        inArray(schema.agents.status, ['active', 'ready', 'idle'])
      ),
    });

    for (const task of unassignedTasks) {
      const workloads = new Map<string, number>();
      const match = findBestAgentForTask(task, agents, workloads);

      if (match) {
        await db
          .update(schema.tasks)
          .set({ assignedAgentId: match.agentId })
          .where(eq(schema.tasks.id, task.id));

        issues.push({
          taskId: task.id,
          issue: 'Unassigned task',
          action: `Assigned to ${match.agentName}`,
        });
      } else {
        issues.push({
          taskId: task.id,
          issue: 'Unassigned task - no suitable agent',
          action: 'May need to spawn new agent',
        });
      }
    }
  }

  return { issues };
}

/**
 * Execute the next batch of ready tasks
 */
export async function executeReadyTasks(companyId: string): Promise<{
  executed: number;
  results: Array<{ taskId: string; success: boolean; error?: string }>;
}> {
  logger.info('Executing ready tasks', { companyId });

  const results: Array<{ taskId: string; success: boolean; error?: string }> = [];

  // Get pending tasks with agents assigned
  const readyTasks = await db.query.tasks.findMany({
    where: and(
      eq(schema.tasks.companyId, companyId),
      eq(schema.tasks.status, 'pending'),
      sql`${schema.tasks.assignedAgentId} IS NOT NULL`
    ),
    orderBy: [
      sql`CASE ${schema.tasks.priority}
        WHEN 'critical' THEN 0
        WHEN 'high' THEN 1
        WHEN 'medium' THEN 2
        WHEN 'low' THEN 3
        ELSE 4 END`,
    ],
    limit: 5, // Process in batches
  });

  for (const task of readyTasks) {
    // Check dependencies
    if (task.dependencies && (task.dependencies as string[]).length > 0) {
      const deps = await db.query.tasks.findMany({
        where: inArray(schema.tasks.id, task.dependencies as string[]),
      });
      const allCompleted = deps.every(d => d.status === 'completed');
      if (!allCompleted) {
        continue; // Skip - dependencies not met
      }
    }

    try {
      // Execute task
      const result = await executeTask(task.id, task.assignedAgentId!);

      // Create memory from task
      await createMemoryFromTask(task.id, task.assignedAgentId!, {
        success: result.success,
        output: result.output,
        insights: result.steps,
      });

      // Update agent relationship if collaboration involved
      if (task.createdByAgentId && task.createdByAgentId !== task.assignedAgentId) {
        await updateAgentRelationship(task.createdByAgentId, task.assignedAgentId!, {
          successful: result.success,
          type: 'delegation',
        });
      }

      results.push({
        taskId: task.id,
        success: result.success,
        error: result.error,
      });
    } catch (error) {
      results.push({
        taskId: task.id,
        success: false,
        error: String(error),
      });
    }
  }

  logger.info('Batch execution completed', {
    executed: results.length,
    successful: results.filter(r => r.success).length,
  });

  return { executed: results.length, results };
}

/**
 * Run agent maintenance (evolution, retirement, improvement)
 */
export async function runAgentMaintenance(companyId: string): Promise<{
  improved: string[];
  retired: string[];
  spawned: string[];
}> {
  logger.info('Running agent maintenance', { companyId });

  const improved: string[] = [];
  const spawned: string[] = [];

  // Run self-improvement for active agents
  const agents = await db.query.agents.findMany({
    where: and(
      eq(schema.agents.companyId, companyId),
      inArray(schema.agents.status, ['active', 'ready'])
    ),
  });

  for (const agent of agents) {
    try {
      const result = await runSelfImprovementCycle(agent.id);
      if (result.appliedChanges.length > 0) {
        improved.push(agent.id);
      }
    } catch (error) {
      logger.error('Self-improvement failed for agent', {
        agentId: agent.id,
        error: String(error),
      });
    }
  }

  // Retire underperformers
  const retired = await retireUnderperformingAgents(companyId);

  // Check if we need to spawn new agents
  const determination = await determineAgentToSpawn(companyId);
  if (determination.shouldSpawn) {
    const result = await spawnAgent({
      companyId,
      reason: determination.reason,
      templateKey: determination.templateKey,
    });
    if (result.success && result.agentId) {
      spawned.push(result.agentId);
    }
  }

  logger.info('Agent maintenance completed', {
    improved: improved.length,
    retired: retired.length,
    spawned: spawned.length,
  });

  return { improved, retired, spawned };
}

/**
 * Update objective progress based on task completion
 */
export async function updateObjectiveProgress(objectiveId: string): Promise<number> {
  const objective = await db.query.strategicObjectives.findFirst({
    where: eq(schema.strategicObjectives.id, objectiveId),
  });

  if (!objective || !objective.taskGraphIds) {
    return 0;
  }

  // Calculate progress from all related task graphs
  let totalTasks = 0;
  let completedTasks = 0;

  for (const taskGraphId of objective.taskGraphIds as string[]) {
    const tasks = await db.query.tasks.findMany({
      where: or(
        eq(schema.tasks.id, taskGraphId),
        eq(schema.tasks.rootTaskId, taskGraphId)
      ),
    });

    totalTasks += tasks.length;
    completedTasks += tasks.filter(t => t.status === 'completed').length;
  }

  const progress = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

  // Update objective
  await db
    .update(schema.strategicObjectives)
    .set({
      progress,
      status: progress >= 100 ? 'achieved' : 'active',
      achievedDate: progress >= 100 ? new Date() : null,
      updatedAt: new Date(),
    })
    .where(eq(schema.strategicObjectives.id, objectiveId));

  return progress;
}
