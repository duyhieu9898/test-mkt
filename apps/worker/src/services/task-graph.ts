import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { eq, and, inArray, sql } from 'drizzle-orm';
import * as schema from '@1person/core/db';
import { agentLogger } from '../lib/logger';
import { executeTask } from './agent-runtime';
import { queueNotification } from '../lib/queue';

const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/oneperson';
const client = postgres(DATABASE_URL);
const db = drizzle(client, { schema });

const logger = agentLogger.child({ service: 'task-graph' });

// Node in the task graph
export interface TaskNode {
  id: string;
  task: typeof schema.tasks.$inferSelect;
  dependencies: string[];
  dependents: string[];
  status: 'pending' | 'ready' | 'running' | 'completed' | 'failed' | 'blocked';
  depth: number;
}

// Task Graph (DAG)
export interface TaskGraph {
  nodes: Map<string, TaskNode>;
  rootId: string;
  companyId: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  startedAt?: Date;
  completedAt?: Date;
}

// Execution options
export interface GraphExecutionOptions {
  maxConcurrency?: number;
  onTaskComplete?: (taskId: string, success: boolean) => void;
  onTaskStart?: (taskId: string) => void;
  stopOnFailure?: boolean;
}

// Build a task graph from a root task
export async function buildTaskGraph(rootTaskId: string): Promise<TaskGraph> {
  logger.info('Building task graph', { rootTaskId });

  const rootTask = await db.query.tasks.findFirst({
    where: eq(schema.tasks.id, rootTaskId),
  });

  if (!rootTask) {
    throw new Error(`Root task not found: ${rootTaskId}`);
  }

  const nodes = new Map<string, TaskNode>();

  // BFS to collect all tasks in the graph
  const queue: string[] = [rootTaskId];
  const visited = new Set<string>();

  while (queue.length > 0) {
    const taskId = queue.shift()!;
    if (visited.has(taskId)) continue;
    visited.add(taskId);

    const task = taskId === rootTaskId
      ? rootTask
      : await db.query.tasks.findFirst({ where: eq(schema.tasks.id, taskId) });

    if (!task) continue;

    // Get dependencies from taskDependencies table
    const deps = await db.query.taskDependencies.findMany({
      where: eq(schema.taskDependencies.taskId, taskId),
    });
    const dependencyIds = deps.map(d => d.dependsOnTaskId);

    // Get subtasks
    const subtasks = await db.query.tasks.findMany({
      where: eq(schema.tasks.parentTaskId, taskId),
    });
    const subtaskIds = subtasks.map(s => s.id);

    // Create node
    nodes.set(taskId, {
      id: taskId,
      task,
      dependencies: dependencyIds,
      dependents: [],
      status: mapTaskStatus(task.status),
      depth: task.depth || 0,
    });

    // Add subtasks and dependencies to queue
    for (const id of [...dependencyIds, ...subtaskIds]) {
      if (!visited.has(id)) {
        queue.push(id);
      }
    }
  }

  // Build reverse dependencies (dependents)
  for (const [nodeId, node] of nodes) {
    for (const depId of node.dependencies) {
      const depNode = nodes.get(depId);
      if (depNode) {
        depNode.dependents.push(nodeId);
      }
    }
  }

  // Validate DAG (check for cycles)
  if (hasCycle(nodes)) {
    throw new Error('Task graph contains a cycle');
  }

  // Update node statuses
  updateNodeStatuses(nodes);

  logger.info('Task graph built', {
    rootTaskId,
    totalNodes: nodes.size,
  });

  return {
    nodes,
    rootId: rootTaskId,
    companyId: rootTask.companyId,
    status: 'pending',
  };
}

// Map database task status to graph node status
function mapTaskStatus(status: string): TaskNode['status'] {
  switch (status) {
    case 'completed':
      return 'completed';
    case 'failed':
    case 'cancelled':
      return 'failed';
    case 'in_progress':
      return 'running';
    case 'pending':
    case 'queued':
    default:
      return 'pending';
  }
}

// Check if the graph has cycles (Kahn's algorithm)
function hasCycle(nodes: Map<string, TaskNode>): boolean {
  const inDegree = new Map<string, number>();
  const queue: string[] = [];

  // Initialize in-degrees
  for (const [id, node] of nodes) {
    inDegree.set(id, node.dependencies.filter(d => nodes.has(d)).length);
    if (inDegree.get(id) === 0) {
      queue.push(id);
    }
  }

  let processed = 0;

  while (queue.length > 0) {
    const nodeId = queue.shift()!;
    processed++;

    const node = nodes.get(nodeId)!;
    for (const dependentId of node.dependents) {
      const newDegree = (inDegree.get(dependentId) || 0) - 1;
      inDegree.set(dependentId, newDegree);
      if (newDegree === 0) {
        queue.push(dependentId);
      }
    }
  }

  return processed !== nodes.size;
}

// Update node statuses based on dependencies
function updateNodeStatuses(nodes: Map<string, TaskNode>): void {
  for (const [_, node] of nodes) {
    if (node.status === 'pending') {
      const allDepsCompleted = node.dependencies.every(depId => {
        const dep = nodes.get(depId);
        return dep?.status === 'completed';
      });

      const anyDepFailed = node.dependencies.some(depId => {
        const dep = nodes.get(depId);
        return dep?.status === 'failed';
      });

      if (anyDepFailed) {
        node.status = 'blocked';
      } else if (allDepsCompleted) {
        node.status = 'ready';
      }
    }
  }
}

// Get tasks ready for execution
export function getReadyTasks(graph: TaskGraph): TaskNode[] {
  const ready: TaskNode[] = [];

  for (const [_, node] of graph.nodes) {
    if (node.status === 'ready' || (node.status === 'pending' && node.dependencies.length === 0)) {
      ready.push(node);
    }
  }

  // Sort by priority and depth
  ready.sort((a, b) => {
    const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
    const aPriority = priorityOrder[a.task.priority as keyof typeof priorityOrder] ?? 2;
    const bPriority = priorityOrder[b.task.priority as keyof typeof priorityOrder] ?? 2;

    if (aPriority !== bPriority) return aPriority - bPriority;
    return a.depth - b.depth;
  });

  return ready;
}

// Execute the task graph
export async function executeTaskGraph(
  graph: TaskGraph,
  options: GraphExecutionOptions = {}
): Promise<{
  success: boolean;
  completedTasks: string[];
  failedTasks: string[];
  blockedTasks: string[];
}> {
  const { maxConcurrency = 3, onTaskComplete, onTaskStart, stopOnFailure = false } = options;

  logger.info('Starting task graph execution', {
    rootId: graph.rootId,
    totalTasks: graph.nodes.size,
    maxConcurrency,
  });

  graph.status = 'running';
  graph.startedAt = new Date();

  const completedTasks: string[] = [];
  const failedTasks: string[] = [];
  const blockedTasks: string[] = [];
  const runningTasks = new Set<string>();

  // Execute until all tasks are processed
  while (true) {
    updateNodeStatuses(graph.nodes);

    // Check if we should stop
    if (stopOnFailure && failedTasks.length > 0) {
      logger.warn('Stopping execution due to failure', { failedTasks });
      break;
    }

    // Get ready tasks
    const readyTasks = getReadyTasks(graph).filter(
      t => !runningTasks.has(t.id) && t.status !== 'completed' && t.status !== 'failed'
    );

    // Check if we're done
    const allProcessed = Array.from(graph.nodes.values()).every(
      n => n.status === 'completed' || n.status === 'failed' || n.status === 'blocked'
    );

    if (allProcessed || (readyTasks.length === 0 && runningTasks.size === 0)) {
      break;
    }

    // Start new tasks up to concurrency limit
    const tasksToStart = readyTasks.slice(0, maxConcurrency - runningTasks.size);

    const taskPromises = tasksToStart.map(async (node) => {
      runningTasks.add(node.id);
      node.status = 'running';

      onTaskStart?.(node.id);
      logger.debug('Starting task', { taskId: node.id, title: node.task.title });

      try {
        // Execute the task
        const result = await executeTask(node.id, node.task.assignedAgentId || '');

        if (result.success) {
          node.status = 'completed';
          completedTasks.push(node.id);
          logger.debug('Task completed', { taskId: node.id });
        } else {
          node.status = 'failed';
          failedTasks.push(node.id);
          logger.warn('Task failed', { taskId: node.id, error: result.error });
        }

        onTaskComplete?.(node.id, result.success);
      } catch (error) {
        node.status = 'failed';
        failedTasks.push(node.id);
        logger.error('Task execution error', { taskId: node.id, error: String(error) });
        onTaskComplete?.(node.id, false);
      } finally {
        runningTasks.delete(node.id);
      }
    });

    // Wait for at least one task to complete if we're at capacity
    if (runningTasks.size >= maxConcurrency) {
      await Promise.race(taskPromises);
    } else if (taskPromises.length > 0) {
      // Wait a bit then check again
      await Promise.race([
        Promise.all(taskPromises),
        new Promise(resolve => setTimeout(resolve, 100)),
      ]);
    } else {
      // Wait for running tasks to complete
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }

  // Collect blocked tasks
  for (const [id, node] of graph.nodes) {
    if (node.status === 'blocked' || (node.status === 'pending' && !completedTasks.includes(id))) {
      blockedTasks.push(id);
    }
  }

  const success = failedTasks.length === 0 && blockedTasks.length === 0;
  graph.status = success ? 'completed' : 'failed';
  graph.completedAt = new Date();

  logger.info('Task graph execution completed', {
    rootId: graph.rootId,
    success,
    completed: completedTasks.length,
    failed: failedTasks.length,
    blocked: blockedTasks.length,
  });

  // Notify about completion
  const rootTask = graph.nodes.get(graph.rootId);
  if (rootTask) {
    const agent = await db.query.agents.findFirst({
      where: eq(schema.agents.id, rootTask.task.assignedAgentId || ''),
      with: { company: true },
    });

    if (agent) {
      await queueNotification({
        type: success ? 'task_completed' : 'task_failed',
        userId: agent.company?.ownerId || '',
        companyId: graph.companyId,
        title: success ? 'Task Graph Completed' : 'Task Graph Failed',
        message: `${rootTask.task.title}: ${completedTasks.length} completed, ${failedTasks.length} failed`,
        metadata: { rootTaskId: graph.rootId, completedTasks, failedTasks, blockedTasks },
      });
    }
  }

  return { success, completedTasks, failedTasks, blockedTasks };
}

// Create a subtask and add to graph
export async function createSubtask(
  parentTaskId: string,
  subtaskData: {
    title: string;
    description?: string;
    type: string;
    priority?: 'critical' | 'high' | 'medium' | 'low';
    assignedAgentId?: string;
    dependencies?: string[];
  }
): Promise<string> {
  const parentTask = await db.query.tasks.findFirst({
    where: eq(schema.tasks.id, parentTaskId),
  });

  if (!parentTask) {
    throw new Error(`Parent task not found: ${parentTaskId}`);
  }

  const [subtask] = await db
    .insert(schema.tasks)
    .values({
      companyId: parentTask.companyId,
      title: subtaskData.title,
      description: subtaskData.description,
      type: subtaskData.type,
      priority: subtaskData.priority || 'medium',
      assignedAgentId: subtaskData.assignedAgentId || parentTask.assignedAgentId,
      parentTaskId: parentTaskId,
      rootTaskId: parentTask.rootTaskId || parentTask.id,
      depth: (parentTask.depth || 0) + 1,
      status: 'pending',
      dependencies: subtaskData.dependencies || [],
    })
    .returning();

  // Add explicit dependencies
  if (subtaskData.dependencies && subtaskData.dependencies.length > 0) {
    await db.insert(schema.taskDependencies).values(
      subtaskData.dependencies.map(depId => ({
        taskId: subtask.id,
        dependsOnTaskId: depId,
        type: 'finish_to_start',
      }))
    );
  }

  logger.info('Subtask created', {
    parentTaskId,
    subtaskId: subtask.id,
    title: subtask.title,
  });

  return subtask.id;
}

// Add dependency between tasks
export async function addTaskDependency(
  taskId: string,
  dependsOnTaskId: string,
  type: 'finish_to_start' | 'start_to_start' | 'finish_to_finish' = 'finish_to_start'
): Promise<void> {
  // Validate both tasks exist
  const [task, dependsOnTask] = await Promise.all([
    db.query.tasks.findFirst({ where: eq(schema.tasks.id, taskId) }),
    db.query.tasks.findFirst({ where: eq(schema.tasks.id, dependsOnTaskId) }),
  ]);

  if (!task || !dependsOnTask) {
    throw new Error('Task not found');
  }

  // Check for cycles
  const wouldCreateCycle = await checkWouldCreateCycle(taskId, dependsOnTaskId);
  if (wouldCreateCycle) {
    throw new Error('Adding this dependency would create a cycle');
  }

  await db.insert(schema.taskDependencies).values({
    taskId,
    dependsOnTaskId,
    type,
  });

  logger.info('Dependency added', { taskId, dependsOnTaskId, type });
}

// Check if adding a dependency would create a cycle
async function checkWouldCreateCycle(taskId: string, dependsOnTaskId: string): Promise<boolean> {
  // BFS from dependsOnTask to see if we can reach taskId
  const visited = new Set<string>();
  const queue = [dependsOnTaskId];

  while (queue.length > 0) {
    const currentId = queue.shift()!;
    if (currentId === taskId) return true;
    if (visited.has(currentId)) continue;
    visited.add(currentId);

    // Get dependencies of current task
    const deps = await db.query.taskDependencies.findMany({
      where: eq(schema.taskDependencies.taskId, currentId),
    });

    for (const dep of deps) {
      if (!visited.has(dep.dependsOnTaskId)) {
        queue.push(dep.dependsOnTaskId);
      }
    }
  }

  return false;
}

// Get task graph status
export async function getTaskGraphStatus(rootTaskId: string): Promise<{
  total: number;
  pending: number;
  running: number;
  completed: number;
  failed: number;
  blocked: number;
  progress: number;
}> {
  const graph = await buildTaskGraph(rootTaskId);

  let pending = 0, running = 0, completed = 0, failed = 0, blocked = 0;

  for (const [_, node] of graph.nodes) {
    switch (node.status) {
      case 'pending':
      case 'ready':
        pending++;
        break;
      case 'running':
        running++;
        break;
      case 'completed':
        completed++;
        break;
      case 'failed':
        failed++;
        break;
      case 'blocked':
        blocked++;
        break;
    }
  }

  const total = graph.nodes.size;
  const progress = total > 0 ? Math.round((completed / total) * 100) : 0;

  return { total, pending, running, completed, failed, blocked, progress };
}

// Visualize task graph as text (for debugging)
export function visualizeTaskGraph(graph: TaskGraph): string {
  const lines: string[] = ['Task Graph:', ''];

  // Sort nodes by depth
  const sortedNodes = Array.from(graph.nodes.values()).sort((a, b) => a.depth - b.depth);

  for (const node of sortedNodes) {
    const indent = '  '.repeat(node.depth);
    const statusIcon = {
      pending: '⏳',
      ready: '🟡',
      running: '🔄',
      completed: '✅',
      failed: '❌',
      blocked: '🚫',
    }[node.status];

    lines.push(`${indent}${statusIcon} ${node.task.title} (${node.id.slice(0, 8)})`);

    if (node.dependencies.length > 0) {
      lines.push(`${indent}  └─ depends on: ${node.dependencies.map(d => d.slice(0, 8)).join(', ')}`);
    }
  }

  return lines.join('\n');
}
