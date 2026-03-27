import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { eq, and, desc, gte, sql, count, sum } from 'drizzle-orm';
import * as schema from '@1person/core/db';
import { callLLM, type LLMMessage } from '../lib/llm';
import { agentLogger } from '../lib/logger';
import { decomposeGoal, createTasksFromDecomposition } from './goal-decomposition';
import { searchMemories, storeMemory, extractLearningsFromMemories } from './memory';
import { queueNotification } from '../lib/queue';
import { getCompanyState, getStateForDecisionMaking, saveStateSnapshot } from './company-state-engine';

const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/oneperson';
const client = postgres(DATABASE_URL);
const db = drizzle(client, { schema });

const logger = agentLogger.child({ service: 'ceo-brain' });

// Strategic priority
export interface StrategicPriority {
  id: string;
  title: string;
  description: string;
  category: 'growth' | 'efficiency' | 'innovation' | 'risk_mitigation' | 'cost_reduction';
  urgency: 'immediate' | 'short_term' | 'medium_term' | 'long_term';
  estimatedImpact: 'high' | 'medium' | 'low';
  resources: string[];
  success_metrics: string[];
}

// Company status snapshot
export interface CompanySnapshot {
  companyId: string;
  timestamp: Date;
  agents: {
    total: number;
    active: number;
    idle: number;
    byRole: Record<string, number>;
  };
  tasks: {
    total: number;
    completed: number;
    inProgress: number;
    failed: number;
    successRate: number;
  };
  costs: {
    today: number;
    thisWeek: number;
    thisMonth: number;
    budget: number;
    utilization: number;
  };
  performance: {
    avgTaskDuration: number;
    avgAgentScore: number;
    topPerformers: string[];
    bottlenecks: string[];
  };
}

// Strategic decision
export interface StrategicDecision {
  id: string;
  type: 'hire_agent' | 'reassign_tasks' | 'set_priority' | 'budget_adjustment' | 'process_improvement';
  rationale: string;
  actions: Array<{
    type: string;
    target: string;
    params: Record<string, unknown>;
  }>;
  expectedOutcome: string;
  priority: 'critical' | 'high' | 'medium' | 'low';
  autoExecute: boolean;
}

// Daily CEO brief
export interface CEOBrief {
  date: Date;
  summary: string;
  keyMetrics: {
    tasksCompleted: number;
    successRate: number;
    totalCost: number;
    activeAgents: number;
  };
  highlights: string[];
  concerns: string[];
  recommendations: string[];
  strategicDecisions: StrategicDecision[];
}

// Get company snapshot
export async function getCompanySnapshot(companyId: string): Promise<CompanySnapshot> {
  logger.debug('Getting company snapshot', { companyId });

  const now = new Date();
  const startOfDay = new Date(now);
  startOfDay.setHours(0, 0, 0, 0);
  const startOfWeek = new Date(now);
  startOfWeek.setDate(now.getDate() - 7);
  const startOfMonth = new Date(now);
  startOfMonth.setDate(1);

  // Get agents
  const agents = await db.query.agents.findMany({
    where: eq(schema.agents.companyId, companyId),
  });

  const activeAgents = agents.filter(a => a.status === 'active' || a.status === 'running' || a.status === 'ready');
  const idleAgents = agents.filter(a => a.status === 'idle');

  const byRole: Record<string, number> = {};
  for (const agent of agents) {
    byRole[agent.role] = (byRole[agent.role] || 0) + 1;
  }

  // Get tasks
  const tasks = await db.query.tasks.findMany({
    where: eq(schema.tasks.companyId, companyId),
  });

  const completedTasks = tasks.filter(t => t.status === 'completed');
  const inProgressTasks = tasks.filter(t => t.status === 'in_progress');
  const failedTasks = tasks.filter(t => t.status === 'failed');
  const successRate = tasks.length > 0 ? completedTasks.length / tasks.length : 0;

  // Get costs from action logs
  const costData = await db.execute(sql`
    SELECT
      COALESCE(SUM(CASE WHEN created_at >= ${startOfDay} THEN CAST(cost AS DECIMAL) ELSE 0 END), 0) as today,
      COALESCE(SUM(CASE WHEN created_at >= ${startOfWeek} THEN CAST(cost AS DECIMAL) ELSE 0 END), 0) as this_week,
      COALESCE(SUM(CASE WHEN created_at >= ${startOfMonth} THEN CAST(cost AS DECIMAL) ELSE 0 END), 0) as this_month
    FROM action_logs
    WHERE company_id = ${companyId}
  `);

  const costs = (costData as unknown as Array<{ today: string; this_week: string; this_month: string }>)[0] || {
    today: '0',
    this_week: '0',
    this_month: '0',
  };

  // Get company budget
  const company = await db.query.companies.findFirst({
    where: eq(schema.companies.id, companyId),
  });

  const budget = parseFloat(company?.monthlyBudget || '1000');
  const monthCost = parseFloat(costs.this_month);

  // Calculate performance metrics
  const avgTaskDuration = completedTasks.length > 0
    ? completedTasks.reduce((sum, t) => {
        if (t.startedAt && t.completedAt) {
          return sum + (new Date(t.completedAt).getTime() - new Date(t.startedAt).getTime());
        }
        return sum;
      }, 0) / completedTasks.length / 1000 / 60 // in minutes
    : 0;

  const avgAgentScore = agents.length > 0
    ? agents.reduce((sum, a) => sum + parseFloat(a.performanceScore || '0'), 0) / agents.length
    : 0;

  const topPerformers = agents
    .filter(a => parseFloat(a.performanceScore || '0') >= 80)
    .slice(0, 3)
    .map(a => a.name);

  // Find bottlenecks (agents with high failure rate or low performance)
  const bottlenecks = agents
    .filter(a => {
      const failures = a.tasksFailed || 0;
      const completed = a.tasksCompleted || 0;
      const total = failures + completed;
      return total > 0 && failures / total > 0.3;
    })
    .map(a => a.name);

  return {
    companyId,
    timestamp: now,
    agents: {
      total: agents.length,
      active: activeAgents.length,
      idle: idleAgents.length,
      byRole,
    },
    tasks: {
      total: tasks.length,
      completed: completedTasks.length,
      inProgress: inProgressTasks.length,
      failed: failedTasks.length,
      successRate,
    },
    costs: {
      today: parseFloat(costs.today),
      thisWeek: parseFloat(costs.this_week),
      thisMonth: monthCost,
      budget,
      utilization: budget > 0 ? monthCost / budget : 0,
    },
    performance: {
      avgTaskDuration,
      avgAgentScore,
      topPerformers,
      bottlenecks,
    },
  };
}

// Generate CEO daily brief
export async function generateCEOBrief(companyId: string): Promise<CEOBrief> {
  logger.info('Generating CEO brief', { companyId });

  // Read from Company State Engine (single source of truth)
  const companyState = await getCompanyState(companyId);
  const stateForDecision = await getStateForDecisionMaking(companyId);

  // Convert to snapshot format for backward compatibility
  const snapshot = await getCompanySnapshot(companyId);

  // Get recent events
  const recentTasks = await db.query.tasks.findMany({
    where: eq(schema.tasks.companyId, companyId),
    orderBy: [desc(schema.tasks.updatedAt)],
    limit: 20,
  });

  const recentFailures = recentTasks.filter(t => t.status === 'failed');
  const recentSuccesses = recentTasks.filter(t => t.status === 'completed');

  // Build the analysis prompt using Company State Engine
  const prompt = `As the AI CEO brain, analyze this company state and generate a strategic brief.

## Company State Summary
${stateForDecision.summary}

## Key Metrics
${JSON.stringify(stateForDecision.keyMetrics, null, 2)}

## Critical Issues
${stateForDecision.criticalIssues.length > 0 ? stateForDecision.criticalIssues.map(i => `- ${i}`).join('\n') : 'None'}

## Opportunities
${stateForDecision.opportunities.length > 0 ? stateForDecision.opportunities.map(o => `- ${o}`).join('\n') : 'None'}

## System Recommendations
${stateForDecision.recommendations.map(r => `- ${r}`).join('\n')}

## Health Indicators
${JSON.stringify(companyState.healthIndicators, null, 2)}

## Active Alerts
${(companyState.activeAlerts || []).map(a => `- [${a.type}] ${a.message}`).join('\n') || 'None'}

## Recent Activity
- Completed tasks: ${recentSuccesses.map(t => t.title).slice(0, 5).join(', ')}
- Failed tasks: ${recentFailures.map(t => `${t.title} (${t.errorMessage})`).slice(0, 3).join(', ')}

## Generate Brief

Provide a strategic brief in JSON format:
{
  "summary": "1-2 sentence executive summary of company status",
  "highlights": ["Positive achievement 1", "Positive achievement 2"],
  "concerns": ["Issue requiring attention 1", "Issue requiring attention 2"],
  "recommendations": ["Strategic recommendation 1", "Strategic recommendation 2"],
  "strategicDecisions": [
    {
      "type": "hire_agent|reassign_tasks|set_priority|budget_adjustment|process_improvement",
      "rationale": "Why this decision is needed",
      "actions": [{"type": "action_type", "target": "target_id", "params": {}}],
      "expectedOutcome": "What we expect to achieve",
      "priority": "critical|high|medium|low",
      "autoExecute": false
    }
  ]
}

Consider:
1. Agent utilization and capacity
2. Task success rates and bottlenecks
3. Cost efficiency
4. Areas needing improvement
5. Growth opportunities`;

  const messages: LLMMessage[] = [
    {
      role: 'system',
      content: `You are the AI CEO brain - a strategic decision-making system for an AI-powered company.
Your role is to analyze company data and provide actionable insights and decisions.
Be concise, data-driven, and action-oriented.`,
    },
    { role: 'user', content: prompt },
  ];

  try {
    const response = await callLLM(messages, { temperature: 0.5 });

    const jsonMatch = response.content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('No valid JSON in response');
    }

    const parsed = JSON.parse(jsonMatch[0]) as {
      summary: string;
      highlights: string[];
      concerns: string[];
      recommendations: string[];
      strategicDecisions: StrategicDecision[];
    };

    // Add IDs to decisions
    const decisions = parsed.strategicDecisions.map((d, i) => ({
      ...d,
      id: `decision-${Date.now()}-${i}`,
    }));

    const brief: CEOBrief = {
      date: new Date(),
      summary: parsed.summary,
      keyMetrics: {
        tasksCompleted: snapshot.tasks.completed,
        successRate: snapshot.tasks.successRate,
        totalCost: snapshot.costs.thisMonth,
        activeAgents: snapshot.agents.active,
      },
      highlights: parsed.highlights,
      concerns: parsed.concerns,
      recommendations: parsed.recommendations,
      strategicDecisions: decisions,
    };

    // Store brief as memory
    const ceoAgent = await db.query.agents.findFirst({
      where: and(
        eq(schema.agents.companyId, companyId),
        eq(schema.agents.role, 'CEO')
      ),
    });

    if (ceoAgent) {
      await storeMemory({
        agentId: ceoAgent.id,
        companyId,
        type: 'strategy',
        title: `CEO Brief: ${new Date().toISOString().split('T')[0]}`,
        content: JSON.stringify(brief, null, 2),
        importance: 'high',
        metadata: {
          tags: ['ceo_brief', 'daily_report'],
        },
      });
    }

    logger.info('CEO brief generated', { companyId, decisions: decisions.length });

    return brief;
  } catch (error) {
    logger.error('Failed to generate CEO brief', { error: String(error) });
    throw error;
  }
}

// Execute strategic decision
export async function executeStrategicDecision(
  companyId: string,
  decision: StrategicDecision
): Promise<{ success: boolean; result: string }> {
  logger.info('Executing strategic decision', { companyId, decisionId: decision.id, type: decision.type });

  try {
    for (const action of decision.actions) {
      switch (action.type) {
        case 'create_agent':
          await createAgentFromDecision(companyId, action.params as Record<string, string>);
          break;

        case 'reassign_task':
          await reassignTask(action.target, action.params.newAgentId as string);
          break;

        case 'create_goal':
          await createGoalFromDecision(companyId, action.params as { title: string; description: string });
          break;

        case 'adjust_priority':
          await adjustTaskPriority(action.target, action.params.priority as string);
          break;

        case 'pause_agent':
          await pauseAgent(action.target);
          break;

        default:
          logger.warn('Unknown action type', { type: action.type });
      }
    }

    // Log the decision
    await db.insert(schema.actionLogs).values({
      companyId,
      toolName: 'ceo_brain',
      action: 'execute_decision',
      input: decision,
      output: { success: true },
      status: 'success',
    });

    return { success: true, result: `Decision ${decision.id} executed successfully` };
  } catch (error) {
    logger.error('Failed to execute decision', { error: String(error) });
    return { success: false, result: String(error) };
  }
}

// Create agent from strategic decision
async function createAgentFromDecision(
  companyId: string,
  params: Record<string, string>
): Promise<string> {
  const [agent] = await db
    .insert(schema.agents)
    .values({
      companyId,
      name: params.name || 'New Agent',
      role: params.role || 'General',
      description: params.description || 'Auto-spawned agent',
      capabilities: (params.capabilities as unknown as string[]) || [],
      status: 'active',
    })
    .returning();

  logger.info('Agent created from decision', { agentId: agent.id, name: agent.name });
  return agent.id;
}

// Reassign task to different agent
async function reassignTask(taskId: string, newAgentId: string): Promise<void> {
  await db
    .update(schema.tasks)
    .set({ assignedAgentId: newAgentId })
    .where(eq(schema.tasks.id, taskId));

  logger.info('Task reassigned', { taskId, newAgentId });
}

// Create goal from decision
async function createGoalFromDecision(
  companyId: string,
  params: { title: string; description: string }
): Promise<string> {
  const decomposition = await decomposeGoal({
    companyId,
    title: params.title,
    description: params.description,
  });

  const result = await createTasksFromDecomposition(decomposition, {
    companyId,
    title: params.title,
    description: params.description,
  });

  return result.rootTaskId;
}

// Adjust task priority
async function adjustTaskPriority(taskId: string, priority: string): Promise<void> {
  await db
    .update(schema.tasks)
    .set({ priority: priority as 'critical' | 'high' | 'medium' | 'low' })
    .where(eq(schema.tasks.id, taskId));

  logger.info('Task priority adjusted', { taskId, priority });
}

// Pause agent
async function pauseAgent(agentId: string): Promise<void> {
  await db
    .update(schema.agents)
    .set({ status: 'paused' })
    .where(eq(schema.agents.id, agentId));

  logger.info('Agent paused', { agentId });
}

// Strategic planning - set priorities for the company
export async function setStrategicPriorities(
  companyId: string,
  context?: string
): Promise<StrategicPriority[]> {
  logger.info('Setting strategic priorities', { companyId });

  const snapshot = await getCompanySnapshot(companyId);

  // Get past strategies that worked
  const ceoAgent = await db.query.agents.findFirst({
    where: and(
      eq(schema.agents.companyId, companyId),
      eq(schema.agents.role, 'CEO')
    ),
  });

  let pastLearnings: string[] = [];
  if (ceoAgent) {
    pastLearnings = await extractLearningsFromMemories(ceoAgent.id);
  }

  const prompt = `As CEO, define strategic priorities for this company based on current status.

## Company Status
${JSON.stringify(snapshot, null, 2)}

${context ? `## Additional Context\n${context}` : ''}

${pastLearnings.length > 0 ? `## Past Learnings\n${pastLearnings.join('\n')}` : ''}

## Generate Strategic Priorities

Return a JSON array of 3-5 strategic priorities:
[
  {
    "id": "priority-1",
    "title": "Priority title",
    "description": "Detailed description of the priority",
    "category": "growth|efficiency|innovation|risk_mitigation|cost_reduction",
    "urgency": "immediate|short_term|medium_term|long_term",
    "estimatedImpact": "high|medium|low",
    "resources": ["agent_role_1", "agent_role_2"],
    "success_metrics": ["Metric 1", "Metric 2"]
  }
]

Consider:
1. Current bottlenecks and inefficiencies
2. Growth opportunities
3. Cost optimization
4. Risk mitigation
5. Resource utilization`;

  const messages: LLMMessage[] = [
    {
      role: 'system',
      content: 'You are a strategic AI CEO. Define clear, actionable priorities.',
    },
    { role: 'user', content: prompt },
  ];

  try {
    const response = await callLLM(messages, { temperature: 0.5 });

    const jsonMatch = response.content.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      throw new Error('No valid JSON array in response');
    }

    const priorities = JSON.parse(jsonMatch[0]) as StrategicPriority[];

    // Store as memory
    if (ceoAgent) {
      await storeMemory({
        agentId: ceoAgent.id,
        companyId,
        type: 'strategy',
        title: `Strategic Priorities: ${new Date().toISOString().split('T')[0]}`,
        content: JSON.stringify(priorities, null, 2),
        importance: 'critical',
        metadata: {
          tags: ['strategic_priorities'],
        },
      });
    }

    logger.info('Strategic priorities set', { companyId, count: priorities.length });

    return priorities;
  } catch (error) {
    logger.error('Failed to set strategic priorities', { error: String(error) });
    throw error;
  }
}

// Autonomous strategy loop - runs periodically
// Now uses the CEO Reasoning Loop (plan → act → reflect)
export async function runStrategicLoop(companyId: string): Promise<void> {
  logger.info('Running strategic loop with Reasoning Loop', { companyId });

  try {
    // Import and run the CEO Reasoning Loop
    const { runCEOReasoningLoop } = await import('./ceo-reasoning-loop');

    // Get company state for context
    const companyState = await getCompanyState(companyId);

    // Run the full reasoning loop (plan → act → reflect)
    const result = await runCEOReasoningLoop({
      companyId,
      companyState,
      trigger: 'scheduled',
    });

    logger.info('Strategic loop completed with Reasoning Loop', {
      cycleId: result.cycleId,
      success: result.overallSuccess,
      summary: result.summary,
      goalsPlanned: result.phases.plan.goals.length,
      actionsExecuted: result.phases.act.actionsExecuted.length,
      learningsExtracted: result.phases.reflect.learnings.length,
    });

    // If reasoning loop failed, fall back to legacy brief generation
    if (!result.overallSuccess) {
      logger.warn('Reasoning loop had issues, generating legacy brief as backup');
      await generateCEOBrief(companyId);
    }
  } catch (error) {
    logger.error('Strategic loop failed', { error: String(error) });

    // Fall back to legacy mode
    try {
      logger.info('Falling back to legacy strategic loop');
      await runLegacyStrategicLoop(companyId);
    } catch (fallbackError) {
      logger.error('Legacy fallback also failed', { error: String(fallbackError) });
    }
  }
}

// Legacy strategic loop for backward compatibility
async function runLegacyStrategicLoop(companyId: string): Promise<void> {
  // 1. Read from Company State Engine (single source of truth)
  const companyState = await getCompanyState(companyId);
  const snapshot = await getCompanySnapshot(companyId);

  // Save snapshot for trend analysis
  await saveStateSnapshot(companyId, 'hourly');

  // 2. Generate CEO brief
  const brief = await generateCEOBrief(companyId);

  // 3. Auto-execute high-priority decisions if enabled
  const autoDecisions = brief.strategicDecisions.filter(
    d => d.autoExecute && (d.priority === 'critical' || d.priority === 'high')
  );

  for (const decision of autoDecisions) {
    await executeStrategicDecision(companyId, decision);
  }

  // 4. Notify about decisions requiring approval
  const pendingDecisions = brief.strategicDecisions.filter(d => !d.autoExecute);
  if (pendingDecisions.length > 0) {
    const company = await db.query.companies.findFirst({
      where: eq(schema.companies.id, companyId),
    });

    if (company?.ownerId) {
      await queueNotification({
        type: 'system_alert',
        userId: company.ownerId,
        companyId,
        title: 'Strategic Decisions Pending',
        message: `${pendingDecisions.length} strategic decisions require your approval`,
        metadata: { decisions: pendingDecisions },
      });
    }
  }

  // 5. Check for workload issues and trigger auto-spawn if needed
  if (snapshot.agents.idle === 0 && snapshot.tasks.inProgress > snapshot.agents.active * 3) {
    logger.warn('Workload imbalance detected', {
      inProgress: snapshot.tasks.inProgress,
      activeAgents: snapshot.agents.active,
    });
  }

  logger.info('Legacy strategic loop completed', {
    autoExecuted: autoDecisions.length,
    pendingApproval: pendingDecisions.length,
  });
}

// Analyze workload and recommend agent changes
export async function analyzeWorkload(companyId: string): Promise<{
  recommendation: 'hire' | 'reduce' | 'maintain';
  details: string;
  suggestedRoles?: string[];
  suggestedReductions?: string[];
}> {
  const snapshot = await getCompanySnapshot(companyId);

  // Calculate workload per agent
  const workloadPerAgent = snapshot.agents.active > 0
    ? snapshot.tasks.inProgress / snapshot.agents.active
    : Infinity;

  // Analyze by role
  const pendingByRole: Record<string, number> = {};
  const tasks = await db.query.tasks.findMany({
    where: and(
      eq(schema.tasks.companyId, companyId),
      eq(schema.tasks.status, 'pending')
    ),
    with: { assignedAgent: true },
  });

  for (const task of tasks) {
    const role = task.assignedAgent?.role || 'unassigned';
    pendingByRole[role] = (pendingByRole[role] || 0) + 1;
  }

  // Determine recommendation
  if (workloadPerAgent > 5) {
    // High workload - need more agents
    const overloadedRoles = Object.entries(pendingByRole)
      .filter(([_, count]) => count > 3)
      .map(([role]) => role);

    return {
      recommendation: 'hire',
      details: `High workload detected (${workloadPerAgent.toFixed(1)} tasks per active agent)`,
      suggestedRoles: overloadedRoles.length > 0 ? overloadedRoles : ['General Assistant'],
    };
  } else if (workloadPerAgent < 0.5 && snapshot.agents.idle > snapshot.agents.active) {
    // Too many idle agents
    const idleAgents = await db.query.agents.findMany({
      where: and(
        eq(schema.agents.companyId, companyId),
        eq(schema.agents.status, 'idle')
      ),
    });

    return {
      recommendation: 'reduce',
      details: `Low workload with many idle agents (${snapshot.agents.idle} idle)`,
      suggestedReductions: idleAgents.slice(0, 2).map(a => a.id),
    };
  }

  return {
    recommendation: 'maintain',
    details: `Workload is balanced (${workloadPerAgent.toFixed(1)} tasks per active agent)`,
  };
}
