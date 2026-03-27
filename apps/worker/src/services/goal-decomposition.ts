import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { eq, and, inArray, sql } from 'drizzle-orm';
import * as schema from '@1person/core/db';
import { callLLM, type LLMMessage } from '../lib/llm';
import { agentLogger } from '../lib/logger';
import { createSubtask, addTaskDependency, buildTaskGraph } from './task-graph';
import { searchMemories } from './memory';

const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/oneperson';
const client = postgres(DATABASE_URL);
const db = drizzle(client, { schema });

const logger = agentLogger.child({ service: 'goal-decomposition' });

// Decomposed task definition
export interface DecomposedTask {
  id: string; // Temporary ID for referencing
  title: string;
  description: string;
  type: string;
  priority: 'critical' | 'high' | 'medium' | 'low';
  estimatedEffort: 'trivial' | 'small' | 'medium' | 'large' | 'complex';
  requiredCapabilities: string[];
  dependsOn: string[]; // Reference IDs of other decomposed tasks
  suggestedAgentRole?: string;
  acceptanceCriteria?: string[];
}

// Goal decomposition result
export interface DecompositionResult {
  goalId: string;
  originalGoal: string;
  tasks: DecomposedTask[];
  totalEstimatedEffort: string;
  criticalPath: string[];
  risks: string[];
  recommendations: string[];
}

// Goal input for decomposition
export interface GoalInput {
  companyId: string;
  title: string;
  description: string;
  deadline?: Date;
  priority?: 'critical' | 'high' | 'medium' | 'low';
  context?: string;
  constraints?: string[];
  createdByUserId?: string;
  createdByAgentId?: string;
}

// Decompose a high-level goal into tasks using LLM
export async function decomposeGoal(goal: GoalInput): Promise<DecompositionResult> {
  logger.info('Decomposing goal', { title: goal.title, companyId: goal.companyId });

  // Get available agents and their capabilities
  const agents = await db.query.agents.findMany({
    where: eq(schema.agents.companyId, goal.companyId),
  });

  const agentCapabilities = agents.map(a => ({
    id: a.id,
    name: a.name,
    role: a.role,
    capabilities: (a.capabilities as string[]) || [],
    status: a.status,
  }));

  // Get relevant memories/learnings from past similar goals
  let pastLearnings: string[] = [];
  try {
    // Search for relevant past experiences if we have an agent to query
    if (agents.length > 0) {
      const memories = await searchMemories(agents[0].id, goal.title + ' ' + goal.description, {
        types: ['strategy', 'failure_lesson'],
        limit: 3,
      });
      pastLearnings = memories.map(m => `${m.type}: ${m.title} - ${m.summary || m.content.slice(0, 100)}`);
    }
  } catch {
    // Continue without past learnings if search fails
  }

  // Build the decomposition prompt
  const decompositionPrompt = buildDecompositionPrompt(goal, agentCapabilities, pastLearnings);

  const messages: LLMMessage[] = [
    {
      role: 'system',
      content: `You are an expert project manager and task decomposition specialist.
Your job is to break down high-level business goals into concrete, actionable tasks.

Key principles:
1. Tasks should be atomic and independently executable
2. Each task should have clear acceptance criteria
3. Dependencies should form a valid DAG (no cycles)
4. Consider parallelization opportunities
5. Estimate effort realistically
6. Match tasks to available agent capabilities

Output must be valid JSON.`,
    },
    {
      role: 'user',
      content: decompositionPrompt,
    },
  ];

  try {
    const response = await callLLM(messages, { temperature: 0.4 });

    // Parse the JSON response
    const jsonMatch = response.content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('No valid JSON found in response');
    }

    const parsed = JSON.parse(jsonMatch[0]) as {
      tasks: DecomposedTask[];
      totalEstimatedEffort: string;
      criticalPath: string[];
      risks: string[];
      recommendations: string[];
    };

    // Validate the decomposition
    validateDecomposition(parsed.tasks);

    logger.info('Goal decomposed successfully', {
      title: goal.title,
      taskCount: parsed.tasks.length,
    });

    return {
      goalId: '', // Will be set when goal task is created
      originalGoal: goal.title,
      tasks: parsed.tasks,
      totalEstimatedEffort: parsed.totalEstimatedEffort || 'Unknown',
      criticalPath: parsed.criticalPath || [],
      risks: parsed.risks || [],
      recommendations: parsed.recommendations || [],
    };
  } catch (error) {
    logger.error('Goal decomposition failed', { error: String(error), goal: goal.title });
    throw error;
  }
}

// Build the prompt for goal decomposition
function buildDecompositionPrompt(
  goal: GoalInput,
  agents: Array<{ id: string; name: string; role: string; capabilities: string[]; status: string }>,
  pastLearnings: string[]
): string {
  const activeAgents = agents.filter(a => a.status === 'active');

  return `Please decompose this business goal into actionable tasks:

## Goal
Title: ${goal.title}
Description: ${goal.description}
${goal.deadline ? `Deadline: ${goal.deadline.toISOString()}` : ''}
${goal.priority ? `Priority: ${goal.priority}` : ''}
${goal.context ? `Context: ${goal.context}` : ''}
${goal.constraints?.length ? `Constraints:\n${goal.constraints.map(c => `- ${c}`).join('\n')}` : ''}

## Available Agents
${activeAgents.length > 0
    ? activeAgents.map(a => `- ${a.name} (${a.role}): ${a.capabilities.join(', ')}`).join('\n')
    : 'No agents currently available - tasks will be queued for future assignment'}

${pastLearnings.length > 0 ? `## Past Learnings\n${pastLearnings.map(l => `- ${l}`).join('\n')}` : ''}

## Output Format
Return a JSON object with this structure:
{
  "tasks": [
    {
      "id": "task-1",
      "title": "Clear, actionable task title",
      "description": "Detailed description of what needs to be done",
      "type": "research|content|outreach|analysis|development|communication|review|other",
      "priority": "critical|high|medium|low",
      "estimatedEffort": "trivial|small|medium|large|complex",
      "requiredCapabilities": ["capability1", "capability2"],
      "dependsOn": [],
      "suggestedAgentRole": "Role that should handle this",
      "acceptanceCriteria": ["Criterion 1", "Criterion 2"]
    }
  ],
  "totalEstimatedEffort": "e.g., 2-3 days",
  "criticalPath": ["task-1", "task-3", "task-5"],
  "risks": ["Risk 1", "Risk 2"],
  "recommendations": ["Recommendation 1", "Recommendation 2"]
}

Important:
- Task IDs should be sequential (task-1, task-2, etc.)
- dependsOn should reference task IDs from this list only
- No circular dependencies
- Break down large tasks into smaller ones (max 4 hours of work per task)
- Consider parallel execution opportunities`;
}

// Validate decomposition for correctness
function validateDecomposition(tasks: DecomposedTask[]): void {
  const taskIds = new Set(tasks.map(t => t.id));

  // Check for invalid dependencies
  for (const task of tasks) {
    for (const depId of task.dependsOn) {
      if (!taskIds.has(depId)) {
        throw new Error(`Task ${task.id} has invalid dependency: ${depId}`);
      }
      if (depId === task.id) {
        throw new Error(`Task ${task.id} depends on itself`);
      }
    }
  }

  // Check for cycles using DFS
  const visited = new Set<string>();
  const recursionStack = new Set<string>();

  function hasCycle(taskId: string): boolean {
    if (recursionStack.has(taskId)) return true;
    if (visited.has(taskId)) return false;

    visited.add(taskId);
    recursionStack.add(taskId);

    const task = tasks.find(t => t.id === taskId);
    if (task) {
      for (const depId of task.dependsOn) {
        if (hasCycle(depId)) return true;
      }
    }

    recursionStack.delete(taskId);
    return false;
  }

  for (const task of tasks) {
    if (hasCycle(task.id)) {
      throw new Error('Decomposition contains circular dependencies');
    }
  }
}

// Create tasks in database from decomposition
export async function createTasksFromDecomposition(
  decomposition: DecompositionResult,
  goal: GoalInput
): Promise<{
  rootTaskId: string;
  createdTaskIds: string[];
  taskIdMap: Map<string, string>; // Maps temporary IDs to actual UUIDs
}> {
  logger.info('Creating tasks from decomposition', {
    goal: goal.title,
    taskCount: decomposition.tasks.length,
  });

  // Create the root goal task
  const [rootTask] = await db
    .insert(schema.tasks)
    .values({
      companyId: goal.companyId,
      title: goal.title,
      description: goal.description,
      type: 'goal',
      priority: goal.priority || 'medium',
      status: 'pending',
      deadline: goal.deadline,
      createdByUserId: goal.createdByUserId,
      createdByAgentId: goal.createdByAgentId,
      depth: 0,
    })
    .returning();

  const taskIdMap = new Map<string, string>();
  const createdTaskIds: string[] = [rootTask.id];

  // Get available agents for assignment
  const agents = await db.query.agents.findMany({
    where: and(
      eq(schema.agents.companyId, goal.companyId),
      eq(schema.agents.status, 'active')
    ),
  });

  // Sort tasks by dependency order (topological sort)
  const sortedTasks = topologicalSort(decomposition.tasks);

  // Create tasks in order
  for (const task of sortedTasks) {
    // Find best agent for this task
    const assignedAgent = findBestAgent(agents, task);

    // Resolve dependencies to actual IDs
    const resolvedDeps = task.dependsOn
      .map(depId => taskIdMap.get(depId))
      .filter((id): id is string => id !== undefined);

    // Create the task
    const subtaskId = await createSubtask(rootTask.id, {
      title: task.title,
      description: task.description + (task.acceptanceCriteria?.length
        ? '\n\nAcceptance Criteria:\n' + task.acceptanceCriteria.map(c => `- ${c}`).join('\n')
        : ''),
      type: task.type,
      priority: task.priority,
      assignedAgentId: assignedAgent?.id,
      dependencies: resolvedDeps,
    });

    taskIdMap.set(task.id, subtaskId);
    createdTaskIds.push(subtaskId);
  }

  // Update root task with metadata
  await db
    .update(schema.tasks)
    .set({
      rootTaskId: rootTask.id,
      input: {
        type: 'goal_decomposition',
        data: {
          decomposition: {
            totalEstimatedEffort: decomposition.totalEstimatedEffort,
            criticalPath: decomposition.criticalPath,
            risks: decomposition.risks,
            recommendations: decomposition.recommendations,
          },
        },
      },
    })
    .where(eq(schema.tasks.id, rootTask.id));

  logger.info('Tasks created from decomposition', {
    rootTaskId: rootTask.id,
    createdCount: createdTaskIds.length,
  });

  return {
    rootTaskId: rootTask.id,
    createdTaskIds,
    taskIdMap,
  };
}

// Topological sort for dependency ordering
function topologicalSort(tasks: DecomposedTask[]): DecomposedTask[] {
  const sorted: DecomposedTask[] = [];
  const visited = new Set<string>();
  const taskMap = new Map(tasks.map(t => [t.id, t]));

  function visit(taskId: string) {
    if (visited.has(taskId)) return;
    visited.add(taskId);

    const task = taskMap.get(taskId);
    if (task) {
      // Visit dependencies first
      for (const depId of task.dependsOn) {
        visit(depId);
      }
      sorted.push(task);
    }
  }

  for (const task of tasks) {
    visit(task.id);
  }

  return sorted;
}

// Find the best agent for a task based on capabilities
function findBestAgent(
  agents: Array<typeof schema.agents.$inferSelect>,
  task: DecomposedTask
): typeof schema.agents.$inferSelect | undefined {
  if (agents.length === 0) return undefined;

  // Score each agent based on capability match
  const scored = agents.map(agent => {
    const agentCapabilities = (agent.capabilities as string[]) || [];
    const matchingCapabilities = task.requiredCapabilities.filter(cap =>
      agentCapabilities.some(ac =>
        ac.toLowerCase().includes(cap.toLowerCase()) ||
        cap.toLowerCase().includes(ac.toLowerCase())
      )
    );

    // Also consider role match
    const roleMatch = task.suggestedAgentRole &&
      agent.role.toLowerCase().includes(task.suggestedAgentRole.toLowerCase())
      ? 1 : 0;

    return {
      agent,
      score: matchingCapabilities.length + roleMatch,
    };
  });

  // Sort by score and return best match
  scored.sort((a, b) => b.score - a.score);

  // Only assign if there's some capability match
  if (scored[0].score > 0) {
    return scored[0].agent;
  }

  // Fall back to first available agent if no match
  return agents[0];
}

// Re-decompose a failed or blocked task
export async function redecomposeTask(
  taskId: string,
  reason: string
): Promise<DecompositionResult | null> {
  logger.info('Re-decomposing task', { taskId, reason });

  const task = await db.query.tasks.findFirst({
    where: eq(schema.tasks.id, taskId),
    with: { company: true },
  });

  if (!task) {
    logger.warn('Task not found for re-decomposition', { taskId });
    return null;
  }

  // Create a new goal from the failed task
  const goal: GoalInput = {
    companyId: task.companyId,
    title: `Retry: ${task.title}`,
    description: `${task.description}\n\nPrevious attempt failed: ${reason}\n\nPlease decompose this into smaller, more manageable tasks.`,
    priority: task.priority as GoalInput['priority'],
    context: `This is a retry of a previously failed task. The original approach did not work. Consider alternative strategies.`,
  };

  try {
    const result = await decomposeGoal(goal);
    return result;
  } catch (error) {
    logger.error('Re-decomposition failed', { taskId, error: String(error) });
    return null;
  }
}

// Analyze dependencies automatically
export async function analyzeDependencies(
  tasks: Array<{ id: string; title: string; description: string; type: string }>
): Promise<Array<{ taskId: string; dependsOn: string[] }>> {
  logger.info('Analyzing task dependencies', { taskCount: tasks.length });

  const prompt = `Analyze these tasks and determine their dependencies.

Tasks:
${tasks.map(t => `- ID: ${t.id}\n  Title: ${t.title}\n  Description: ${t.description}\n  Type: ${t.type}`).join('\n\n')}

For each task, determine which other tasks (if any) it depends on.
A task depends on another if it needs the output or completion of that task before it can start.

Return a JSON array:
[
  { "taskId": "task-id", "dependsOn": ["dependency-id-1", "dependency-id-2"] },
  ...
]

Rules:
- Only include valid task IDs from the list above
- No circular dependencies
- A task cannot depend on itself
- Consider logical workflow order`;

  const messages: LLMMessage[] = [
    {
      role: 'system',
      content: 'You are an expert at analyzing task workflows and dependencies. Output valid JSON only.',
    },
    { role: 'user', content: prompt },
  ];

  try {
    const response = await callLLM(messages, { temperature: 0.3 });
    const jsonMatch = response.content.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
  } catch (error) {
    logger.error('Dependency analysis failed', { error: String(error) });
  }

  // Return empty dependencies if analysis fails
  return tasks.map(t => ({ taskId: t.id, dependsOn: [] }));
}

// Suggest task decomposition for a complex task
export async function suggestDecomposition(
  task: { title: string; description: string; type: string },
  depth: number = 1
): Promise<DecomposedTask[]> {
  if (depth > 3) {
    // Prevent infinite recursion
    return [];
  }

  const prompt = `This task appears to be complex. Suggest how to break it down into smaller subtasks.

Task:
Title: ${task.title}
Description: ${task.description}
Type: ${task.type}

Return a JSON array of subtasks:
[
  {
    "id": "subtask-1",
    "title": "Subtask title",
    "description": "Subtask description",
    "type": "type",
    "priority": "medium",
    "estimatedEffort": "small",
    "requiredCapabilities": [],
    "dependsOn": []
  }
]

Break down only if the task would take more than 4 hours.
Return an empty array [] if the task is already atomic enough.`;

  const messages: LLMMessage[] = [
    {
      role: 'system',
      content: 'You are a task decomposition expert. Only break down complex tasks. Return valid JSON.',
    },
    { role: 'user', content: prompt },
  ];

  try {
    const response = await callLLM(messages, { temperature: 0.3 });
    const jsonMatch = response.content.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      const subtasks = JSON.parse(jsonMatch[0]) as DecomposedTask[];
      return subtasks;
    }
  } catch (error) {
    logger.error('Decomposition suggestion failed', { error: String(error) });
  }

  return [];
}

// Get critical path through task graph
export async function getCriticalPath(rootTaskId: string): Promise<{
  path: string[];
  totalDuration: string;
}> {
  const graph = await buildTaskGraph(rootTaskId);

  // Simple critical path: longest path through the graph
  const distances = new Map<string, number>();
  const previous = new Map<string, string | null>();

  // Initialize
  for (const [id, node] of graph.nodes) {
    distances.set(id, node.dependencies.length === 0 ? 0 : -Infinity);
    previous.set(id, null);
  }

  // Topological order processing
  const processed = new Set<string>();
  const toProcess = [...graph.nodes.keys()];

  while (toProcess.length > 0) {
    // Find a node with all dependencies processed
    const idx = toProcess.findIndex(id => {
      const node = graph.nodes.get(id)!;
      return node.dependencies.every(dep => processed.has(dep) || !graph.nodes.has(dep));
    });

    if (idx === -1) break;

    const nodeId = toProcess.splice(idx, 1)[0];
    const node = graph.nodes.get(nodeId)!;
    processed.add(nodeId);

    // Update distances to dependents
    for (const dependentId of node.dependents) {
      const newDist = distances.get(nodeId)! + 1;
      if (newDist > distances.get(dependentId)!) {
        distances.set(dependentId, newDist);
        previous.set(dependentId, nodeId);
      }
    }
  }

  // Find the node with maximum distance
  let maxDist = -1;
  let endNode: string | null = null;

  for (const [id, dist] of distances) {
    if (dist > maxDist) {
      maxDist = dist;
      endNode = id;
    }
  }

  // Reconstruct path
  const path: string[] = [];
  let current = endNode;
  while (current) {
    path.unshift(current);
    current = previous.get(current) || null;
  }

  return {
    path,
    totalDuration: `${path.length} tasks in sequence`,
  };
}
