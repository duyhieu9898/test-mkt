import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { eq, and, gte, lte, sql, desc } from 'drizzle-orm';
import * as schema from '@1person/core/db';
import type { ROIMetrics, QualityMetrics, EfficiencyMetrics, EvaluationInsight, KPIScore } from '@1person/core/db';
import { callLLM, type LLMMessage } from '../lib/llm';
import { agentLogger } from '../lib/logger';
import { extractLearningsFromMemories } from './memory';

const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/oneperson';
const client = postgres(DATABASE_URL);
const db = drizzle(client, { schema });

const logger = agentLogger.child({ service: 'evaluation' });

// Task value mapping based on type and complexity
const TASK_VALUE_MAP: Record<string, number> = {
  // High-value tasks
  'campaign': 100,
  'strategy': 150,
  'analysis': 80,
  'report': 60,
  // Medium-value tasks
  'content': 50,
  'research': 40,
  'review': 30,
  // Lower-value tasks
  'email': 20,
  'response': 15,
  'other': 25,
};

export interface EvaluationResult {
  overallScore: number;
  roiMetrics: ROIMetrics;
  qualityMetrics: QualityMetrics;
  efficiencyMetrics: EfficiencyMetrics;
  kpiScores: KPIScore[];
  insights: EvaluationInsight[];
  recommendations: string[];
  rank: number;
  percentile: number;
}

// Calculate task value based on type and outcome
function calculateTaskValue(task: {
  type: string;
  status: string;
  priority: string | null;
  output?: unknown;
}): number {
  const baseValue = TASK_VALUE_MAP[task.type] || TASK_VALUE_MAP['other'];

  // Adjust based on status
  if (task.status !== 'completed') return 0;

  // Priority multiplier
  const priorityMultiplier = {
    'critical': 2.0,
    'high': 1.5,
    'medium': 1.0,
    'low': 0.7,
  }[task.priority || 'medium'] || 1.0;

  return baseValue * priorityMultiplier;
}

// Calculate ROI metrics for an agent
async function calculateROIMetrics(
  agentId: string,
  periodStart: Date,
  periodEnd: Date
): Promise<ROIMetrics> {
  // Get all tasks in period
  const tasks = await db.query.tasks.findMany({
    where: and(
      eq(schema.tasks.assignedAgentId, agentId),
      gte(schema.tasks.createdAt, periodStart),
      lte(schema.tasks.createdAt, periodEnd)
    ),
  });

  // Get all action logs for cost calculation
  const actionLogs = await db.query.actionLogs.findMany({
    where: and(
      eq(schema.actionLogs.agentId, agentId),
      gte(schema.actionLogs.createdAt, periodStart),
      lte(schema.actionLogs.createdAt, periodEnd)
    ),
  });

  // Calculate costs
  const costTotal = actionLogs.reduce((sum, log) => sum + parseFloat(log.cost || '0'), 0);

  // Calculate value delivered
  const completedTasks = tasks.filter(t => t.status === 'completed');
  const valueDelivered = completedTasks.reduce((sum, task) => sum + calculateTaskValue({
    type: task.type,
    status: task.status,
    priority: task.priority,
    output: task.output,
  }), 0);

  // Revenue estimation (value * multiplier based on task type outcomes)
  const revenueGenerated = valueDelivered * 1.2; // Assume 20% revenue margin

  // Calculate ROI
  const roi = costTotal > 0 ? ((valueDelivered - costTotal) / costTotal) * 100 : 0;

  // Cost efficiency
  const costPerTask = completedTasks.length > 0 ? costTotal / completedTasks.length : 0;
  const valuePerDollar = costTotal > 0 ? valueDelivered / costTotal : 0;

  // Efficiency score (0-100)
  const efficiencyScore = Math.min(100, Math.max(0,
    (roi > 0 ? 50 : 0) +
    (valuePerDollar > 10 ? 25 : valuePerDollar * 2.5) +
    (costPerTask < 0.1 ? 25 : Math.max(0, 25 - costPerTask * 250))
  ));

  return {
    costTotal,
    revenueGenerated,
    valueDelivered,
    roi,
    costPerTask,
    valuePerDollar,
    efficiencyScore,
  };
}

// Calculate quality metrics
async function calculateQualityMetrics(
  agentId: string,
  periodStart: Date,
  periodEnd: Date
): Promise<QualityMetrics> {
  const tasks = await db.query.tasks.findMany({
    where: and(
      eq(schema.tasks.assignedAgentId, agentId),
      gte(schema.tasks.createdAt, periodStart),
      lte(schema.tasks.createdAt, periodEnd)
    ),
  });

  const totalTasks = tasks.length;
  const completedTasks = tasks.filter(t => t.status === 'completed');
  const failedTasks = tasks.filter(t => t.status === 'failed');

  // Success rate
  const taskSuccessRate = totalTasks > 0 ? (completedTasks.length / totalTasks) * 100 : 0;

  // First time success (no retries)
  const tasksWithRetries = tasks.filter(t => (t.retryCount || 0) > 0);
  const firstTimeSuccess = totalTasks > 0
    ? ((totalTasks - tasksWithRetries.length) / totalTasks) * 100
    : 100;

  // Error recovery (failed then succeeded)
  const recoveredTasks = completedTasks.filter(t => (t.retryCount || 0) > 0);
  const errorRecoveryRate = tasksWithRetries.length > 0
    ? (recoveredTasks.length / tasksWithRetries.length) * 100
    : 100;

  // Quality score (simplified - could use LLM for detailed analysis)
  const averageQualityScore = taskSuccessRate * 0.6 + firstTimeSuccess * 0.3 + errorRecoveryRate * 0.1;

  // Customer satisfaction (based on feedback if available)
  // For now, estimate based on success metrics
  const customerSatisfaction = (taskSuccessRate + averageQualityScore) / 2;

  return {
    taskSuccessRate,
    firstTimeSuccess,
    errorRecoveryRate,
    averageQualityScore,
    customerSatisfaction,
  };
}

// Calculate efficiency metrics
async function calculateEfficiencyMetrics(
  agentId: string,
  periodStart: Date,
  periodEnd: Date
): Promise<EfficiencyMetrics> {
  const tasks = await db.query.tasks.findMany({
    where: and(
      eq(schema.tasks.assignedAgentId, agentId),
      gte(schema.tasks.createdAt, periodStart),
      lte(schema.tasks.createdAt, periodEnd)
    ),
  });

  const actionLogs = await db.query.actionLogs.findMany({
    where: and(
      eq(schema.actionLogs.agentId, agentId),
      gte(schema.actionLogs.createdAt, periodStart),
      lte(schema.actionLogs.createdAt, periodEnd)
    ),
  });

  const completedTasks = tasks.filter(t => t.status === 'completed' && t.startedAt && t.completedAt);

  // Average task duration
  const durations = completedTasks.map(t =>
    new Date(t.completedAt!).getTime() - new Date(t.startedAt!).getTime()
  );
  const averageTaskDuration = durations.length > 0
    ? durations.reduce((a, b) => a + b, 0) / durations.length
    : 0;

  // Tasks per hour
  const totalHours = (periodEnd.getTime() - periodStart.getTime()) / (1000 * 60 * 60);
  const tasksPerHour = totalHours > 0 ? completedTasks.length / totalHours : 0;

  // Tokens per task
  const totalTokens = actionLogs.reduce((sum, log) => sum + (log.tokensUsed || 0), 0);
  const tokensPerTask = completedTasks.length > 0 ? totalTokens / completedTasks.length : 0;

  // Context utilization (estimate based on task complexity)
  const contextUtilization = Math.min(100, tokensPerTask > 500 ? 80 : tokensPerTask / 6.25);

  // Memory utilization (check if memories were used)
  // This would need actual tracking - for now estimate
  const memoryUtilization = 50; // Placeholder

  return {
    averageTaskDuration,
    tasksPerHour,
    tokensPerTask,
    contextUtilization,
    memoryUtilization,
  };
}

// Generate KPI scores
function generateKPIScores(
  roiMetrics: ROIMetrics,
  qualityMetrics: QualityMetrics,
  efficiencyMetrics: EfficiencyMetrics,
  previousEvaluation?: typeof schema.evaluations.$inferSelect
): KPIScore[] {
  const getPreviousValue = (name: string): number | null => {
    if (!previousEvaluation?.kpiScores) return null;
    const prev = (previousEvaluation.kpiScores as KPIScore[]).find(k => k.name === name);
    return prev?.actualValue || null;
  };

  const getTrend = (current: number, previous: number | null): 'up' | 'down' | 'stable' => {
    if (previous === null) return 'stable';
    const change = ((current - previous) / Math.max(previous, 1)) * 100;
    if (change > 5) return 'up';
    if (change < -5) return 'down';
    return 'stable';
  };

  return [
    {
      name: 'ROI',
      targetValue: 100,
      actualValue: roiMetrics.roi,
      score: Math.min(100, Math.max(0, roiMetrics.roi)),
      trend: getTrend(roiMetrics.roi, getPreviousValue('ROI')),
    },
    {
      name: 'Task Success Rate',
      targetValue: 95,
      actualValue: qualityMetrics.taskSuccessRate,
      score: (qualityMetrics.taskSuccessRate / 95) * 100,
      trend: getTrend(qualityMetrics.taskSuccessRate, getPreviousValue('Task Success Rate')),
    },
    {
      name: 'Efficiency',
      targetValue: 80,
      actualValue: roiMetrics.efficiencyScore,
      score: (roiMetrics.efficiencyScore / 80) * 100,
      trend: getTrend(roiMetrics.efficiencyScore, getPreviousValue('Efficiency')),
    },
    {
      name: 'Quality Score',
      targetValue: 85,
      actualValue: qualityMetrics.averageQualityScore,
      score: (qualityMetrics.averageQualityScore / 85) * 100,
      trend: getTrend(qualityMetrics.averageQualityScore, getPreviousValue('Quality Score')),
    },
    {
      name: 'Cost per Task',
      targetValue: 0.05, // Target: $0.05 per task
      actualValue: roiMetrics.costPerTask,
      score: roiMetrics.costPerTask <= 0.05 ? 100 : Math.max(0, 100 - (roiMetrics.costPerTask - 0.05) * 1000),
      trend: getTrend(roiMetrics.costPerTask, getPreviousValue('Cost per Task')),
    },
  ];
}

// Generate insights using LLM
async function generateInsights(
  agent: { name: string; role: string },
  roiMetrics: ROIMetrics,
  qualityMetrics: QualityMetrics,
  efficiencyMetrics: EfficiencyMetrics,
  kpiScores: KPIScore[]
): Promise<EvaluationInsight[]> {
  const prompt = `Analyze this AI agent's performance and provide 3-4 SWOT insights:

Agent: ${agent.name} (${agent.role})

ROI Metrics:
- Total Cost: $${roiMetrics.costTotal.toFixed(4)}
- Value Delivered: $${roiMetrics.valueDelivered.toFixed(2)}
- ROI: ${roiMetrics.roi.toFixed(1)}%
- Efficiency Score: ${roiMetrics.efficiencyScore.toFixed(0)}/100

Quality Metrics:
- Task Success Rate: ${qualityMetrics.taskSuccessRate.toFixed(1)}%
- First Time Success: ${qualityMetrics.firstTimeSuccess.toFixed(1)}%
- Quality Score: ${qualityMetrics.averageQualityScore.toFixed(1)}/100

Efficiency Metrics:
- Avg Task Duration: ${(efficiencyMetrics.averageTaskDuration / 1000).toFixed(1)}s
- Tasks per Hour: ${efficiencyMetrics.tasksPerHour.toFixed(2)}
- Tokens per Task: ${efficiencyMetrics.tokensPerTask.toFixed(0)}

KPI Performance:
${kpiScores.map(k => `- ${k.name}: ${k.actualValue.toFixed(2)} (target: ${k.targetValue}, trend: ${k.trend})`).join('\n')}

Respond with JSON array of insights:
[{"type": "strength|weakness|opportunity|threat", "description": "...", "recommendation": "..."}]`;

  try {
    const response = await callLLM([
      { role: 'system', content: 'You are a performance analyst. Provide actionable insights in JSON format.' },
      { role: 'user', content: prompt },
    ], { temperature: 0.3 });

    const jsonMatch = response.content.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
  } catch (error) {
    logger.error('Failed to generate insights', { error: String(error) });
  }

  // Fallback insights
  return [
    {
      type: roiMetrics.roi > 0 ? 'strength' : 'weakness',
      description: roiMetrics.roi > 0
        ? `Positive ROI of ${roiMetrics.roi.toFixed(1)}% indicates good value generation`
        : `Negative ROI indicates cost exceeds value delivered`,
      recommendation: roiMetrics.roi > 0
        ? 'Continue current strategy while exploring efficiency improvements'
        : 'Review task prioritization and reduce low-value activities',
    },
    {
      type: qualityMetrics.taskSuccessRate >= 90 ? 'strength' : 'weakness',
      description: `Task success rate of ${qualityMetrics.taskSuccessRate.toFixed(1)}%`,
      recommendation: qualityMetrics.taskSuccessRate >= 90
        ? 'Maintain quality standards'
        : 'Investigate failure patterns and improve error handling',
    },
  ];
}

// Generate recommendations
async function generateRecommendations(
  agentId: string,
  roiMetrics: ROIMetrics,
  qualityMetrics: QualityMetrics,
  insights: EvaluationInsight[]
): Promise<string[]> {
  const recommendations: string[] = [];

  // ROI-based recommendations
  if (roiMetrics.roi < 0) {
    recommendations.push('Focus on higher-value tasks to improve ROI');
  }
  if (roiMetrics.costPerTask > 0.1) {
    recommendations.push('Optimize prompts to reduce token usage and costs');
  }
  if (roiMetrics.efficiencyScore < 50) {
    recommendations.push('Review task execution patterns for efficiency gains');
  }

  // Quality-based recommendations
  if (qualityMetrics.taskSuccessRate < 85) {
    recommendations.push('Improve task analysis before execution to reduce failures');
  }
  if (qualityMetrics.firstTimeSuccess < 80) {
    recommendations.push('Enhance initial task understanding to reduce retries');
  }

  // Get learnings from memories
  try {
    const learnings = await extractLearningsFromMemories(agentId);
    if (learnings.length > 0) {
      recommendations.push(`Apply learnings: ${learnings[0]}`);
    }
  } catch {
    // Ignore memory extraction errors
  }

  return recommendations.slice(0, 5); // Max 5 recommendations
}

// Main evaluation function
export async function evaluateAgentPerformance(
  agentId: string,
  periodType: 'daily' | 'weekly' | 'monthly',
  periodStart: Date,
  periodEnd: Date
): Promise<EvaluationResult> {
  logger.info('Starting agent evaluation', { agentId, periodType, periodStart, periodEnd });

  // Get agent info
  const agent = await db.query.agents.findFirst({
    where: eq(schema.agents.id, agentId),
    with: { company: true },
  });

  if (!agent) {
    throw new Error(`Agent not found: ${agentId}`);
  }

  // Get previous evaluation for trend comparison
  const previousEvaluation = await db.query.evaluations.findFirst({
    where: and(
      eq(schema.evaluations.agentId, agentId),
      eq(schema.evaluations.periodType, periodType)
    ),
    orderBy: [desc(schema.evaluations.createdAt)],
  });

  // Calculate all metrics
  const [roiMetrics, qualityMetrics, efficiencyMetrics] = await Promise.all([
    calculateROIMetrics(agentId, periodStart, periodEnd),
    calculateQualityMetrics(agentId, periodStart, periodEnd),
    calculateEfficiencyMetrics(agentId, periodStart, periodEnd),
  ]);

  // Generate KPI scores
  const kpiScores = generateKPIScores(roiMetrics, qualityMetrics, efficiencyMetrics, previousEvaluation);

  // Calculate overall score
  const overallScore = Math.round(
    (roiMetrics.efficiencyScore * 0.3) +
    (qualityMetrics.averageQualityScore * 0.4) +
    (Math.min(100, roiMetrics.roi > 0 ? 50 + roiMetrics.roi / 2 : 50 - Math.abs(roiMetrics.roi) / 2) * 0.3)
  );

  // Generate insights and recommendations
  const [insights, recommendations] = await Promise.all([
    generateInsights(agent, roiMetrics, qualityMetrics, efficiencyMetrics, kpiScores),
    generateRecommendations(agentId, roiMetrics, qualityMetrics, []),
  ]);

  // Get all company agents for ranking
  const companyAgents = await db.query.agents.findMany({
    where: eq(schema.agents.companyId, agent.companyId),
  });

  // Get recent evaluations for ranking
  const recentEvaluations = await db.query.evaluations.findMany({
    where: and(
      eq(schema.evaluations.companyId, agent.companyId),
      eq(schema.evaluations.periodType, periodType)
    ),
    orderBy: [desc(schema.evaluations.overallScore)],
  });

  // Calculate rank and percentile
  const sortedScores = recentEvaluations
    .map(e => parseFloat(e.overallScore || '0'))
    .sort((a, b) => b - a);

  const rank = sortedScores.findIndex(s => overallScore >= s) + 1 || sortedScores.length + 1;
  const percentile = sortedScores.length > 0
    ? ((sortedScores.length - rank + 1) / sortedScores.length) * 100
    : 50;

  // Store evaluation
  await db.insert(schema.evaluations).values({
    companyId: agent.companyId,
    agentId: agentId,
    periodType,
    periodStart,
    periodEnd,
    overallScore: String(overallScore),
    kpiScores,
    tasksCompleted: Math.round(qualityMetrics.taskSuccessRate),
    tasksFailed: Math.round(100 - qualityMetrics.taskSuccessRate),
    averageTaskTime: Math.round(efficiencyMetrics.averageTaskDuration),
    tokensUsed: Math.round(efficiencyMetrics.tokensPerTask * qualityMetrics.taskSuccessRate),
    costIncurred: String(roiMetrics.costTotal),
    roiMetrics,
    qualityMetrics,
    efficiencyMetrics,
    revenueGenerated: String(roiMetrics.revenueGenerated),
    valueDelivered: String(roiMetrics.valueDelivered),
    roi: String(roiMetrics.roi),
    insights,
    recommendations,
    rankInCompany: rank,
    percentileScore: String(percentile),
  });

  // Update agent performance score
  await db
    .update(schema.agents)
    .set({
      performanceScore: String(overallScore),
    })
    .where(eq(schema.agents.id, agentId));

  logger.info('Agent evaluation completed', {
    agentId,
    overallScore,
    roi: roiMetrics.roi,
    rank,
  });

  return {
    overallScore,
    roiMetrics,
    qualityMetrics,
    efficiencyMetrics,
    kpiScores,
    insights,
    recommendations,
    rank,
    percentile,
  };
}

// Evaluate all agents in a company
export async function evaluateCompanyAgents(
  companyId: string,
  periodType: 'daily' | 'weekly' | 'monthly'
): Promise<Map<string, EvaluationResult>> {
  const agents = await db.query.agents.findMany({
    where: eq(schema.agents.companyId, companyId),
  });

  const periodEnd = new Date();
  const periodStart = new Date();

  switch (periodType) {
    case 'daily':
      periodStart.setDate(periodStart.getDate() - 1);
      break;
    case 'weekly':
      periodStart.setDate(periodStart.getDate() - 7);
      break;
    case 'monthly':
      periodStart.setMonth(periodStart.getMonth() - 1);
      break;
  }

  const results = new Map<string, EvaluationResult>();

  for (const agent of agents) {
    try {
      const result = await evaluateAgentPerformance(agent.id, periodType, periodStart, periodEnd);
      results.set(agent.id, result);
    } catch (error) {
      logger.error('Failed to evaluate agent', { agentId: agent.id, error: String(error) });
    }
  }

  return results;
}

// Get agent performance trends
export async function getAgentPerformanceTrends(
  agentId: string,
  periodType: 'daily' | 'weekly' | 'monthly',
  limit: number = 10
): Promise<Array<{
  period: Date;
  overallScore: number;
  roi: number;
  qualityScore: number;
}>> {
  const evaluations = await db.query.evaluations.findMany({
    where: and(
      eq(schema.evaluations.agentId, agentId),
      eq(schema.evaluations.periodType, periodType)
    ),
    orderBy: [desc(schema.evaluations.periodStart)],
    limit,
  });

  return evaluations.map(e => ({
    period: e.periodStart,
    overallScore: parseFloat(e.overallScore || '0'),
    roi: parseFloat(e.roi || '0'),
    qualityScore: e.qualityMetrics?.averageQualityScore || 0,
  })).reverse();
}
