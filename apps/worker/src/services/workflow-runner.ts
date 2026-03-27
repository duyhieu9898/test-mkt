/**
 * Main Workflow Runner - Orchestrates the entire AI Company OS workflow
 *
 * This is the main entry point that connects all components into a unified flow:
 *
 * User/CEO Input
 *     ↓
 * CEO Agent (Strategy)
 *     ↓
 * Company State Engine (Read State)
 *     ↓
 * Agent Orchestrator (Coordinate)
 *     ↓
 * Goal Decomposition (Break Down)
 *     ↓
 * Task Graph Engine (Build DAG)
 *     ↓
 * Agent Assignment (Match Agents)
 *     ↓
 * Communication Protocol (Notify)
 *     ↓
 * Execution Layer (Run Tasks)
 *     ↓
 * Memory System (Store Learnings)
 *     ↓
 * Evaluation System (Assess Performance)
 *     ↓
 * Agent Evolution (Improve)
 *     ↓
 * (Feedback Loop to CEO Agent)
 */

import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { eq, and, desc, inArray } from 'drizzle-orm';
import * as schema from '@1person/core/db';
import { agentLogger } from '../lib/logger';
import { queueNotification } from '../lib/queue';

// Import all services in the workflow
import { computeCompanyState, getCompanyState, saveStateSnapshot, getStateForDecisionMaking } from './company-state-engine';
import { generateCEOBrief, runStrategicLoop, setStrategicPriorities, executeStrategicDecision } from './ceo-brain';
import { orchestrateObjective, getWorkloadStatus, rebalanceWorkload, monitorExecution, executeReadyTasks, runAgentMaintenance, updateObjectiveProgress, type OrchestrationContext } from './agent-orchestrator';
import { decomposeGoal, type GoalInput } from './goal-decomposition';
import { buildTaskGraph, executeTaskGraph, getTaskGraphStatus } from './task-graph';
import { executeTask } from './agent-runtime';
import { sendAgentMessage, processAndRespond, getAgentInbox } from './agent-communication';
import { storeMemory, getAgentMemoryContext, consolidateAgentMemories } from './memory';
import { evaluateAgent, evolveAllAgents } from './evolution';
import { runSelfImprovementCycle, runCompanyWideImprovement } from './self-improvement';
import { runRiskMonitoringLoop, isEmergencyMode, exitEmergencyMode } from './risk-monitoring';
import { runAutoSpawnCheck } from './auto-spawn';

const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/oneperson';
const client = postgres(DATABASE_URL);
const db = drizzle(client, { schema });

const logger = agentLogger.child({ service: 'workflow-runner' });

// Workflow execution result
export interface WorkflowResult {
  success: boolean;
  stage: string;
  data?: Record<string, unknown>;
  errors: string[];
  duration: number;
}

// Workflow configuration
export interface WorkflowConfig {
  companyId: string;
  mode: 'full' | 'strategic' | 'operational' | 'maintenance';
  priority: 'critical' | 'high' | 'normal' | 'low';
  dryRun?: boolean;
}

/**
 * MAIN WORKFLOW: Process a user command/objective through the entire system
 */
export async function runFullWorkflow(
  companyId: string,
  input: {
    type: 'objective' | 'command' | 'task';
    title: string;
    description: string;
    priority?: 'critical' | 'high' | 'medium' | 'low';
    deadline?: Date;
    initiator: 'user' | 'ceo_agent' | 'system';
  }
): Promise<WorkflowResult> {
  const startTime = Date.now();
  logger.info('Starting full workflow', { companyId, type: input.type, title: input.title });

  const errors: string[] = [];
  let currentStage = 'initialization';

  try {
    // ============================================
    // STAGE 1: Read Company State
    // ============================================
    currentStage = 'company_state';
    logger.info('Stage 1: Reading company state');

    const companyState = await getCompanyState(companyId);
    const stateForDecision = await getStateForDecisionMaking(companyId);

    logger.debug('Company state loaded', {
      healthScore: companyState.healthScore,
      criticalIssues: stateForDecision.criticalIssues.length,
    });

    // Check for critical issues that should block execution
    if (stateForDecision.criticalIssues.length > 0 && input.priority !== 'critical') {
      logger.warn('Critical issues detected', { issues: stateForDecision.criticalIssues });
      // Continue but log warning
    }

    // ============================================
    // STAGE 2: CEO Agent Strategy Analysis
    // ============================================
    currentStage = 'ceo_strategy';
    logger.info('Stage 2: CEO strategy analysis');

    const ceoAgent = await db.query.agents.findFirst({
      where: and(
        eq(schema.agents.companyId, companyId),
        eq(schema.agents.role, 'ceo')
      ),
    });

    if (ceoAgent) {
      // Get CEO's memory context for informed decision making
      const ceoMemory = await getAgentMemoryContext(ceoAgent.id, {
        title: input.title,
        description: input.description,
        type: input.type,
      });

      logger.debug('CEO memory context loaded', {
        recentMemories: ceoMemory.recentMemories.length,
        strategies: ceoMemory.pastStrategies.length,
        lessons: ceoMemory.failureLessons.length,
      });
    }

    // ============================================
    // STAGE 3: Agent Orchestration
    // ============================================
    currentStage = 'orchestration';
    logger.info('Stage 3: Agent orchestration');

    const orchestrationContext: OrchestrationContext = {
      companyId,
      initiator: input.initiator,
      priority: input.priority || 'normal',
      deadline: input.deadline,
    };

    const goalInput: GoalInput = {
      companyId,
      title: input.title,
      description: input.description,
      priority: input.priority,
      deadline: input.deadline,
    };

    const orchestrationResult = await orchestrateObjective(goalInput, orchestrationContext);

    if (!orchestrationResult.success) {
      errors.push(...orchestrationResult.errors);
      throw new Error('Orchestration failed');
    }

    logger.info('Orchestration completed', {
      objectiveId: orchestrationResult.objectiveId,
      taskGraphId: orchestrationResult.taskGraphId,
      assignments: orchestrationResult.assignments.length,
    });

    // ============================================
    // STAGE 4: Task Graph Execution
    // ============================================
    currentStage = 'execution';
    logger.info('Stage 4: Task graph execution');

    if (orchestrationResult.taskGraphId) {
      const taskGraph = await buildTaskGraph(orchestrationResult.taskGraphId);

      // Execute task graph with monitoring
      const executionResult = await executeTaskGraph(taskGraph, {
        maxConcurrency: 3,
        stopOnFailure: false,
        onTaskStart: (taskId) => {
          logger.debug('Task started', { taskId });
        },
        onTaskComplete: (taskId, success) => {
          logger.debug('Task completed', { taskId, success });
        },
      });

      logger.info('Task graph execution completed', {
        success: executionResult.success,
        completed: executionResult.completedTasks.length,
        failed: executionResult.failedTasks.length,
        blocked: executionResult.blockedTasks.length,
      });

      // Update objective progress
      if (orchestrationResult.objectiveId) {
        await updateObjectiveProgress(orchestrationResult.objectiveId);
      }
    }

    // ============================================
    // STAGE 5: Post-Execution Processing
    // ============================================
    currentStage = 'post_execution';
    logger.info('Stage 5: Post-execution processing');

    // Update company state
    await computeCompanyState(companyId);

    // Save state snapshot
    await saveStateSnapshot(companyId, 'hourly');

    // Notify user of completion
    const company = await db.query.companies.findFirst({
      where: eq(schema.companies.id, companyId),
    });

    if (company?.ownerId) {
      await queueNotification({
        type: 'task_completed',
        userId: company.ownerId,
        companyId,
        title: 'Objective Completed',
        message: `"${input.title}" has been processed`,
        metadata: {
          objectiveId: orchestrationResult.objectiveId,
          taskGraphId: orchestrationResult.taskGraphId,
        },
      });
    }

    const duration = Date.now() - startTime;

    logger.info('Full workflow completed successfully', {
      duration,
      objectiveId: orchestrationResult.objectiveId,
    });

    return {
      success: true,
      stage: 'completed',
      data: {
        objectiveId: orchestrationResult.objectiveId,
        taskGraphId: orchestrationResult.taskGraphId,
        assignments: orchestrationResult.assignments.length,
      },
      errors,
      duration,
    };
  } catch (error) {
    const duration = Date.now() - startTime;
    logger.error('Workflow failed', {
      stage: currentStage,
      error: String(error),
      duration,
    });

    errors.push(String(error));

    return {
      success: false,
      stage: currentStage,
      errors,
      duration,
    };
  }
}

/**
 * STRATEGIC WORKFLOW: CEO-level strategic operations
 */
export async function runStrategicWorkflow(companyId: string): Promise<WorkflowResult> {
  const startTime = Date.now();
  logger.info('Starting strategic workflow', { companyId });

  const errors: string[] = [];

  try {
    // 1. Compute fresh company state
    await computeCompanyState(companyId);

    // 2. Generate CEO brief
    const brief = await generateCEOBrief(companyId);

    // 3. Execute auto-approved decisions
    const autoDecisions = brief.strategicDecisions.filter(
      d => d.autoExecute && (d.priority === 'critical' || d.priority === 'high')
    );

    for (const decision of autoDecisions) {
      await executeStrategicDecision(companyId, decision);
    }

    // 4. Set strategic priorities
    await setStrategicPriorities(companyId);

    // 5. Save daily snapshot
    await saveStateSnapshot(companyId, 'daily');

    const duration = Date.now() - startTime;

    return {
      success: true,
      stage: 'completed',
      data: {
        briefGenerated: true,
        decisionsExecuted: autoDecisions.length,
        pendingDecisions: brief.strategicDecisions.length - autoDecisions.length,
      },
      errors,
      duration,
    };
  } catch (error) {
    errors.push(String(error));
    return {
      success: false,
      stage: 'strategic',
      errors,
      duration: Date.now() - startTime,
    };
  }
}

/**
 * OPERATIONAL WORKFLOW: Day-to-day task execution
 */
export async function runOperationalWorkflow(companyId: string): Promise<WorkflowResult> {
  const startTime = Date.now();
  logger.info('Starting operational workflow', { companyId });

  const errors: string[] = [];

  try {
    // 1. Monitor execution issues
    const monitoring = await monitorExecution(companyId);
    logger.info('Monitoring completed', { issues: monitoring.issues.length });

    // 2. Process agent communication
    const agents = await db.query.agents.findMany({
      where: and(
        eq(schema.agents.companyId, companyId),
        inArray(schema.agents.status, ['active', 'ready'])
      ),
    });

    for (const agent of agents) {
      const inbox = await getAgentInbox(agent.id, { unreadOnly: true, limit: 10 });
      for (const message of inbox) {
        if (message.requiresResponse) {
          await processAndRespond(agent.id, message.id);
        }
      }
    }

    // 3. Execute ready tasks
    const execution = await executeReadyTasks(companyId);

    // 4. Rebalance workload if needed
    const workload = await getWorkloadStatus(companyId);
    if (workload.overloadedAgents.length > 0 || workload.idleAgents.length > workload.totalCapacity * 0.3) {
      await rebalanceWorkload(companyId);
    }

    // 5. Check for auto-spawn needs
    await runAutoSpawnCheck(companyId);

    // 6. Update state
    await computeCompanyState(companyId);

    const duration = Date.now() - startTime;

    return {
      success: true,
      stage: 'completed',
      data: {
        tasksExecuted: execution.executed,
        issuesFound: monitoring.issues.length,
        workloadUtilization: workload.utilizationPercent,
      },
      errors,
      duration,
    };
  } catch (error) {
    errors.push(String(error));
    return {
      success: false,
      stage: 'operational',
      errors,
      duration: Date.now() - startTime,
    };
  }
}

/**
 * MAINTENANCE WORKFLOW: Agent improvement and cleanup
 */
export async function runMaintenanceWorkflow(companyId: string): Promise<WorkflowResult> {
  const startTime = Date.now();
  logger.info('Starting maintenance workflow', { companyId });

  const errors: string[] = [];

  try {
    // 1. Run agent maintenance (evolution, retirement, spawning)
    const maintenance = await runAgentMaintenance(companyId);

    // 2. Run company-wide improvement
    const improvement = await runCompanyWideImprovement(companyId);

    // 3. Consolidate memories
    const agents = await db.query.agents.findMany({
      where: eq(schema.agents.companyId, companyId),
    });

    for (const agent of agents) {
      await consolidateAgentMemories(agent.id);
    }

    // 4. Run evaluations for all agents
    const periodStart = new Date();
    periodStart.setDate(periodStart.getDate() - 7);
    const periodEnd = new Date();

    for (const agent of agents) {
      await evaluateAgent(agent.id, 'weekly', periodStart, periodEnd);
    }

    // 5. Save weekly snapshot
    await saveStateSnapshot(companyId, 'weekly');

    const duration = Date.now() - startTime;

    return {
      success: true,
      stage: 'completed',
      data: {
        agentsImproved: maintenance.improved.length,
        agentsRetired: maintenance.retired.length,
        agentsSpawned: maintenance.spawned.length,
        totalImprovements: improvement.totalImprovements,
      },
      errors,
      duration,
    };
  } catch (error) {
    errors.push(String(error));
    return {
      success: false,
      stage: 'maintenance',
      errors,
      duration: Date.now() - startTime,
    };
  }
}

/**
 * RISK MONITORING WORKFLOW: Proactive risk detection and protection
 *
 * Monitors:
 * - Cash runway
 * - Infrastructure health
 * - Failure spikes
 *
 * Actions:
 * - Pause campaigns (reduce spending)
 * - Reduce agents (scale down)
 * - Scale infrastructure
 * - Emergency mode
 */
export async function runRiskMonitoringWorkflow(companyId: string): Promise<WorkflowResult> {
  const startTime = Date.now();
  logger.info('Starting risk monitoring workflow', { companyId });

  const errors: string[] = [];

  try {
    // Check if already in emergency mode
    const inEmergency = await isEmergencyMode(companyId);

    if (inEmergency) {
      // In emergency mode, check if we can exit
      const state = await getCompanyState(companyId);
      const healthScore = state?.healthScore || 0;

      if (healthScore >= 70) {
        await exitEmergencyMode(companyId);
        logger.info('Exited emergency mode - health recovered', { companyId, healthScore });
      } else {
        logger.info('Remaining in emergency mode', { companyId, healthScore });
      }
    }

    // Run the risk monitoring loop
    const result = await runRiskMonitoringLoop(companyId);

    const duration = Date.now() - startTime;

    return {
      success: true,
      stage: 'completed',
      data: {
        overallRiskLevel: result.overallRiskLevel,
        totalRisks: result.risks.length,
        criticalRisks: result.risks.filter(r => r.severity === 'critical').length,
        highRisks: result.risks.filter(r => r.severity === 'high').length,
        actionsTaken: result.actionsTaken.length,
        requiresHumanReview: result.requiresHumanReview,
      },
      errors,
      duration,
    };
  } catch (error) {
    errors.push(String(error));
    return {
      success: false,
      stage: 'risk_monitoring',
      errors,
      duration: Date.now() - startTime,
    };
  }
}

/**
 * CONTINUOUS WORKFLOW LOOP: Runs all workflows on schedule
 */
export async function runContinuousWorkflow(
  companyId: string,
  options: {
    operationalIntervalMs?: number;
    strategicIntervalMs?: number;
    maintenanceIntervalMs?: number;
    maxIterations?: number;
  } = {}
): Promise<void> {
  const {
    operationalIntervalMs = 5 * 60 * 1000, // 5 minutes
    strategicIntervalMs = 60 * 60 * 1000,   // 1 hour
    maintenanceIntervalMs = 24 * 60 * 60 * 1000, // 24 hours
    maxIterations = Infinity,
  } = options;

  logger.info('Starting continuous workflow loop', {
    companyId,
    operationalInterval: operationalIntervalMs / 1000,
    strategicInterval: strategicIntervalMs / 1000,
    maintenanceInterval: maintenanceIntervalMs / 1000,
  });

  let lastOperational = 0;
  let lastStrategic = 0;
  let lastMaintenance = 0;
  let iterations = 0;

  while (iterations < maxIterations) {
    const now = Date.now();

    try {
      // Run operational workflow
      if (now - lastOperational >= operationalIntervalMs) {
        await runOperationalWorkflow(companyId);
        lastOperational = now;
      }

      // Run strategic workflow
      if (now - lastStrategic >= strategicIntervalMs) {
        await runStrategicWorkflow(companyId);
        lastStrategic = now;
      }

      // Run maintenance workflow
      if (now - lastMaintenance >= maintenanceIntervalMs) {
        await runMaintenanceWorkflow(companyId);
        lastMaintenance = now;
      }

      iterations++;

      // Wait before next check
      await new Promise(resolve => setTimeout(resolve, 30000)); // 30 seconds
    } catch (error) {
      logger.error('Continuous workflow error', { error: String(error) });
      // Continue running despite errors
      await new Promise(resolve => setTimeout(resolve, 60000)); // 1 minute on error
    }
  }
}

/**
 * Initialize workflow system for a company
 */
export async function initializeWorkflowSystem(companyId: string): Promise<{
  success: boolean;
  message: string;
}> {
  logger.info('Initializing workflow system', { companyId });

  try {
    // 1. Compute initial company state
    await computeCompanyState(companyId);

    // 2. Ensure CEO agent exists
    const ceoAgent = await db.query.agents.findFirst({
      where: and(
        eq(schema.agents.companyId, companyId),
        eq(schema.agents.role, 'ceo')
      ),
    });

    if (!ceoAgent) {
      // Create CEO agent
      await db.insert(schema.agents).values({
        companyId,
        name: 'CEO Agent',
        role: 'ceo',
        description: 'Chief Executive Officer - Strategic decision making and company oversight',
        capabilities: ['strategy', 'decision_making', 'delegation', 'planning', 'analysis'],
        status: 'active',
        systemPrompt: `You are the CEO Agent, responsible for:
- Strategic decision making for the company
- Delegating tasks to appropriate agents
- Monitoring company health and performance
- Making critical decisions when needed
- Ensuring company objectives are met`,
      });
    }

    // 3. Save initial state snapshot
    await saveStateSnapshot(companyId, 'daily');

    // 4. Generate initial strategic priorities
    await setStrategicPriorities(companyId);

    logger.info('Workflow system initialized', { companyId });

    return {
      success: true,
      message: 'Workflow system initialized successfully',
    };
  } catch (error) {
    logger.error('Failed to initialize workflow system', { error: String(error) });
    return {
      success: false,
      message: String(error),
    };
  }
}

/**
 * Get workflow status for a company
 */
export async function getWorkflowStatus(companyId: string): Promise<{
  companyState: Awaited<ReturnType<typeof getStateForDecisionMaking>>;
  workload: Awaited<ReturnType<typeof getWorkloadStatus>>;
  activeObjectives: number;
  pendingTasks: number;
  runningTasks: number;
  agentStatuses: Record<string, number>;
}> {
  const [companyState, workload, objectives, tasks, agents] = await Promise.all([
    getStateForDecisionMaking(companyId),
    getWorkloadStatus(companyId),
    db.query.strategicObjectives.findMany({
      where: and(
        eq(schema.strategicObjectives.companyId, companyId),
        eq(schema.strategicObjectives.status, 'active')
      ),
    }).catch(() => []),
    db.query.tasks.findMany({
      where: eq(schema.tasks.companyId, companyId),
    }),
    db.query.agents.findMany({
      where: eq(schema.agents.companyId, companyId),
    }),
  ]);

  const pendingTasks = tasks.filter(t => t.status === 'pending' || t.status === 'queued').length;
  const runningTasks = tasks.filter(t => t.status === 'in_progress').length;

  const agentStatuses: Record<string, number> = {};
  for (const agent of agents) {
    agentStatuses[agent.status] = (agentStatuses[agent.status] || 0) + 1;
  }

  return {
    companyState,
    workload,
    activeObjectives: objectives.length,
    pendingTasks,
    runningTasks,
    agentStatuses,
  };
}
