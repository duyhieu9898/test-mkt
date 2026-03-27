/**
 * CEO Reasoning Loop - Plan → Act → Reflect
 *
 * This service implements autonomous reasoning for the CEO Agent using
 * a multi-step process:
 *
 * 1. PLAN: Analyze situation, gather context, formulate strategy
 * 2. ACT: Execute decisions, delegate tasks to agents
 * 3. REFLECT: Evaluate outcomes, learn from results, adjust strategy
 *
 * Each phase involves multiple LLM calls for thorough reasoning.
 */

import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { eq, and, desc, gte, sql } from 'drizzle-orm';
import * as schema from '@1person/core/db';
import { callLLM, type LLMMessage } from '../lib/llm';
import { agentLogger } from '../lib/logger';
import {
  getCompanyState,
  getStateForDecisionMaking,
  saveStateSnapshot,
} from './company-state-engine';
import { searchMemories, storeMemory, extractLearningsFromMemories } from './memory';
import { sendAgentMessage, delegateTask, requestDecision } from './agent-communication';
import {
  getStrategyContextForReasoning,
  updateStrategyProgress,
  getAllActiveStrategies,
} from './strategy-horizon';

// Type for company state from the engine
type CompanyStateSnapshot = Awaited<ReturnType<typeof getCompanyState>>;

// Type for task records
type TaskRecord = typeof schema.tasks.$inferSelect;
import { queueNotification } from '../lib/queue';

const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/oneperson';
const client = postgres(DATABASE_URL);
const db = drizzle(client, { schema });

const logger = agentLogger.child({ service: 'ceo-reasoning-loop' });

// ==================== TYPES ====================

export interface ReasoningContext {
  companyId: string;
  companyState: CompanyStateSnapshot;
  trigger: 'scheduled' | 'event' | 'user_request' | 'escalation';
  triggerData?: Record<string, unknown>;
  maxIterations?: number;
}

export interface PlanPhaseResult {
  situation: SituationAnalysis;
  goals: StrategicGoal[];
  strategy: Strategy;
  risksAndMitigations: RiskMitigation[];
  success: boolean;
}

export interface ActPhaseResult {
  actionsExecuted: ExecutedAction[];
  tasksDelegated: DelegatedTask[];
  messagessSent: number;
  success: boolean;
}

export interface ReflectPhaseResult {
  outcomes: OutcomeAnalysis[];
  learnings: Learning[];
  adjustments: StrategyAdjustment[];
  nextCycleRecommendations: string[];
  success: boolean;
}

export interface ReasoningLoopResult {
  cycleId: string;
  startTime: Date;
  endTime: Date;
  phases: {
    plan: PlanPhaseResult;
    act: ActPhaseResult;
    reflect: ReflectPhaseResult;
  };
  overallSuccess: boolean;
  summary: string;
}

interface SituationAnalysis {
  currentState: string;
  keyMetrics: Record<string, number>;
  strengths: string[];
  weaknesses: string[];
  opportunities: string[];
  threats: string[];
  urgentIssues: string[];
}

interface StrategicGoal {
  id: string;
  title: string;
  description: string;
  priority: 'critical' | 'high' | 'medium' | 'low';
  timeframe: 'immediate' | 'short_term' | 'medium_term' | 'long_term';
  successCriteria: string[];
  dependencies: string[];
}

interface Strategy {
  mainThrust: string;
  keyInitiatives: Initiative[];
  resourceAllocation: ResourceAllocation[];
  expectedOutcomes: string[];
}

interface Initiative {
  id: string;
  title: string;
  description: string;
  owner: string; // agent role
  tasks: string[];
  priority: number;
}

interface ResourceAllocation {
  resource: string;
  allocation: number; // percentage
  rationale: string;
}

interface RiskMitigation {
  risk: string;
  probability: 'high' | 'medium' | 'low';
  impact: 'high' | 'medium' | 'low';
  mitigation: string;
  owner: string;
}

interface ExecutedAction {
  id: string;
  type: string;
  target: string;
  result: 'success' | 'failed' | 'pending';
  details: string;
}

interface DelegatedTask {
  taskId: string;
  agentId: string;
  agentRole: string;
  goal: string;
  deadline?: Date;
}

interface OutcomeAnalysis {
  goalId: string;
  goalTitle: string;
  achieved: boolean;
  metrics: Record<string, { expected: number; actual: number }>;
  analysis: string;
}

interface Learning {
  type: 'success_pattern' | 'failure_lesson' | 'process_improvement' | 'insight';
  content: string;
  confidence: number;
  actionable: boolean;
  relatedGoals: string[];
}

interface StrategyAdjustment {
  aspect: string;
  currentApproach: string;
  recommendedChange: string;
  rationale: string;
  priority: 'immediate' | 'next_cycle' | 'future';
}

// ==================== MAIN REASONING LOOP ====================

export async function runCEOReasoningLoop(context: ReasoningContext): Promise<ReasoningLoopResult> {
  const cycleId = `reasoning-${Date.now()}`;
  const startTime = new Date();

  logger.info('Starting CEO Reasoning Loop', {
    cycleId,
    companyId: context.companyId,
    trigger: context.trigger,
  });

  try {
    // Get or create CEO agent
    const ceoAgent = await getOrCreateCEOAgent(context.companyId);

    // PHASE 1: PLAN
    logger.info('Phase 1: PLAN', { cycleId });
    const planResult = await executePlanPhase(context, ceoAgent.id);

    // Store plan in memory
    await storeMemory({
      agentId: ceoAgent.id,
      companyId: context.companyId,
      type: 'strategy',
      title: `Strategic Plan: ${cycleId}`,
      content: JSON.stringify(planResult, null, 2),
      importance: 'critical',
      metadata: { tags: ['strategic_plan', cycleId] },
    });

    // PHASE 2: ACT
    logger.info('Phase 2: ACT', { cycleId });
    const actResult = await executeActPhase(context, ceoAgent.id, planResult);

    // PHASE 3: REFLECT
    logger.info('Phase 3: REFLECT', { cycleId });
    const reflectResult = await executeReflectPhase(context, ceoAgent.id, planResult, actResult);

    // Store learnings
    for (const learning of reflectResult.learnings) {
      await storeMemory({
        agentId: ceoAgent.id,
        companyId: context.companyId,
        type: learning.type === 'failure_lesson' ? 'failure_lesson' : 'strategy',
        title: `Learning: ${learning.type}`,
        content: learning.content,
        importance: learning.confidence > 0.8 ? 'high' : 'medium',
        metadata: {
          tags: [learning.type, cycleId, ...learning.relatedGoals],
        },
      });
    }

    const endTime = new Date();
    const result: ReasoningLoopResult = {
      cycleId,
      startTime,
      endTime,
      phases: {
        plan: planResult,
        act: actResult,
        reflect: reflectResult,
      },
      overallSuccess: planResult.success && actResult.success && reflectResult.success,
      summary: generateLoopSummary(planResult, actResult, reflectResult),
    };

    // Save state snapshot (using 'hourly' as the closest match for reasoning cycle)
    await saveStateSnapshot(context.companyId, 'hourly');

    logger.info('CEO Reasoning Loop completed', {
      cycleId,
      duration: endTime.getTime() - startTime.getTime(),
      success: result.overallSuccess,
    });

    return result;
  } catch (error) {
    logger.error('CEO Reasoning Loop failed', { cycleId, error: String(error) });
    throw error;
  }
}

// ==================== PHASE 1: PLAN ====================

async function executePlanPhase(
  context: ReasoningContext,
  ceoAgentId: string
): Promise<PlanPhaseResult> {
  // Step 1.1: Situation Analysis (SWOT)
  const situation = await analyzeSituation(context);

  // Step 1.2: Define Strategic Goals
  const goals = await defineStrategicGoals(context, situation);

  // Step 1.3: Formulate Strategy
  const strategy = await formulateStrategy(context, situation, goals);

  // Step 1.4: Risk Assessment
  const risksAndMitigations = await assessRisks(context, strategy);

  return {
    situation,
    goals,
    strategy,
    risksAndMitigations,
    success: true,
  };
}

async function analyzeSituation(context: ReasoningContext): Promise<SituationAnalysis> {
  const stateForDecision = await getStateForDecisionMaking(context.companyId);

  // Get strategy horizon context
  const strategyContext = await getStrategyContextForReasoning(context.companyId);

  const prompt = `As CEO, perform a thorough SWOT analysis of the current company situation.

## Company State
${stateForDecision.summary}

## Key Metrics
${JSON.stringify(stateForDecision.keyMetrics, null, 2)}

## Strategy Horizon Context
### Quarterly Vision (Long-term)
${strategyContext.quarterly ? `
Vision: ${strategyContext.quarterly.vision}
Progress: ${strategyContext.quarterly.progress}%
Objectives: ${strategyContext.quarterly.objectives.map(o => `- ${o.title} (${o.progress}%)`).join('\n')}
` : 'No quarterly vision defined'}

### Weekly Goals (Mid-term)
${strategyContext.weekly ? `
Theme: ${strategyContext.weekly.theme}
Progress: ${strategyContext.weekly.progress}%
Objectives: ${strategyContext.weekly.objectives.map(o => `- ${o.title} (${o.progress}%)`).join('\n')}
` : 'No weekly goals defined'}

### Daily Priorities (Short-term)
${strategyContext.daily ? `
Theme: ${strategyContext.daily.theme}
Progress: ${strategyContext.daily.progress}%
Priorities: ${strategyContext.daily.priorities.map(p => `- [${p.rank}] ${p.title}`).join('\n')}
` : 'No daily strategy defined'}

### Strategy Alignment
Score: ${strategyContext.alignment.score}%
Issues: ${strategyContext.alignment.issues.length > 0 ? strategyContext.alignment.issues.join(', ') : 'None'}

## Critical Issues
${stateForDecision.criticalIssues.map(i => `- ${i}`).join('\n') || 'None'}

## Opportunities
${stateForDecision.opportunities.map(o => `- ${o}`).join('\n') || 'None'}

## Trigger for this analysis
${context.trigger}
${context.triggerData ? JSON.stringify(context.triggerData) : ''}

IMPORTANT: Your analysis should respect the strategy hierarchy:
- Daily decisions must align with weekly goals
- Weekly goals must align with quarterly vision

Provide a comprehensive situation analysis in JSON:
{
  "currentState": "Brief description of current operational state",
  "keyMetrics": {"metric_name": numeric_value},
  "strengths": ["Strength 1", "Strength 2"],
  "weaknesses": ["Weakness 1", "Weakness 2"],
  "opportunities": ["Opportunity 1", "Opportunity 2"],
  "threats": ["Threat 1", "Threat 2"],
  "urgentIssues": ["Issue requiring immediate attention"]
}`;

  const response = await callLLMWithRetry(prompt, 'situation_analysis');
  return parseJsonResponse<SituationAnalysis>(response);
}

async function defineStrategicGoals(
  context: ReasoningContext,
  situation: SituationAnalysis
): Promise<StrategicGoal[]> {
  // Get past learnings to inform goal setting
  const ceoAgent = await db.query.agents.findFirst({
    where: and(
      eq(schema.agents.companyId, context.companyId),
      eq(schema.agents.role, 'CEO')
    ),
  });

  let pastLearnings: string[] = [];
  if (ceoAgent) {
    pastLearnings = await extractLearningsFromMemories(ceoAgent.id);
  }

  // Get strategy horizon context
  const strategyContext = await getStrategyContextForReasoning(context.companyId);

  const prompt = `Based on the situation analysis, define 3-5 strategic goals that align with strategy horizons.

## Situation Analysis
${JSON.stringify(situation, null, 2)}

## Strategy Horizon Constraints
### Quarterly Vision (must align with)
${strategyContext.quarterly ? `
Vision: ${strategyContext.quarterly.vision}
Key Objectives: ${strategyContext.quarterly.objectives.map(o => o.title).join(', ')}
` : 'No quarterly vision - you may define foundational goals'}

### Weekly Goals (must contribute to)
${strategyContext.weekly ? `
Theme: ${strategyContext.weekly.theme}
Key Objectives: ${strategyContext.weekly.objectives.map(o => o.title).join(', ')}
` : 'No weekly goals - goals should be self-contained'}

### Daily Focus
${strategyContext.daily ? `
Theme: ${strategyContext.daily.theme}
Top Priorities: ${strategyContext.daily.priorities.slice(0, 3).map(p => p.title).join(', ')}
` : 'No daily strategy'}

## Past Learnings
${pastLearnings.length > 0 ? pastLearnings.join('\n') : 'No past learnings available'}

## Requirements
- Goals MUST align with quarterly vision (if exists)
- Goals MUST contribute to weekly objectives (if exists)
- Goals should address urgent issues first
- Goals should leverage strengths
- Goals should mitigate weaknesses
- Each goal should have clear success criteria

Provide goals in JSON array format:
[
  {
    "id": "goal-1",
    "title": "Goal title",
    "description": "Detailed description",
    "priority": "critical|high|medium|low",
    "timeframe": "immediate|short_term|medium_term|long_term",
    "successCriteria": ["Criterion 1", "Criterion 2"],
    "dependencies": ["goal-id or external dependency"]
  }
]`;

  const response = await callLLMWithRetry(prompt, 'define_goals');
  return parseJsonArrayResponse<StrategicGoal>(response);
}

async function formulateStrategy(
  context: ReasoningContext,
  situation: SituationAnalysis,
  goals: StrategicGoal[]
): Promise<Strategy> {
  // Get available agents and their capabilities
  const agents = await db.query.agents.findMany({
    where: eq(schema.agents.companyId, context.companyId),
  });

  const agentCapabilities = agents.map((a: AgentRecord) => ({
    role: a.role,
    capabilities: a.capabilities,
    status: a.status,
    performance: a.performanceScore,
  }));

  const prompt = `Formulate a strategy to achieve the defined goals.

## Situation
${JSON.stringify(situation, null, 2)}

## Goals
${JSON.stringify(goals, null, 2)}

## Available Resources (Agents)
${JSON.stringify(agentCapabilities, null, 2)}

## Budget State
${JSON.stringify(context.companyState.budgetState, null, 2)}

Create a comprehensive strategy:
{
  "mainThrust": "The primary strategic direction in one sentence",
  "keyInitiatives": [
    {
      "id": "init-1",
      "title": "Initiative title",
      "description": "What this initiative will accomplish",
      "owner": "Agent role responsible",
      "tasks": ["Task 1", "Task 2"],
      "priority": 1
    }
  ],
  "resourceAllocation": [
    {
      "resource": "Resource name (agent role, budget category)",
      "allocation": 30,
      "rationale": "Why this allocation"
    }
  ],
  "expectedOutcomes": ["Outcome 1", "Outcome 2"]
}`;

  const response = await callLLMWithRetry(prompt, 'formulate_strategy');
  return parseJsonResponse<Strategy>(response);
}

async function assessRisks(
  context: ReasoningContext,
  strategy: Strategy
): Promise<RiskMitigation[]> {
  const prompt = `Assess risks associated with this strategy and propose mitigations.

## Strategy
${JSON.stringify(strategy, null, 2)}

## Company Health Score
${context.companyState.healthScore}

## Active Alerts
${JSON.stringify(context.companyState.activeAlerts || [], null, 2)}

Identify key risks and mitigations:
[
  {
    "risk": "Description of the risk",
    "probability": "high|medium|low",
    "impact": "high|medium|low",
    "mitigation": "How to mitigate this risk",
    "owner": "Who is responsible for monitoring/mitigating"
  }
]`;

  const response = await callLLMWithRetry(prompt, 'assess_risks');
  return parseJsonArrayResponse<RiskMitigation>(response);
}

// ==================== PHASE 2: ACT ====================

async function executeActPhase(
  context: ReasoningContext,
  ceoAgentId: string,
  plan: PlanPhaseResult
): Promise<ActPhaseResult> {
  const actionsExecuted: ExecutedAction[] = [];
  const tasksDelegated: DelegatedTask[] = [];
  let messagesSent = 0;

  // Execute each initiative from the strategy
  for (const initiative of plan.strategy.keyInitiatives) {
    // Find the best agent for this initiative
    const agent = await findBestAgentForInitiative(context.companyId, initiative.owner);

    if (agent) {
      // Delegate the initiative as a task
      const delegationResult = await delegateInitiativeToAgent(
        context,
        ceoAgentId,
        agent,
        initiative,
        plan.goals
      );

      if (delegationResult.success) {
        tasksDelegated.push({
          taskId: delegationResult.taskId!,
          agentId: agent.id,
          agentRole: agent.role,
          goal: initiative.title,
        });
        messagesSent++;
      }

      actionsExecuted.push({
        id: `action-${Date.now()}-${initiative.id}`,
        type: 'delegate_initiative',
        target: agent.id,
        result: delegationResult.success ? 'success' : 'failed',
        details: delegationResult.message,
      });
    } else {
      logger.warn('No suitable agent found for initiative', {
        initiative: initiative.title,
        requiredRole: initiative.owner,
      });

      actionsExecuted.push({
        id: `action-${Date.now()}-${initiative.id}`,
        type: 'delegate_initiative',
        target: 'none',
        result: 'failed',
        details: `No agent with role ${initiative.owner} available`,
      });
    }
  }

  // Handle high-priority risks
  for (const risk of plan.risksAndMitigations) {
    if (risk.probability === 'high' || risk.impact === 'high') {
      const mitigationAction = await executeRiskMitigation(context, ceoAgentId, risk);
      actionsExecuted.push(mitigationAction);
      if (mitigationAction.result === 'success') {
        messagesSent++;
      }
    }
  }

  // Notify about urgent issues
  if (plan.situation.urgentIssues.length > 0) {
    await notifyUrgentIssues(context, plan.situation.urgentIssues);
    messagesSent++;
  }

  return {
    actionsExecuted,
    tasksDelegated,
    messagessSent: messagesSent,
    success: actionsExecuted.some(a => a.result === 'success'),
  };
}

type AgentRecord = typeof schema.agents.$inferSelect;

async function findBestAgentForInitiative(
  companyId: string,
  role: string
): Promise<AgentRecord | null> {
  // First, try to find an agent with the exact role
  let agent = await db.query.agents.findFirst({
    where: and(
      eq(schema.agents.companyId, companyId),
      eq(schema.agents.role, role),
      eq(schema.agents.status, 'active')
    ),
    orderBy: [desc(schema.agents.performanceScore)],
  });

  if (agent) return agent;

  // Try to find any active agent
  agent = await db.query.agents.findFirst({
    where: and(
      eq(schema.agents.companyId, companyId),
      eq(schema.agents.status, 'active')
    ),
    orderBy: [desc(schema.agents.performanceScore)],
  });

  return agent || null;
}

async function delegateInitiativeToAgent(
  context: ReasoningContext,
  ceoAgentId: string,
  agent: AgentRecord,
  initiative: Initiative,
  goals: StrategicGoal[]
): Promise<{ success: boolean; taskId?: string; message: string }> {
  try {
    // Find related goal
    const relatedGoal = goals.find(g =>
      initiative.tasks.some(t => t.toLowerCase().includes(g.title.toLowerCase())) ||
      initiative.title.toLowerCase().includes(g.title.toLowerCase())
    );

    // Create task in database
    const [task] = await db
      .insert(schema.tasks)
      .values({
        companyId: context.companyId,
        title: initiative.title,
        description: initiative.description,
        assignedAgentId: agent.id,
        priority: initiative.priority <= 1 ? 'critical' : initiative.priority <= 2 ? 'high' : 'medium',
        status: 'pending',
        metadata: {
          initiative: initiative.id,
          tasks: initiative.tasks,
          relatedGoal: relatedGoal?.id,
        },
      })
      .returning();

    // Send delegation message via Communication Protocol
    await delegateTask(ceoAgentId, agent.id, {
      taskId: task.id,
      title: initiative.title,
      description: initiative.description,
      priority: initiative.priority <= 1 ? 'critical' : initiative.priority <= 2 ? 'high' : 'medium',
      context: `Strategic goal: ${relatedGoal?.title || 'General improvement'}. Subtasks: ${initiative.tasks.join(', ')}`,
    });

    return {
      success: true,
      taskId: task.id,
      message: `Initiative delegated to ${agent.name}`,
    };
  } catch (error) {
    logger.error('Failed to delegate initiative', { error: String(error) });
    return {
      success: false,
      message: String(error),
    };
  }
}

async function executeRiskMitigation(
  context: ReasoningContext,
  ceoAgentId: string,
  risk: RiskMitigation
): Promise<ExecutedAction> {
  try {
    // Find agent responsible for this risk
    const agent = await findBestAgentForInitiative(context.companyId, risk.owner);

    if (agent) {
      // Send alert message
      await sendAgentMessage({
        senderAgentId: ceoAgentId,
        receiverAgentId: agent.id,
        messageType: 'escalation',
        priority: risk.probability === 'high' && risk.impact === 'high' ? 'critical' : 'high',
        goal: `Mitigate risk: ${risk.risk}`,
        context: {
          situation: `Risk identified: ${risk.risk} (Probability: ${risk.probability}, Impact: ${risk.impact})`,
        },
        content: {
          summary: `Risk mitigation required`,
          details: risk.mitigation,
          actions: [{ action: risk.mitigation, reason: 'Prevent identified risk' }],
          recommendations: [],
        },
      });

      return {
        id: `risk-${Date.now()}`,
        type: 'risk_mitigation',
        target: agent.id,
        result: 'success',
        details: `Risk alert sent to ${agent.name}: ${risk.risk}`,
      };
    }

    return {
      id: `risk-${Date.now()}`,
      type: 'risk_mitigation',
      target: 'none',
      result: 'failed',
      details: `No agent found for role ${risk.owner}`,
    };
  } catch (error) {
    return {
      id: `risk-${Date.now()}`,
      type: 'risk_mitigation',
      target: 'unknown',
      result: 'failed',
      details: String(error),
    };
  }
}

async function notifyUrgentIssues(context: ReasoningContext, issues: string[]): Promise<void> {
  const company = await db.query.companies.findFirst({
    where: eq(schema.companies.id, context.companyId),
  });

  if (company?.ownerId) {
    await queueNotification({
      type: 'system_alert',
      userId: company.ownerId,
      companyId: context.companyId,
      title: 'Urgent Issues Detected',
      message: `${issues.length} urgent issues require attention`,
      metadata: { issues },
    });
  }
}

// ==================== PHASE 3: REFLECT ====================

async function executeReflectPhase(
  context: ReasoningContext,
  ceoAgentId: string,
  plan: PlanPhaseResult,
  actResult: ActPhaseResult
): Promise<ReflectPhaseResult> {
  // Step 3.1: Analyze outcomes
  const outcomes = await analyzeOutcomes(context, plan, actResult);

  // Step 3.2: Extract learnings
  const learnings = await extractLearnings(context, plan, actResult, outcomes);

  // Step 3.3: Identify strategy adjustments
  const adjustments = await identifyAdjustments(context, plan, outcomes, learnings);

  // Step 3.4: Generate recommendations for next cycle
  const nextCycleRecommendations = await generateNextCycleRecommendations(
    context,
    outcomes,
    learnings,
    adjustments
  );

  return {
    outcomes,
    learnings,
    adjustments,
    nextCycleRecommendations,
    success: true,
  };
}

async function analyzeOutcomes(
  context: ReasoningContext,
  plan: PlanPhaseResult,
  actResult: ActPhaseResult
): Promise<OutcomeAnalysis[]> {
  const outcomes: OutcomeAnalysis[] = [];

  for (const goal of plan.goals) {
    // Check if any tasks were delegated for this goal
    const relatedTasks = actResult.tasksDelegated.filter(t =>
      t.goal.toLowerCase().includes(goal.title.toLowerCase())
    );

    // Get actual task status
    const taskStatuses: Array<TaskRecord | undefined> = await Promise.all(
      relatedTasks.map(async (t: DelegatedTask) => {
        const task = await db.query.tasks.findFirst({
          where: eq(schema.tasks.id, t.taskId),
        });
        return task;
      })
    );

    const completedCount = taskStatuses.filter((t: TaskRecord | undefined): t is TaskRecord => t?.status === 'completed').length;
    const failedCount = taskStatuses.filter((t: TaskRecord | undefined): t is TaskRecord => t?.status === 'failed').length;

    outcomes.push({
      goalId: goal.id,
      goalTitle: goal.title,
      achieved: relatedTasks.length > 0 && completedCount === relatedTasks.length,
      metrics: {
        tasks_delegated: { expected: 1, actual: relatedTasks.length },
        tasks_completed: { expected: relatedTasks.length, actual: completedCount },
        tasks_failed: { expected: 0, actual: failedCount },
      },
      analysis: relatedTasks.length === 0
        ? 'No tasks were delegated for this goal'
        : `${completedCount}/${relatedTasks.length} tasks completed, ${failedCount} failed`,
    });
  }

  return outcomes;
}

async function extractLearnings(
  context: ReasoningContext,
  plan: PlanPhaseResult,
  actResult: ActPhaseResult,
  outcomes: OutcomeAnalysis[]
): Promise<Learning[]> {
  const prompt = `Analyze the execution results and extract learnings.

## Plan
${JSON.stringify(plan, null, 2)}

## Actions Executed
${JSON.stringify(actResult.actionsExecuted, null, 2)}

## Outcomes
${JSON.stringify(outcomes, null, 2)}

Extract learnings in JSON array format:
[
  {
    "type": "success_pattern|failure_lesson|process_improvement|insight",
    "content": "The learning content",
    "confidence": 0.8,
    "actionable": true,
    "relatedGoals": ["goal-id"]
  }
]

Focus on:
1. What worked well and why
2. What failed and why
3. Process improvements
4. New insights discovered`;

  const response = await callLLMWithRetry(prompt, 'extract_learnings');
  return parseJsonArrayResponse<Learning>(response);
}

async function identifyAdjustments(
  context: ReasoningContext,
  plan: PlanPhaseResult,
  outcomes: OutcomeAnalysis[],
  learnings: Learning[]
): Promise<StrategyAdjustment[]> {
  const prompt = `Based on outcomes and learnings, identify necessary strategy adjustments.

## Original Strategy
${JSON.stringify(plan.strategy, null, 2)}

## Outcomes
${JSON.stringify(outcomes, null, 2)}

## Learnings
${JSON.stringify(learnings, null, 2)}

Identify strategy adjustments:
[
  {
    "aspect": "Which aspect of strategy to adjust",
    "currentApproach": "What we're currently doing",
    "recommendedChange": "What we should change",
    "rationale": "Why this change is needed",
    "priority": "immediate|next_cycle|future"
  }
]`;

  const response = await callLLMWithRetry(prompt, 'identify_adjustments');
  return parseJsonArrayResponse<StrategyAdjustment>(response);
}

async function generateNextCycleRecommendations(
  context: ReasoningContext,
  outcomes: OutcomeAnalysis[],
  learnings: Learning[],
  adjustments: StrategyAdjustment[]
): Promise<string[]> {
  const prompt = `Generate specific recommendations for the next reasoning cycle.

## Outcomes
${JSON.stringify(outcomes, null, 2)}

## Learnings
${JSON.stringify(learnings, null, 2)}

## Adjustments
${JSON.stringify(adjustments, null, 2)}

Provide 3-5 specific, actionable recommendations for the next cycle.
Return as JSON array of strings:
["Recommendation 1", "Recommendation 2", ...]`;

  const response = await callLLMWithRetry(prompt, 'next_cycle_recommendations');
  return parseJsonArrayResponse<string>(response);
}

// ==================== UTILITIES ====================

async function getOrCreateCEOAgent(companyId: string): Promise<typeof schema.agents.$inferSelect> {
  let ceoAgent = await db.query.agents.findFirst({
    where: and(
      eq(schema.agents.companyId, companyId),
      eq(schema.agents.role, 'CEO')
    ),
  });

  if (!ceoAgent) {
    const [newAgent] = await db
      .insert(schema.agents)
      .values({
        companyId,
        name: 'CEO Agent',
        role: 'CEO',
        description: 'Strategic decision-making and company leadership',
        capabilities: ['strategic_planning', 'decision_making', 'delegation', 'analysis'],
        status: 'active',
      })
      .returning();

    ceoAgent = newAgent;
    logger.info('CEO Agent created', { companyId, agentId: ceoAgent.id });
  }

  return ceoAgent;
}

async function callLLMWithRetry(prompt: string, context: string): Promise<string> {
  const messages: LLMMessage[] = [
    {
      role: 'system',
      content: `You are an AI CEO with advanced strategic reasoning capabilities.
You analyze situations thoroughly and make data-driven decisions.
Always respond with valid JSON as requested.
Be concise but comprehensive.`,
    },
    { role: 'user', content: prompt },
  ];

  try {
    const response = await callLLM(messages, { temperature: 0.5, maxTokens: 2000 });
    return response.content;
  } catch (error) {
    logger.error(`LLM call failed for ${context}`, { error: String(error) });
    throw error;
  }
}

function parseJsonResponse<T>(response: string): T {
  const jsonMatch = response.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error('No valid JSON object in response');
  }
  return JSON.parse(jsonMatch[0]) as T;
}

function parseJsonArrayResponse<T>(response: string): T[] {
  const jsonMatch = response.match(/\[[\s\S]*\]/);
  if (!jsonMatch) {
    throw new Error('No valid JSON array in response');
  }
  return JSON.parse(jsonMatch[0]) as T[];
}

function generateLoopSummary(
  plan: PlanPhaseResult,
  act: ActPhaseResult,
  reflect: ReflectPhaseResult
): string {
  const goalsCount = plan.goals.length;
  const actionsCount = act.actionsExecuted.length;
  const successfulActions = act.actionsExecuted.filter(a => a.result === 'success').length;
  const learningsCount = reflect.learnings.length;
  const adjustmentsCount = reflect.adjustments.filter(a => a.priority === 'immediate').length;

  return `Reasoning cycle completed: ${goalsCount} goals defined, ${successfulActions}/${actionsCount} actions succeeded, ${learningsCount} learnings extracted, ${adjustmentsCount} immediate adjustments recommended.`;
}

// ==================== EXPORTS ====================

export {
  executePlanPhase,
  executeActPhase,
  executeReflectPhase,
  analyzeSituation,
  defineStrategicGoals,
  formulateStrategy,
  assessRisks,
};
