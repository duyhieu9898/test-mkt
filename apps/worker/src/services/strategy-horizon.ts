/**
 * Strategy Horizon Service
 *
 * Manages multi-level strategic planning:
 * - Quarterly Vision (Long-term) - Set every 90 days
 * - Weekly Goals (Mid-term) - Set every 7 days
 * - Daily Strategy (Short-term) - Set every day
 *
 * CEO Planning Loop uses this to ensure:
 * - Daily updates respect weekly goals
 * - Weekly reviews align with quarterly vision
 * - Quarterly planning sets long-term direction
 */

import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { eq, and, desc, gte, lte, sql, isNull } from 'drizzle-orm';
import * as schema from '@1person/core/db';
import { callLLM, type LLMMessage } from '../lib/llm';
import { agentLogger } from '../lib/logger';
import { getCompanyState, getStateForDecisionMaking } from './company-state-engine';
import { storeMemory, searchMemories } from './memory';

const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/oneperson';
const client = postgres(DATABASE_URL);
const db = drizzle(client, { schema });

const logger = agentLogger.child({ service: 'strategy-horizon' });

// Types
type StrategyHorizon = typeof schema.strategyHorizons.$inferSelect;
type StrategyHorizonInsert = typeof schema.strategyHorizons.$inferInsert;
type HorizonLevel = 'quarterly' | 'weekly' | 'daily';

interface ObjectiveKR {
  id: string;
  title: string;
  description: string;
  keyResults: Array<{
    id: string;
    metric: string;
    target: number;
    current: number;
    unit: string;
  }>;
  progress: number;
  status: 'on_track' | 'at_risk' | 'behind' | 'completed';
}

interface Priority {
  rank: number;
  title: string;
  description: string;
  category: 'growth' | 'efficiency' | 'innovation' | 'risk' | 'quality';
  effort: 'low' | 'medium' | 'high';
  impact: 'low' | 'medium' | 'high';
}

interface StrategyContext {
  companyId: string;
  horizon: HorizonLevel;
  parentStrategy?: StrategyHorizon;
  companyState?: Awaited<ReturnType<typeof getStateForDecisionMaking>>;
}

// ==================== HORIZON MANAGEMENT ====================

/**
 * Get current active strategy for a horizon level
 */
export async function getCurrentStrategy(
  companyId: string,
  horizon: HorizonLevel
): Promise<StrategyHorizon | null> {
  const now = new Date();

  const strategy = await db.query.strategyHorizons.findFirst({
    where: and(
      eq(schema.strategyHorizons.companyId, companyId),
      eq(schema.strategyHorizons.horizon, horizon),
      eq(schema.strategyHorizons.status, 'active'),
      lte(schema.strategyHorizons.periodStart, now),
      gte(schema.strategyHorizons.periodEnd, now)
    ),
    orderBy: [desc(schema.strategyHorizons.createdAt)],
  });

  return strategy || null;
}

/**
 * Get all active strategies for a company (quarterly, weekly, daily)
 */
export async function getAllActiveStrategies(companyId: string): Promise<{
  quarterly: StrategyHorizon | null;
  weekly: StrategyHorizon | null;
  daily: StrategyHorizon | null;
}> {
  const [quarterly, weekly, daily] = await Promise.all([
    getCurrentStrategy(companyId, 'quarterly'),
    getCurrentStrategy(companyId, 'weekly'),
    getCurrentStrategy(companyId, 'daily'),
  ]);

  return { quarterly, weekly, daily };
}

/**
 * Create or update strategy for a horizon
 */
export async function createStrategy(
  companyId: string,
  horizon: HorizonLevel,
  data: Partial<StrategyHorizonInsert>
): Promise<StrategyHorizon> {
  const now = new Date();

  // Calculate period boundaries
  const { periodStart, periodEnd } = calculatePeriodBoundaries(horizon, now);

  // Get parent strategy if applicable
  let parentHorizonId: string | undefined;
  if (horizon === 'weekly') {
    const quarterly = await getCurrentStrategy(companyId, 'quarterly');
    parentHorizonId = quarterly?.id;
  } else if (horizon === 'daily') {
    const weekly = await getCurrentStrategy(companyId, 'weekly');
    parentHorizonId = weekly?.id;
  }

  // Mark existing active strategy as revised
  await db
    .update(schema.strategyHorizons)
    .set({ status: 'revised', updatedAt: now })
    .where(
      and(
        eq(schema.strategyHorizons.companyId, companyId),
        eq(schema.strategyHorizons.horizon, horizon),
        eq(schema.strategyHorizons.status, 'active')
      )
    );

  // Create new strategy
  const [strategy] = await db
    .insert(schema.strategyHorizons)
    .values({
      companyId,
      horizon,
      status: 'active',
      periodStart,
      periodEnd,
      parentHorizonId,
      ...data,
      createdAt: now,
      updatedAt: now,
    })
    .returning();

  logger.info('Strategy created', { companyId, horizon, strategyId: strategy.id });

  return strategy;
}

/**
 * Update strategy progress
 */
export async function updateStrategyProgress(
  strategyId: string,
  progress: number,
  metrics?: Record<string, number>
): Promise<void> {
  const now = new Date();

  await db
    .update(schema.strategyHorizons)
    .set({
      overallProgress: Math.min(100, Math.max(0, progress)),
      updatedAt: now,
    })
    .where(eq(schema.strategyHorizons.id, strategyId));

  logger.debug('Strategy progress updated', { strategyId, progress });
}

/**
 * Complete a strategy
 */
export async function completeStrategy(strategyId: string): Promise<void> {
  const now = new Date();

  await db
    .update(schema.strategyHorizons)
    .set({
      status: 'completed',
      overallProgress: 100,
      updatedAt: now,
    })
    .where(eq(schema.strategyHorizons.id, strategyId));

  logger.info('Strategy completed', { strategyId });
}

// ==================== AI-POWERED STRATEGY GENERATION ====================

/**
 * Generate quarterly vision using AI
 */
export async function generateQuarterlyVision(
  companyId: string,
  userInput?: {
    vision?: string;
    priorities?: string[];
    constraints?: string[];
  }
): Promise<StrategyHorizon> {
  logger.info('Generating quarterly vision', { companyId });

  const companyState = await getStateForDecisionMaking(companyId);

  // Get past learnings
  const ceoAgent = await db.query.agents.findFirst({
    where: and(
      eq(schema.agents.companyId, companyId),
      eq(schema.agents.role, 'ceo')
    ),
  });

  let pastLearnings: string[] = [];
  if (ceoAgent) {
    const memories = await searchMemories(ceoAgent.id, 'quarterly strategy learnings', { limit: 5 });
    pastLearnings = memories.map(m => m.content);
  }

  const prompt = `As an AI CEO, create a comprehensive quarterly vision and strategy.

## Company Current State
${companyState.summary}

## Key Metrics
${JSON.stringify(companyState.keyMetrics, null, 2)}

## User Input
${userInput?.vision ? `Vision: ${userInput.vision}` : ''}
${userInput?.priorities?.length ? `Priorities: ${userInput.priorities.join(', ')}` : ''}
${userInput?.constraints?.length ? `Constraints: ${userInput.constraints.join(', ')}` : ''}

## Past Learnings
${pastLearnings.length > 0 ? pastLearnings.join('\n') : 'No past learnings'}

Generate a quarterly strategy in JSON format:
{
  "vision": "90-day vision statement",
  "mission": "What we're trying to achieve this quarter",
  "theme": "Short theme name (e.g., 'Growth Quarter')",
  "objectives": [
    {
      "id": "obj-1",
      "title": "Objective title",
      "description": "What this objective means",
      "keyResults": [
        {
          "id": "kr-1",
          "metric": "Metric name",
          "target": 100,
          "current": 0,
          "unit": "units"
        }
      ],
      "progress": 0,
      "status": "on_track"
    }
  ],
  "priorities": [
    {
      "rank": 1,
      "title": "Priority title",
      "description": "Why this is a priority",
      "category": "growth|efficiency|innovation|risk|quality",
      "effort": "low|medium|high",
      "impact": "low|medium|high"
    }
  ],
  "resourceAllocation": {
    "budget": {
      "total": 10000,
      "allocated": 0,
      "byCategory": {}
    },
    "agents": {
      "total": 5,
      "byDepartment": {},
      "byRole": {}
    },
    "focus": {
      "growth": 40,
      "operations": 30,
      "innovation": 20,
      "support": 10
    }
  },
  "constraints": {
    "budgetLimit": 10000,
    "maxAgents": 10,
    "mustComplete": ["Critical items"],
    "mustAvoid": ["Things to avoid"],
    "dependencies": []
  },
  "successMetrics": [
    {
      "metric": "Revenue",
      "baseline": 0,
      "target": 10000,
      "current": 0,
      "trend": "stable"
    }
  ]
}`;

  const messages: LLMMessage[] = [
    {
      role: 'system',
      content: 'You are an AI CEO creating quarterly strategic plans. Be ambitious but realistic.',
    },
    { role: 'user', content: prompt },
  ];

  const response = await callLLM(messages, { temperature: 0.6 });
  const parsed = parseJsonResponse(response.content);

  const strategy = await createStrategy(companyId, 'quarterly', {
    vision: parsed.vision as string | undefined,
    mission: parsed.mission as string | undefined,
    theme: parsed.theme as string | undefined,
    objectives: parsed.objectives as StrategyHorizonInsert['objectives'],
    priorities: parsed.priorities as StrategyHorizonInsert['priorities'],
    resourceAllocation: parsed.resourceAllocation as StrategyHorizonInsert['resourceAllocation'],
    constraints: parsed.constraints as StrategyHorizonInsert['constraints'],
    successMetrics: parsed.successMetrics as StrategyHorizonInsert['successMetrics'],
    overallProgress: 0,
    healthScore: 100,
    createdBy: 'ceo_agent',
  });

  return strategy;
}

/**
 * Generate weekly goals aligned with quarterly vision
 */
export async function generateWeeklyGoals(companyId: string): Promise<StrategyHorizon> {
  logger.info('Generating weekly goals', { companyId });

  const quarterlyStrategy = await getCurrentStrategy(companyId, 'quarterly');
  const companyState = await getStateForDecisionMaking(companyId);

  if (!quarterlyStrategy) {
    throw new Error('No active quarterly strategy. Create quarterly vision first.');
  }

  const prompt = `Create weekly goals that align with the quarterly vision.

## Quarterly Vision
${quarterlyStrategy.vision}
Theme: ${quarterlyStrategy.theme}

## Quarterly Objectives
${JSON.stringify(quarterlyStrategy.objectives, null, 2)}

## Current Progress
Overall: ${quarterlyStrategy.overallProgress}%

## Company State
${companyState.summary}

## Critical Issues
${companyState.criticalIssues.join(', ') || 'None'}

Generate weekly goals in JSON format:
{
  "theme": "Week theme (e.g., 'Foundation Week')",
  "objectives": [
    {
      "id": "weekly-obj-1",
      "title": "Weekly objective",
      "description": "What to achieve this week",
      "keyResults": [
        {
          "id": "weekly-kr-1",
          "metric": "Metric",
          "target": 10,
          "current": 0,
          "unit": "units"
        }
      ],
      "progress": 0,
      "status": "on_track"
    }
  ],
  "priorities": [
    {
      "rank": 1,
      "title": "This week's priority",
      "description": "Why focus on this",
      "category": "growth|efficiency|innovation|risk|quality",
      "effort": "low|medium|high",
      "impact": "low|medium|high"
    }
  ],
  "constraints": {
    "budgetLimit": 2000,
    "mustComplete": ["Week deliverables"],
    "mustAvoid": [],
    "dependencies": []
  }
}

Ensure weekly goals contribute to quarterly objectives.`;

  const messages: LLMMessage[] = [
    {
      role: 'system',
      content: 'You are an AI CEO setting weekly goals that align with quarterly strategy.',
    },
    { role: 'user', content: prompt },
  ];

  const response = await callLLM(messages, { temperature: 0.5 });
  const parsed = parseJsonResponse(response.content);

  const strategy = await createStrategy(companyId, 'weekly', {
    theme: parsed.theme as string | undefined,
    objectives: parsed.objectives as StrategyHorizonInsert['objectives'],
    priorities: parsed.priorities as StrategyHorizonInsert['priorities'],
    constraints: parsed.constraints as StrategyHorizonInsert['constraints'],
    overallProgress: 0,
    healthScore: 100,
    createdBy: 'ceo_agent',
  });

  return strategy;
}

/**
 * Generate daily strategy aligned with weekly goals
 */
export async function generateDailyStrategy(companyId: string): Promise<StrategyHorizon> {
  logger.info('Generating daily strategy', { companyId });

  const weeklyStrategy = await getCurrentStrategy(companyId, 'weekly');
  const quarterlyStrategy = await getCurrentStrategy(companyId, 'quarterly');
  const companyState = await getStateForDecisionMaking(companyId);

  if (!weeklyStrategy) {
    throw new Error('No active weekly strategy. Create weekly goals first.');
  }

  const prompt = `Create today's strategy aligned with weekly goals.

## Weekly Goals
Theme: ${weeklyStrategy.theme}
${JSON.stringify(weeklyStrategy.objectives, null, 2)}

## Weekly Progress
${weeklyStrategy.overallProgress}%

## Quarterly Context
${quarterlyStrategy?.vision || 'No quarterly vision'}

## Today's Company State
${companyState.summary}
Health Score: ${companyState.keyMetrics.healthScore}

## Critical Issues (Must Address Today)
${companyState.criticalIssues.join('\n') || 'None'}

## Opportunities
${companyState.opportunities.join('\n') || 'None'}

Generate daily strategy in JSON format:
{
  "theme": "Today's focus (e.g., 'Execution Day')",
  "priorities": [
    {
      "rank": 1,
      "title": "Top priority for today",
      "description": "What to accomplish",
      "category": "growth|efficiency|innovation|risk|quality",
      "effort": "low|medium|high",
      "impact": "low|medium|high"
    }
  ],
  "objectives": [
    {
      "id": "daily-obj-1",
      "title": "Today's objective",
      "description": "Specific target",
      "keyResults": [
        {
          "id": "daily-kr-1",
          "metric": "Metric",
          "target": 5,
          "current": 0,
          "unit": "units"
        }
      ],
      "progress": 0,
      "status": "on_track"
    }
  ],
  "constraints": {
    "budgetLimit": 500,
    "mustComplete": ["Today's must-do items"],
    "mustAvoid": ["Things to skip today"],
    "dependencies": []
  }
}

Focus on actionable, achievable daily goals.`;

  const messages: LLMMessage[] = [
    {
      role: 'system',
      content: 'You are an AI CEO setting daily priorities that drive weekly goals.',
    },
    { role: 'user', content: prompt },
  ];

  const response = await callLLM(messages, { temperature: 0.4 });
  const parsed = parseJsonResponse(response.content);

  const strategy = await createStrategy(companyId, 'daily', {
    theme: parsed.theme as string | undefined,
    objectives: parsed.objectives as StrategyHorizonInsert['objectives'],
    priorities: parsed.priorities as StrategyHorizonInsert['priorities'],
    constraints: parsed.constraints as StrategyHorizonInsert['constraints'],
    overallProgress: 0,
    healthScore: 100,
    createdBy: 'ceo_agent',
  });

  return strategy;
}

// ==================== ALIGNMENT CHECKING ====================

/**
 * Check alignment between strategy horizons
 */
export async function checkStrategyAlignment(companyId: string): Promise<{
  overallScore: number;
  quarterlyToWeekly: number;
  weeklyToDaily: number;
  issues: Array<{
    issue: string;
    severity: 'critical' | 'warning' | 'info';
    affectedHorizons: string[];
    recommendation: string;
  }>;
}> {
  const strategies = await getAllActiveStrategies(companyId);
  const issues: Array<{
    issue: string;
    severity: 'critical' | 'warning' | 'info';
    affectedHorizons: string[];
    recommendation: string;
  }> = [];

  let quarterlyToWeekly = 100;
  let weeklyToDaily = 100;

  // Check if all horizons exist
  if (!strategies.quarterly) {
    issues.push({
      issue: 'No quarterly vision defined',
      severity: 'critical',
      affectedHorizons: ['quarterly'],
      recommendation: 'Create a quarterly vision to guide weekly and daily planning',
    });
    quarterlyToWeekly = 0;
  }

  if (!strategies.weekly) {
    issues.push({
      issue: 'No weekly goals defined',
      severity: 'warning',
      affectedHorizons: ['weekly'],
      recommendation: 'Generate weekly goals aligned with quarterly vision',
    });
    quarterlyToWeekly = Math.min(quarterlyToWeekly, 50);
    weeklyToDaily = 0;
  }

  if (!strategies.daily) {
    issues.push({
      issue: 'No daily strategy defined',
      severity: 'warning',
      affectedHorizons: ['daily'],
      recommendation: 'Generate daily strategy aligned with weekly goals',
    });
    weeklyToDaily = Math.min(weeklyToDaily, 50);
  }

  // Check parent-child relationships
  if (strategies.weekly && strategies.weekly.parentHorizonId !== strategies.quarterly?.id) {
    issues.push({
      issue: 'Weekly goals not linked to current quarterly vision',
      severity: 'warning',
      affectedHorizons: ['quarterly', 'weekly'],
      recommendation: 'Regenerate weekly goals to align with new quarterly vision',
    });
    quarterlyToWeekly -= 30;
  }

  if (strategies.daily && strategies.daily.parentHorizonId !== strategies.weekly?.id) {
    issues.push({
      issue: 'Daily strategy not linked to current weekly goals',
      severity: 'info',
      affectedHorizons: ['weekly', 'daily'],
      recommendation: 'Regenerate daily strategy to align with weekly goals',
    });
    weeklyToDaily -= 30;
  }

  // Check progress alignment
  if (strategies.quarterly && strategies.weekly) {
    const quarterlyProgress = strategies.quarterly.overallProgress || 0;
    const weeklyProgress = strategies.weekly.overallProgress || 0;

    // Weekly should be progressing faster than quarterly (more granular)
    if (quarterlyProgress > 0 && weeklyProgress < quarterlyProgress * 0.5) {
      issues.push({
        issue: 'Weekly progress lagging behind quarterly targets',
        severity: 'warning',
        affectedHorizons: ['quarterly', 'weekly'],
        recommendation: 'Focus on catching up with weekly deliverables',
      });
      quarterlyToWeekly -= 20;
    }
  }

  const overallScore = Math.max(0, (quarterlyToWeekly + weeklyToDaily) / 2);

  // Save alignment record
  await db.insert(schema.strategyAlignment).values({
    companyId,
    quarterlyHorizonId: strategies.quarterly?.id,
    weeklyHorizonId: strategies.weekly?.id,
    dailyHorizonId: strategies.daily?.id,
    quarterlyToWeeklyScore: quarterlyToWeekly,
    weeklyToDailyScore: weeklyToDaily,
    overallAlignmentScore: overallScore,
    alignmentIssues: issues,
  });

  return {
    overallScore,
    quarterlyToWeekly,
    weeklyToDaily,
    issues,
  };
}

/**
 * Get strategy context for CEO reasoning loop
 */
export async function getStrategyContextForReasoning(companyId: string): Promise<{
  quarterly: {
    vision: string;
    objectives: ObjectiveKR[];
    progress: number;
  } | null;
  weekly: {
    theme: string;
    objectives: ObjectiveKR[];
    progress: number;
  } | null;
  daily: {
    theme: string;
    priorities: Priority[];
    progress: number;
  } | null;
  alignment: {
    score: number;
    issues: string[];
  };
}> {
  const strategies = await getAllActiveStrategies(companyId);
  const alignment = await checkStrategyAlignment(companyId);

  return {
    quarterly: strategies.quarterly
      ? {
          vision: strategies.quarterly.vision || '',
          objectives: (strategies.quarterly.objectives as ObjectiveKR[]) || [],
          progress: strategies.quarterly.overallProgress || 0,
        }
      : null,
    weekly: strategies.weekly
      ? {
          theme: strategies.weekly.theme || '',
          objectives: (strategies.weekly.objectives as ObjectiveKR[]) || [],
          progress: strategies.weekly.overallProgress || 0,
        }
      : null,
    daily: strategies.daily
      ? {
          theme: strategies.daily.theme || '',
          priorities: (strategies.daily.priorities as Priority[]) || [],
          progress: strategies.daily.overallProgress || 0,
        }
      : null,
    alignment: {
      score: alignment.overallScore,
      issues: alignment.issues.map(i => i.issue),
    },
  };
}

// ==================== UTILITIES ====================

function calculatePeriodBoundaries(
  horizon: HorizonLevel,
  now: Date
): { periodStart: Date; periodEnd: Date } {
  const periodStart = new Date(now);
  const periodEnd = new Date(now);

  switch (horizon) {
    case 'quarterly':
      // Start from beginning of current quarter
      const quarter = Math.floor(now.getMonth() / 3);
      periodStart.setMonth(quarter * 3, 1);
      periodStart.setHours(0, 0, 0, 0);
      periodEnd.setMonth(quarter * 3 + 3, 0);
      periodEnd.setHours(23, 59, 59, 999);
      break;

    case 'weekly':
      // Start from Monday of current week
      const dayOfWeek = now.getDay();
      const daysToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
      periodStart.setDate(now.getDate() - daysToMonday);
      periodStart.setHours(0, 0, 0, 0);
      periodEnd.setDate(periodStart.getDate() + 6);
      periodEnd.setHours(23, 59, 59, 999);
      break;

    case 'daily':
      periodStart.setHours(0, 0, 0, 0);
      periodEnd.setHours(23, 59, 59, 999);
      break;
  }

  return { periodStart, periodEnd };
}

function parseJsonResponse(response: string): Record<string, unknown> {
  const jsonMatch = response.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error('No valid JSON in response');
  }
  return JSON.parse(jsonMatch[0]);
}

// ==================== SCHEDULED TASKS ====================

/**
 * Run daily strategy refresh (called by scheduler)
 */
export async function runDailyStrategyRefresh(companyId: string): Promise<void> {
  logger.info('Running daily strategy refresh', { companyId });

  try {
    // Update yesterday's daily strategy progress
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);

    const yesterdayStrategy = await db.query.strategyHorizons.findFirst({
      where: and(
        eq(schema.strategyHorizons.companyId, companyId),
        eq(schema.strategyHorizons.horizon, 'daily'),
        lte(schema.strategyHorizons.periodStart, yesterday),
        gte(schema.strategyHorizons.periodEnd, yesterday)
      ),
    });

    if (yesterdayStrategy && yesterdayStrategy.status === 'active') {
      await completeStrategy(yesterdayStrategy.id);
    }

    // Generate new daily strategy
    await generateDailyStrategy(companyId);

    // Check alignment
    const alignment = await checkStrategyAlignment(companyId);

    if (alignment.overallScore < 70) {
      logger.warn('Strategy alignment issues detected', {
        companyId,
        score: alignment.overallScore,
        issues: alignment.issues.length,
      });
    }
  } catch (error) {
    logger.error('Daily strategy refresh failed', { companyId, error: String(error) });
  }
}

/**
 * Run weekly strategy review (called by scheduler)
 */
export async function runWeeklyStrategyReview(companyId: string): Promise<void> {
  logger.info('Running weekly strategy review', { companyId });

  try {
    // Complete last week's strategy
    const lastWeek = await getCurrentStrategy(companyId, 'weekly');
    if (lastWeek) {
      // Calculate final progress
      await completeStrategy(lastWeek.id);
    }

    // Generate new weekly goals
    await generateWeeklyGoals(companyId);

    // Also refresh daily strategy
    await generateDailyStrategy(companyId);
  } catch (error) {
    logger.error('Weekly strategy review failed', { companyId, error: String(error) });
  }
}

// Export types
export type { StrategyHorizon, HorizonLevel, ObjectiveKR, Priority };
