import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { eq, and, desc, sql, gte } from 'drizzle-orm';
import * as schema from '@1person/core/db';
import { callLLM, type LLMMessage } from '../lib/llm';
import { agentLogger } from '../lib/logger';

const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/oneperson';
const client = postgres(DATABASE_URL);
const db = drizzle(client, { schema });

export interface EvolutionResult {
  agentId: string;
  insights: string[];
  skillUpdates: Array<{
    skill: string;
    previousLevel: number;
    newLevel: number;
    reason: string;
  }>;
  recommendations: string[];
  learningPoints: string[];
}

export interface PerformanceAnalysis {
  successRate: number;
  averageExecutionTime: number;
  costEfficiency: number;
  strengths: string[];
  weaknesses: string[];
  improvementAreas: string[];
}

// Analyze agent's recent performance
export async function analyzeAgentPerformance(
  agentId: string,
  daysPeriod: number = 7
): Promise<PerformanceAnalysis> {
  const logger = agentLogger.child({ agentId });
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - daysPeriod);

  // Get recent tasks
  const tasks = await db.query.tasks.findMany({
    where: and(
      eq(schema.tasks.assignedAgentId, agentId),
      gte(schema.tasks.createdAt, startDate)
    ),
    orderBy: [desc(schema.tasks.createdAt)],
    limit: 100,
  });

  // Get action logs
  const logs = await db.query.actionLogs.findMany({
    where: and(
      eq(schema.actionLogs.agentId, agentId),
      gte(schema.actionLogs.createdAt, startDate)
    ),
  });

  // Calculate metrics
  const completed = tasks.filter((t) => t.status === 'completed').length;
  const failed = tasks.filter((t) => t.status === 'failed').length;
  const total = tasks.length;

  const successRate = total > 0 ? (completed / total) * 100 : 0;
  const averageExecutionTime =
    logs.length > 0
      ? logs.reduce((sum, l) => sum + (l.latencyMs || 0), 0) / logs.length
      : 0;
  const totalCost = logs.reduce((sum, l) => sum + parseFloat(l.cost || '0'), 0);
  const costEfficiency = completed > 0 ? totalCost / completed : 0;

  // Analyze task types
  const taskTypeSuccess = new Map<string, { success: number; fail: number }>();
  for (const task of tasks) {
    const type = task.type || 'general';
    const current = taskTypeSuccess.get(type) || { success: 0, fail: 0 };
    if (task.status === 'completed') current.success++;
    else if (task.status === 'failed') current.fail++;
    taskTypeSuccess.set(type, current);
  }

  // Identify strengths and weaknesses
  const strengths: string[] = [];
  const weaknesses: string[] = [];
  const improvementAreas: string[] = [];

  for (const [type, stats] of taskTypeSuccess) {
    const typeSuccessRate = (stats.success / (stats.success + stats.fail)) * 100;
    if (typeSuccessRate >= 80 && stats.success >= 3) {
      strengths.push(`High success rate in ${type} tasks (${typeSuccessRate.toFixed(0)}%)`);
    } else if (typeSuccessRate < 60 && stats.fail >= 2) {
      weaknesses.push(`Low success rate in ${type} tasks (${typeSuccessRate.toFixed(0)}%)`);
      improvementAreas.push(`Focus on improving ${type} task handling`);
    }
  }

  if (successRate >= 90) {
    strengths.push('Excellent overall task completion rate');
  } else if (successRate < 70) {
    weaknesses.push('Task completion rate needs improvement');
    improvementAreas.push('Analyze failed tasks for common patterns');
  }

  if (costEfficiency < 0.01) {
    strengths.push('Cost-efficient task execution');
  } else if (costEfficiency > 0.1) {
    improvementAreas.push('Consider optimizing prompts for cost efficiency');
  }

  logger.info('Performance analysis completed', {
    successRate,
    averageExecutionTime,
    costEfficiency,
    tasksAnalyzed: total,
  });

  return {
    successRate,
    averageExecutionTime,
    costEfficiency,
    strengths,
    weaknesses,
    improvementAreas,
  };
}

// Learn from completed tasks
export async function learnFromTasks(agentId: string): Promise<string[]> {
  const logger = agentLogger.child({ agentId });

  // Get recent successful tasks with their outputs
  const successfulTasks = await db.query.tasks.findMany({
    where: and(
      eq(schema.tasks.assignedAgentId, agentId),
      eq(schema.tasks.status, 'completed')
    ),
    orderBy: [desc(schema.tasks.completedAt)],
    limit: 10,
  });

  if (successfulTasks.length < 3) {
    return ['Need more completed tasks to extract learning patterns'];
  }

  // Get agent info
  const agent = await db.query.agents.findFirst({
    where: eq(schema.agents.id, agentId),
    with: { company: true },
  });

  if (!agent) {
    throw new Error(`Agent not found: ${agentId}`);
  }

  // Use LLM to extract learning patterns
  const taskSummaries = successfulTasks.map((t) => ({
    title: t.title,
    type: t.type,
    description: t.description,
    output: typeof t.output === 'object' ? JSON.stringify(t.output).slice(0, 500) : String(t.output || '').slice(0, 500),
  }));

  const messages: LLMMessage[] = [
    {
      role: 'system',
      content: `You are analyzing the work of an AI agent named "${agent.name}" (${agent.role}) to extract learning patterns.
Identify patterns in successful task completions that can help improve future performance.
Focus on: effective strategies, common approaches, efficient techniques.
Respond with a JSON array of 3-5 key learnings.`,
    },
    {
      role: 'user',
      content: `Analyze these successful tasks and extract key learnings:

${JSON.stringify(taskSummaries, null, 2)}

Respond with JSON: { "learnings": ["learning 1", "learning 2", ...] }`,
    },
  ];

  try {
    const response = await callLLM(messages, { temperature: 0.3, skipRetry: true });
    const jsonMatch = response.content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      logger.info('Extracted learnings from tasks', { count: parsed.learnings?.length || 0 });
      return parsed.learnings || [];
    }
  } catch (error) {
    logger.error('Failed to extract learnings', { error: String(error) });
  }

  return [];
}

// Generate evolution recommendations
export async function generateEvolutionRecommendations(
  agentId: string
): Promise<EvolutionResult> {
  const logger = agentLogger.child({ agentId });
  logger.info('Starting evolution analysis');

  // Get agent
  const agent = await db.query.agents.findFirst({
    where: eq(schema.agents.id, agentId),
    with: { company: true },
  });

  if (!agent) {
    throw new Error(`Agent not found: ${agentId}`);
  }

  // Analyze performance
  const performance = await analyzeAgentPerformance(agentId);

  // Learn from tasks
  const learningPoints = await learnFromTasks(agentId);

  // Current capabilities
  const capabilities = (agent.capabilities || []) as Array<{
    name: string;
    level: string;
    description: string;
  }>;

  // Generate skill update recommendations
  const messages: LLMMessage[] = [
    {
      role: 'system',
      content: `You are an AI evolution system. Analyze agent performance and recommend skill level changes.
Skill levels: novice (0-20), beginner (21-40), intermediate (41-60), advanced (61-80), expert (81-100).
Based on performance data, suggest which skills should be upgraded or need more work.`,
    },
    {
      role: 'user',
      content: `Agent: ${agent.name} (${agent.role})
Company: ${agent.company?.name}

Current Capabilities:
${JSON.stringify(capabilities, null, 2)}

Performance Analysis:
- Success Rate: ${performance.successRate.toFixed(1)}%
- Strengths: ${performance.strengths.join(', ') || 'None identified'}
- Weaknesses: ${performance.weaknesses.join(', ') || 'None identified'}
- Improvement Areas: ${performance.improvementAreas.join(', ') || 'None identified'}

Learning Points:
${learningPoints.map((l) => `- ${l}`).join('\n') || 'None yet'}

Generate evolution recommendations in JSON:
{
  "skillUpdates": [
    { "skill": "skill name", "previousLevel": 50, "newLevel": 60, "reason": "why" }
  ],
  "recommendations": ["recommendation 1", "recommendation 2"],
  "insights": ["insight 1", "insight 2"]
}`,
    },
  ];

  let skillUpdates: EvolutionResult['skillUpdates'] = [];
  let recommendations: string[] = [];
  let insights: string[] = [];

  try {
    const response = await callLLM(messages, { temperature: 0.4, skipRetry: true });
    const jsonMatch = response.content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      skillUpdates = parsed.skillUpdates || [];
      recommendations = parsed.recommendations || [];
      insights = parsed.insights || [];
    }
  } catch (error) {
    logger.error('Failed to generate evolution recommendations', { error: String(error) });
    recommendations = performance.improvementAreas;
    insights = performance.strengths.concat(performance.weaknesses);
  }

  // Save evolution record
  await db.insert(schema.evaluations).values({
    companyId: agent.companyId,
    agentId: agentId,
    periodType: 'weekly',
    periodStart: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
    periodEnd: new Date(),
    overallScore: String(performance.successRate),
    tasksCompleted: Math.round(performance.successRate),
    tasksFailed: Math.round(100 - performance.successRate),
    recommendations: recommendations,
    strengths: performance.strengths,
    weaknesses: performance.weaknesses,
  });

  logger.info('Evolution analysis completed', {
    skillUpdates: skillUpdates.length,
    recommendations: recommendations.length,
    insights: insights.length,
  });

  return {
    agentId,
    insights,
    skillUpdates,
    recommendations,
    learningPoints,
  };
}

// Apply skill updates to agent
export async function applySkillUpdates(
  agentId: string,
  updates: EvolutionResult['skillUpdates']
): Promise<void> {
  const logger = agentLogger.child({ agentId });

  const agent = await db.query.agents.findFirst({
    where: eq(schema.agents.id, agentId),
  });

  if (!agent) {
    throw new Error(`Agent not found: ${agentId}`);
  }

  const capabilities = (agent.capabilities || []) as Array<{
    name: string;
    level: string;
    description: string;
  }>;

  // Apply updates
  for (const update of updates) {
    const capIndex = capabilities.findIndex(
      (c) => c.name.toLowerCase() === update.skill.toLowerCase()
    );
    if (capIndex >= 0) {
      capabilities[capIndex].level = `${update.newLevel}`;
      logger.info('Updated skill level', {
        skill: update.skill,
        from: update.previousLevel,
        to: update.newLevel,
        reason: update.reason,
      });
    }
  }

  // Save updated capabilities
  await db
    .update(schema.agents)
    .set({ capabilities })
    .where(eq(schema.agents.id, agentId));

  logger.info('Applied skill updates', { count: updates.length });
}

// Schedule evolution for all agents
export async function evolveAllAgents(companyId?: string): Promise<EvolutionResult[]> {
  const logger = agentLogger.child({ companyId: companyId || 'all' });
  logger.info('Starting evolution cycle for agents');

  const where = companyId ? eq(schema.agents.companyId, companyId) : undefined;
  const agents = await db.query.agents.findMany({ where: where || undefined });

  const results: EvolutionResult[] = [];

  for (const agent of agents) {
    try {
      const result = await generateEvolutionRecommendations(agent.id);

      // Auto-apply minor skill updates (< 10 point changes)
      const minorUpdates = result.skillUpdates.filter(
        (u) => Math.abs(u.newLevel - u.previousLevel) <= 10
      );
      if (minorUpdates.length > 0) {
        await applySkillUpdates(agent.id, minorUpdates);
      }

      results.push(result);
    } catch (error) {
      logger.error('Failed to evolve agent', {
        agentId: agent.id,
        error: String(error),
      });
    }
  }

  logger.info('Evolution cycle completed', { agentsProcessed: results.length });
  return results;
}
