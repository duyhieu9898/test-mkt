/**
 * Orchestrator - Dynamic AI-driven execution engine
 *
 * The orchestrator does NOT follow a fixed pipeline.
 * It:
 * 1. Asks the PlannerAgent to generate a plan based on the goal
 * 2. Executes tasks by looking up capable agents from the registry
 * 3. Handles suggested follow-up tasks from agents
 * 4. Evaluates results and optionally re-plans
 * 5. Stores everything in memory for future improvement
 */

import { v4 as uuidv4 } from 'uuid';
import { eq, and } from 'drizzle-orm';
import { db } from '../lib/db';
import { tasks as tasksTable, agents as agentsTable } from '@1person/core/db';
import type { AgentRegistry } from './agent-registry';
import type { MemorySystem } from './memory';
import type { PlannerAgent, DynamicPlan, PlanTask } from './planner-agent';
import type { AgentContext, AgentResult, MemoryAccessor, TaskSuggestion } from './base-agent';

interface OrchestratorOptions {
  autoExpandPlan?: boolean;  // If true, agent suggestions are auto-added to plan
  maxTasks?: number;         // Safety limit
  timeout?: number;          // ms
}

interface OrchestratorResult {
  success: boolean;
  plan: DynamicPlan;
  taskResults: Record<string, AgentResult>;
  summary: string;
}

export class Orchestrator {
  constructor(
    private registry: AgentRegistry,
    private memory: MemorySystem,
    private plannerAgent: PlannerAgent,
  ) {}

  /**
   * Execute a goal dynamically - AI decides the workflow
   */
  async executeGoal(
    companyId: string,
    goal: string,
    initialInput?: Record<string, unknown>,
    options: OrchestratorOptions = {}
  ): Promise<OrchestratorResult> {
    const executionId = uuidv4();
    const { autoExpandPlan = true, maxTasks = 20 } = options;

    console.log(`[Orchestrator] Starting execution ${executionId} for goal: "${goal}"`);

    // Create a system agent ID for memory operations
    const systemAgentId = await this.getOrCreateSystemAgent(companyId);
    const memoryAccessor = this.memory.createAccessor(companyId, systemAgentId);

    const context: AgentContext = {
      companyId,
      executionId,
      memory: memoryAccessor,
    };

    // Step 1: Ask PlannerAgent to generate a plan
    console.log(`[Orchestrator] Generating plan...`);
    const planResult = await this.plannerAgent.execute(
      {
        goal,
        availableCapabilities: this.registry.listCapabilities(),
        agentDescriptions: this.registry.getAgentDescriptions(),
        ...initialInput,
      },
      context
    );

    if (!planResult.success || !planResult.data.plan) {
      return {
        success: false,
        plan: { id: executionId, goal, tasks: [], reasoning: 'Planning failed', successCriteria: [], status: 'failed' },
        taskResults: {},
        summary: `Planning failed: ${planResult.error}`,
      };
    }

    const plan = planResult.data.plan as DynamicPlan;
    plan.status = 'executing';

    // Save plan to memory
    await this.savePlanMemory(planResult, context);

    // Persist plan tasks to DB
    const taskIdMap = await this.persistPlanTasks(plan.tasks, companyId, systemAgentId);

    // Step 2: Execute tasks respecting dependencies (DAG execution)
    console.log(`[Orchestrator] Executing ${plan.tasks.length} tasks...`);
    const taskResults: Record<string, AgentResult> = {};
    const taskOutputs: Record<string, Record<string, unknown>> = {}; // outputs by task ID
    let executedCount = 0;

    // Build dependency resolution
    const completed = new Set<string>();
    const remaining = [...plan.tasks];

    while (remaining.length > 0 && executedCount < maxTasks) {
      // Find tasks whose dependencies are all resolved
      const ready = remaining.filter((t) =>
        t.dependsOn.every((dep) => completed.has(dep))
      );

      if (ready.length === 0) {
        console.warn(`[Orchestrator] No ready tasks but ${remaining.length} remaining. Breaking.`);
        break;
      }

      // Execute ready tasks (could be parallel, but sequential for safety)
      for (const task of ready) {
        // Merge inputs: task's own input + outputs from dependencies
        const mergedInput = { ...task.input };
        for (const depId of task.dependsOn) {
          const depOutput = taskOutputs[depId];
          if (depOutput) {
            Object.assign(mergedInput, depOutput);
          }
        }

        // Update DB status to in_progress
        const dbTaskId = taskIdMap.get(task.id);
        if (dbTaskId) {
          await this.updateTaskStatus(dbTaskId, 'in_progress');
        }

        const result = await this.executeTask(task, mergedInput, context);
        taskResults[task.id] = result;
        taskOutputs[task.id] = result.data;
        completed.add(task.id);
        executedCount++;

        // Update DB status to completed/failed with output
        if (dbTaskId) {
          await this.updateTaskCompletion(dbTaskId, result);
        }

        // Save memory entries from agent
        if (result.memoryEntries) {
          for (const entry of result.memoryEntries) {
            await memoryAccessor.store(entry);
          }
        }

        // Handle suggested follow-up tasks
        if (autoExpandPlan && result.suggestedNextTasks) {
          for (const suggestion of result.suggestedNextTasks) {
            // Only add if we don't already have this task type in the plan
            const alreadyPlanned = plan.tasks.some((t) => t.type === suggestion.type);
            if (!alreadyPlanned && executedCount < maxTasks) {
              const newTask: PlanTask = {
                id: `task_dynamic_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
                type: suggestion.type,
                title: suggestion.title,
                input: suggestion.input,
                dependsOn: [task.id], // depends on the suggesting task
                priority: suggestion.priority,
              };
              plan.tasks.push(newTask);
              remaining.push(newTask);
              console.log(`[Orchestrator] Dynamically added task: ${newTask.title}`);

              // Persist dynamic task to DB
              const dynamicDbIds = await this.persistPlanTasks([newTask], companyId, systemAgentId);
              for (const [planId, dbId] of dynamicDbIds) {
                taskIdMap.set(planId, dbId);
              }
            }
          }
        }

        // Remove from remaining
        const idx = remaining.indexOf(task);
        if (idx >= 0) remaining.splice(idx, 1);
      }
    }

    // Step 3: Evaluate results
    plan.status = 'completed';
    const successCount = Object.values(taskResults).filter((r) => r.success).length;
    const summary = `Executed ${executedCount}/${plan.tasks.length} tasks. Success rate: ${Math.round((successCount / executedCount) * 100)}%`;

    console.log(`[Orchestrator] ${summary}`);

    // Store execution summary in memory
    await memoryAccessor.storeKnowledge(
      'execution_history',
      `Execution: ${goal}`,
      JSON.stringify({ plan: plan.id, goal, taskCount: executedCount, successCount, summary })
    );

    return {
      success: successCount > 0,
      plan,
      taskResults,
      summary,
    };
  }

  private async executeTask(
    task: PlanTask,
    input: Record<string, unknown>,
    context: AgentContext
  ): Promise<AgentResult> {
    const agent = this.registry.findForTask(task.type);

    if (!agent) {
      console.warn(`[Orchestrator] No agent found for task type: ${task.type}`);
      return {
        success: false,
        data: {},
        error: `No agent available for task type: ${task.type}`,
      };
    }

    console.log(`[Orchestrator] Running ${agent.name} for: ${task.title}`);

    try {
      const result = await agent.execute(input, context);
      console.log(`[Orchestrator] ${agent.name} ${result.success ? 'succeeded' : 'failed'}`);
      return result;
    } catch (error) {
      console.error(`[Orchestrator] ${agent.name} threw error:`, error);
      return {
        success: false,
        data: {},
        error: error instanceof Error ? error.message : 'Agent execution failed',
      };
    }
  }

  private async savePlanMemory(planResult: AgentResult, context: AgentContext) {
    if (planResult.memoryEntries) {
      for (const entry of planResult.memoryEntries) {
        await context.memory.store(entry);
      }
    }
  }

  /**
   * Persist plan tasks to the tasks DB table.
   * Returns a map of PlanTask.id -> DB task UUID.
   */
  private async persistPlanTasks(
    planTasks: PlanTask[],
    companyId: string,
    systemAgentId: string
  ): Promise<Map<string, string>> {
    const taskIdMap = new Map<string, string>();

    for (const task of planTasks) {
      // Try to find a matching agent by task type for assignment
      const assignedAgentId = await this.resolveAgentId(task.type, companyId, systemAgentId);

      const [inserted] = await db
        .insert(tasksTable)
        .values({
          companyId,
          title: task.title,
          type: task.type,
          status: 'pending',
          priority: task.priority,
          assignedAgentId,
          createdByAgentId: systemAgentId,
          input: {
            type: task.type,
            data: task.input,
          },
          dependencies: task.dependsOn,
        })
        .returning({ id: tasksTable.id });

      taskIdMap.set(task.id, inserted.id);
    }

    return taskIdMap;
  }

  /**
   * Update a task's status in the DB.
   */
  private async updateTaskStatus(
    dbTaskId: string,
    status: 'pending' | 'queued' | 'in_progress' | 'waiting_approval' | 'completed' | 'failed' | 'cancelled'
  ): Promise<void> {
    const updates: Record<string, unknown> = {
      status,
      updatedAt: new Date(),
    };
    if (status === 'in_progress') {
      updates.startedAt = new Date();
    }
    await db.update(tasksTable).set(updates).where(eq(tasksTable.id, dbTaskId));
  }

  /**
   * Update a task's DB row with completion results.
   */
  private async updateTaskCompletion(dbTaskId: string, result: AgentResult): Promise<void> {
    const now = new Date();
    await db
      .update(tasksTable)
      .set({
        status: result.success ? 'completed' : 'failed',
        output: {
          type: 'agent_result',
          data: result.data,
        },
        errorMessage: result.error || null,
        completedAt: now,
        updatedAt: now,
        progress: result.success ? 100 : 0,
      })
      .where(eq(tasksTable.id, dbTaskId));
  }

  /**
   * Resolve the DB agent ID for a given task type.
   * Looks up a matching agent from the registry and finds its DB record,
   * falling back to the system (CEO) agent.
   */
  private async resolveAgentId(
    taskType: string,
    companyId: string,
    fallbackAgentId: string
  ): Promise<string> {
    const agent = this.registry.findForTask(taskType);
    if (!agent) return fallbackAgentId;

    // Try to find the agent in DB by name within this company
    const dbAgent = await db.query.agents.findFirst({
      where: and(
        eq(agentsTable.companyId, companyId),
        eq(agentsTable.name, agent.name)
      ),
    });

    return dbAgent?.id || fallbackAgentId;
  }

  private async getOrCreateSystemAgent(companyId: string): Promise<string> {
    // Use a deterministic ID for the system/orchestrator agent

    const existing = await db.query.agents.findFirst({
      where: and(eq(agentsTable.companyId, companyId), eq(agentsTable.role, 'ceo')),
    });

    if (existing) return existing.id;

    // Fallback: use first agent
    const firstAgent = await db.query.agents.findFirst({
      where: eq(agentsTable.companyId, companyId),
    });

    return firstAgent?.id || companyId; // last resort: use company ID
  }
}
