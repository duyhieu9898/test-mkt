import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { eq, and, desc, gte, sql, inArray } from 'drizzle-orm';
import * as schema from '@1person/core/db';
import { callLLM, type LLMMessage } from '../lib/llm';
import { agentLogger } from '../lib/logger';
import { analyzeAgentPerformance, generateEvolutionRecommendations, applySkillUpdates } from './evolution';
import { extractLearningsFromMemories, searchMemories, storeMemory } from './memory';
import { queueNotification } from '../lib/queue';

const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/oneperson';
const client = postgres(DATABASE_URL);
const db = drizzle(client, { schema });

const logger = agentLogger.child({ service: 'self-improvement' });

// Prompt variant for A/B testing
export interface PromptVariant {
  id: string;
  agentId: string;
  name: string;
  systemPrompt: string;
  version: number;
  isActive: boolean;
  metrics: {
    tasksExecuted: number;
    successRate: number;
    avgCost: number;
    avgDuration: number;
  };
  createdAt: Date;
}

// Improvement suggestion
export interface ImprovementSuggestion {
  id: string;
  type: 'prompt_change' | 'capability_add' | 'capability_remove' | 'workflow_change' | 'collaboration_pattern';
  title: string;
  description: string;
  expectedImpact: 'high' | 'medium' | 'low';
  implementation: string;
  confidence: number;
  status: 'pending' | 'approved' | 'applied' | 'rejected';
}

// Self-improvement cycle result
export interface ImprovementCycleResult {
  agentId: string;
  cycleDate: Date;
  performanceAnalysis: {
    before: number;
    current: number;
    trend: 'improving' | 'stable' | 'declining';
  };
  suggestions: ImprovementSuggestion[];
  appliedChanges: string[];
  nextCycleRecommendations: string[];
}

// Generate improved prompt based on performance analysis
export async function generateImprovedPrompt(agentId: string): Promise<{
  newPrompt: string;
  changes: string[];
  confidence: number;
}> {
  logger.info('Generating improved prompt', { agentId });

  const agent = await db.query.agents.findFirst({
    where: eq(schema.agents.id, agentId),
    with: { company: true },
  });

  if (!agent) {
    throw new Error(`Agent not found: ${agentId}`);
  }

  // Get performance data
  const performance = await analyzeAgentPerformance(agentId, 14);

  // Get learnings from memory
  const learnings = await extractLearningsFromMemories(agentId);

  // Get failed task patterns
  const failedTasks = await db.query.tasks.findMany({
    where: and(
      eq(schema.tasks.assignedAgentId, agentId),
      eq(schema.tasks.status, 'failed')
    ),
    orderBy: [desc(schema.tasks.createdAt)],
    limit: 5,
  });

  const failurePatterns = failedTasks.map(t => ({
    title: t.title,
    error: t.errorMessage,
  }));

  // Get successful task patterns
  const successfulTasks = await db.query.tasks.findMany({
    where: and(
      eq(schema.tasks.assignedAgentId, agentId),
      eq(schema.tasks.status, 'completed')
    ),
    orderBy: [desc(schema.tasks.createdAt)],
    limit: 5,
  });

  const prompt = `Analyze this agent's performance and generate an improved system prompt.

## Current Agent
Name: ${agent.name}
Role: ${agent.role}
Company: ${agent.company?.name}

## Current System Prompt
${agent.systemPrompt || 'No custom prompt set'}

## Performance Analysis
- Success Rate: ${performance.successRate.toFixed(1)}%
- Strengths: ${performance.strengths.join(', ') || 'None identified'}
- Weaknesses: ${performance.weaknesses.join(', ') || 'None identified'}
- Improvement Areas: ${performance.improvementAreas.join(', ') || 'None'}

## Learnings from Past Tasks
${learnings.map(l => `- ${l}`).join('\n') || 'No learnings yet'}

## Failure Patterns
${failurePatterns.map(f => `- ${f.title}: ${f.error}`).join('\n') || 'No recent failures'}

## Successful Patterns
${successfulTasks.map(t => `- ${t.title}`).slice(0, 3).join('\n')}

## Generate Improved Prompt

Return JSON:
{
  "newPrompt": "The improved system prompt text...",
  "changes": ["Change 1 description", "Change 2 description"],
  "confidence": 0.85,
  "rationale": "Why these changes should improve performance"
}

Guidelines:
1. Address weaknesses without losing strengths
2. Incorporate learnings from successful tasks
3. Add safeguards against common failure patterns
4. Keep the prompt focused and actionable
5. Maintain the agent's core role and identity`;

  const messages: LLMMessage[] = [
    {
      role: 'system',
      content: `You are an AI prompt engineer specializing in optimizing AI agent prompts.
Your goal is to improve agent effectiveness through prompt refinement.
Be specific, actionable, and data-driven in your improvements.`,
    },
    { role: 'user', content: prompt },
  ];

  try {
    const response = await callLLM(messages, { temperature: 0.5 });

    const jsonMatch = response.content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('No valid JSON in response');
    }

    const result = JSON.parse(jsonMatch[0]) as {
      newPrompt: string;
      changes: string[];
      confidence: number;
      rationale: string;
    };

    logger.info('Improved prompt generated', {
      agentId,
      changesCount: result.changes.length,
      confidence: result.confidence,
    });

    return {
      newPrompt: result.newPrompt,
      changes: result.changes,
      confidence: result.confidence,
    };
  } catch (error) {
    logger.error('Failed to generate improved prompt', { error: String(error) });
    throw error;
  }
}

// Create A/B test for prompt variants
export async function createPromptABTest(
  agentId: string,
  variantA: string,
  variantB: string
): Promise<{
  testId: string;
  variants: PromptVariant[];
}> {
  logger.info('Creating prompt A/B test', { agentId });

  const agent = await db.query.agents.findFirst({
    where: eq(schema.agents.id, agentId),
  });

  if (!agent) {
    throw new Error(`Agent not found: ${agentId}`);
  }

  const testId = `ab-test-${Date.now()}`;

  const variants: PromptVariant[] = [
    {
      id: `${testId}-a`,
      agentId,
      name: 'Variant A (Control)',
      systemPrompt: variantA,
      version: 1,
      isActive: true,
      metrics: { tasksExecuted: 0, successRate: 0, avgCost: 0, avgDuration: 0 },
      createdAt: new Date(),
    },
    {
      id: `${testId}-b`,
      agentId,
      name: 'Variant B (Test)',
      systemPrompt: variantB,
      version: 1,
      isActive: true,
      metrics: { tasksExecuted: 0, successRate: 0, avgCost: 0, avgDuration: 0 },
      createdAt: new Date(),
    },
  ];

  // Store test configuration in agent metadata
  await db
    .update(schema.agents)
    .set({
      metadata: {
        ...(agent.metadata as Record<string, unknown> || {}),
        abTest: {
          testId,
          variants,
          startedAt: new Date().toISOString(),
          status: 'running',
        },
      },
    })
    .where(eq(schema.agents.id, agentId));

  // Store as memory
  await storeMemory({
    agentId,
    companyId: agent.companyId,
    type: 'decision',
    title: `Started A/B Test: ${testId}`,
    content: `Testing prompt variants to improve performance.\nVariant A: Control\nVariant B: Improved version`,
    importance: 'medium',
    metadata: { tags: ['ab_test', 'self_improvement'] },
  });

  return { testId, variants };
}

// Evaluate A/B test results
export async function evaluateABTestResults(agentId: string): Promise<{
  winner: 'A' | 'B' | 'inconclusive';
  confidence: number;
  analysis: string;
  recommendation: string;
}> {
  logger.info('Evaluating A/B test results', { agentId });

  const agent = await db.query.agents.findFirst({
    where: eq(schema.agents.id, agentId),
  });

  if (!agent) {
    throw new Error(`Agent not found: ${agentId}`);
  }

  const metadata = agent.metadata as { abTest?: { testId: string; variants: PromptVariant[] } } | null;
  const abTest = metadata?.abTest;

  if (!abTest) {
    return {
      winner: 'inconclusive',
      confidence: 0,
      analysis: 'No A/B test found for this agent',
      recommendation: 'Start a new A/B test to compare prompt variants',
    };
  }

  const variantA = abTest.variants[0];
  const variantB = abTest.variants[1];

  // Need minimum sample size
  const minSamples = 10;
  if (variantA.metrics.tasksExecuted < minSamples || variantB.metrics.tasksExecuted < minSamples) {
    return {
      winner: 'inconclusive',
      confidence: 0,
      analysis: `Insufficient data: Variant A has ${variantA.metrics.tasksExecuted} tasks, Variant B has ${variantB.metrics.tasksExecuted} tasks. Need at least ${minSamples} each.`,
      recommendation: 'Continue running the test until both variants have at least 10 task executions',
    };
  }

  // Calculate significance
  const successDiff = variantB.metrics.successRate - variantA.metrics.successRate;
  const costDiff = variantA.metrics.avgCost - variantB.metrics.avgCost; // Lower is better
  const durationDiff = variantA.metrics.avgDuration - variantB.metrics.avgDuration; // Lower is better

  // Simple scoring (weighted)
  const scoreA = variantA.metrics.successRate * 0.6 - variantA.metrics.avgCost * 10 - variantA.metrics.avgDuration * 0.001;
  const scoreB = variantB.metrics.successRate * 0.6 - variantB.metrics.avgCost * 10 - variantB.metrics.avgDuration * 0.001;

  const winner = scoreB > scoreA * 1.1 ? 'B' : scoreA > scoreB * 1.1 ? 'A' : 'inconclusive';
  const confidence = Math.abs(scoreB - scoreA) / Math.max(scoreA, scoreB);

  const analysis = `
Variant A: Success ${variantA.metrics.successRate.toFixed(1)}%, Cost $${variantA.metrics.avgCost.toFixed(4)}, Duration ${variantA.metrics.avgDuration.toFixed(0)}ms
Variant B: Success ${variantB.metrics.successRate.toFixed(1)}%, Cost $${variantB.metrics.avgCost.toFixed(4)}, Duration ${variantB.metrics.avgDuration.toFixed(0)}ms
Score A: ${scoreA.toFixed(2)}, Score B: ${scoreB.toFixed(2)}
Success rate difference: ${successDiff > 0 ? '+' : ''}${successDiff.toFixed(1)}%
  `.trim();

  const recommendation = winner === 'B'
    ? 'Apply Variant B as the new default prompt'
    : winner === 'A'
    ? 'Keep current prompt (Variant A)'
    : 'Continue testing or try a different variant';

  return { winner, confidence, analysis, recommendation };
}

// Apply A/B test winner
export async function applyABTestWinner(agentId: string): Promise<boolean> {
  const results = await evaluateABTestResults(agentId);

  if (results.winner === 'inconclusive') {
    logger.info('A/B test inconclusive, no changes applied', { agentId });
    return false;
  }

  const agent = await db.query.agents.findFirst({
    where: eq(schema.agents.id, agentId),
  });

  if (!agent) return false;

  const metadata = agent.metadata as { abTest?: { variants: PromptVariant[] } } | null;
  const winningVariant = results.winner === 'B'
    ? metadata?.abTest?.variants[1]
    : metadata?.abTest?.variants[0];

  if (!winningVariant) return false;

  // Apply winning prompt
  await db
    .update(schema.agents)
    .set({
      systemPrompt: winningVariant.systemPrompt,
      metadata: {
        ...(metadata || {}),
        abTest: null,
        lastPromptUpdate: {
          date: new Date().toISOString(),
          variant: results.winner,
          confidence: results.confidence,
        },
      },
    })
    .where(eq(schema.agents.id, agentId));

  // Store as memory
  await storeMemory({
    agentId,
    companyId: agent.companyId,
    type: 'decision',
    title: `A/B Test Winner Applied: Variant ${results.winner}`,
    content: `${results.analysis}\n\nApplied with ${(results.confidence * 100).toFixed(0)}% confidence`,
    importance: 'high',
    metadata: { tags: ['ab_test', 'prompt_update'] },
  });

  logger.info('A/B test winner applied', { agentId, winner: results.winner });
  return true;
}

// Generate improvement suggestions
export async function generateImprovementSuggestions(agentId: string): Promise<ImprovementSuggestion[]> {
  logger.info('Generating improvement suggestions', { agentId });

  const agent = await db.query.agents.findFirst({
    where: eq(schema.agents.id, agentId),
    with: { company: true },
  });

  if (!agent) {
    throw new Error(`Agent not found: ${agentId}`);
  }

  const performance = await analyzeAgentPerformance(agentId, 14);
  const learnings = await extractLearningsFromMemories(agentId);

  // Get collaboration patterns
  const collaborations = await db.query.messages.findMany({
    where: and(
      eq(schema.messages.companyId, agent.companyId),
      eq(schema.messages.senderAgentId, agentId)
    ),
    limit: 20,
  });

  const prompt = `Analyze this agent and generate specific improvement suggestions.

## Agent Profile
Name: ${agent.name}
Role: ${agent.role}
Capabilities: ${JSON.stringify(agent.capabilities)}
Tasks Completed: ${agent.tasksCompleted || 0}
Tasks Failed: ${agent.tasksFailed || 0}
Performance Score: ${agent.performanceScore || 'N/A'}

## Performance Analysis
- Success Rate: ${performance.successRate.toFixed(1)}%
- Avg Execution Time: ${performance.averageExecutionTime.toFixed(0)}ms
- Cost Efficiency: $${performance.costEfficiency.toFixed(4)}/task
- Strengths: ${performance.strengths.join(', ') || 'None'}
- Weaknesses: ${performance.weaknesses.join(', ') || 'None'}

## Learnings
${learnings.map(l => `- ${l}`).join('\n') || 'No learnings yet'}

## Collaboration Activity
- Messages sent: ${collaborations.length}
- Types: ${[...new Set(collaborations.map(c => c.type))].join(', ')}

Generate 3-5 specific improvement suggestions:
{
  "suggestions": [
    {
      "type": "prompt_change|capability_add|capability_remove|workflow_change|collaboration_pattern",
      "title": "Short descriptive title",
      "description": "What to improve and why",
      "expectedImpact": "high|medium|low",
      "implementation": "Specific steps to implement",
      "confidence": 0.85
    }
  ]
}

Focus on actionable, measurable improvements.`;

  const messages: LLMMessage[] = [
    {
      role: 'system',
      content: 'You are an AI performance optimization expert. Generate specific, actionable improvement suggestions.',
    },
    { role: 'user', content: prompt },
  ];

  try {
    const response = await callLLM(messages, { temperature: 0.5 });
    const jsonMatch = response.content.match(/\{[\s\S]*\}/);

    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]) as { suggestions: Omit<ImprovementSuggestion, 'id' | 'status'>[] };
      return parsed.suggestions.map((s, i) => ({
        ...s,
        id: `suggestion-${Date.now()}-${i}`,
        status: 'pending' as const,
      }));
    }
  } catch (error) {
    logger.error('Failed to generate suggestions', { error: String(error) });
  }

  return [];
}

// Run complete self-improvement cycle
export async function runSelfImprovementCycle(agentId: string): Promise<ImprovementCycleResult> {
  logger.info('Running self-improvement cycle', { agentId });

  const agent = await db.query.agents.findFirst({
    where: eq(schema.agents.id, agentId),
    with: { company: true },
  });

  if (!agent) {
    throw new Error(`Agent not found: ${agentId}`);
  }

  // 1. Analyze current performance
  const currentPerformance = await analyzeAgentPerformance(agentId, 7);
  const previousPerformance = await analyzeAgentPerformance(agentId, 14);

  const trend = currentPerformance.successRate > previousPerformance.successRate * 1.05
    ? 'improving' as const
    : currentPerformance.successRate < previousPerformance.successRate * 0.95
    ? 'declining' as const
    : 'stable' as const;

  // 2. Generate improvement suggestions
  const suggestions = await generateImprovementSuggestions(agentId);

  // 3. Auto-apply low-risk improvements
  const appliedChanges: string[] = [];

  for (const suggestion of suggestions) {
    // Auto-apply capability additions with high confidence
    if (suggestion.type === 'capability_add' && suggestion.confidence >= 0.8) {
      const capabilities = (agent.capabilities as string[]) || [];
      const newCapability = suggestion.title.toLowerCase().replace(/\s+/g, '_');

      if (!capabilities.includes(newCapability)) {
        await db
          .update(schema.agents)
          .set({
            capabilities: [...capabilities, newCapability],
          })
          .where(eq(schema.agents.id, agentId));

        appliedChanges.push(`Added capability: ${newCapability}`);
        suggestion.status = 'applied';
      }
    }

    // Auto-apply prompt changes if declining and high impact
    if (suggestion.type === 'prompt_change' && trend === 'declining' && suggestion.expectedImpact === 'high') {
      const { newPrompt, changes } = await generateImprovedPrompt(agentId);

      await db
        .update(schema.agents)
        .set({ systemPrompt: newPrompt })
        .where(eq(schema.agents.id, agentId));

      appliedChanges.push(`Updated system prompt: ${changes.join(', ')}`);
      suggestion.status = 'applied';
    }
  }

  // 4. Run evolution recommendations
  const evolutionResult = await generateEvolutionRecommendations(agentId);

  // Apply minor skill updates automatically
  const minorUpdates = evolutionResult.skillUpdates.filter(
    u => Math.abs(u.newLevel - u.previousLevel) <= 15
  );

  if (minorUpdates.length > 0) {
    await applySkillUpdates(agentId, minorUpdates);
    appliedChanges.push(`Updated ${minorUpdates.length} skill levels`);
  }

  // 5. Store cycle result as memory
  await storeMemory({
    agentId,
    companyId: agent.companyId,
    type: 'decision',
    title: `Self-Improvement Cycle: ${new Date().toISOString().split('T')[0]}`,
    content: JSON.stringify({
      performanceTrend: trend,
      suggestionsGenerated: suggestions.length,
      changesApplied: appliedChanges,
    }),
    importance: 'medium',
    metadata: { tags: ['self_improvement', 'evolution'] },
  });

  // 6. Notify if significant changes
  if (appliedChanges.length > 0) {
    await queueNotification({
      type: 'system_alert',
      userId: agent.company?.ownerId || '',
      companyId: agent.companyId,
      title: `Agent Self-Improvement: ${agent.name}`,
      message: `${appliedChanges.length} improvements applied. Performance trend: ${trend}`,
      metadata: { agentId, appliedChanges },
    });
  }

  const result: ImprovementCycleResult = {
    agentId,
    cycleDate: new Date(),
    performanceAnalysis: {
      before: previousPerformance.successRate,
      current: currentPerformance.successRate,
      trend,
    },
    suggestions,
    appliedChanges,
    nextCycleRecommendations: evolutionResult.recommendations,
  };

  logger.info('Self-improvement cycle completed', {
    agentId,
    trend,
    suggestionsCount: suggestions.length,
    appliedCount: appliedChanges.length,
  });

  return result;
}

// Schedule continuous improvement for all agents
export async function runCompanyWideImprovement(companyId: string): Promise<{
  agentsProcessed: number;
  totalImprovements: number;
  summary: string;
}> {
  logger.info('Running company-wide improvement cycle', { companyId });

  const agents = await db.query.agents.findMany({
    where: and(
      eq(schema.agents.companyId, companyId),
      eq(schema.agents.status, 'active')
    ),
  });

  let totalImprovements = 0;
  const results: Array<{ agentName: string; improvements: number; trend: string }> = [];

  for (const agent of agents) {
    try {
      const result = await runSelfImprovementCycle(agent.id);
      totalImprovements += result.appliedChanges.length;
      results.push({
        agentName: agent.name,
        improvements: result.appliedChanges.length,
        trend: result.performanceAnalysis.trend,
      });
    } catch (error) {
      logger.error('Failed to improve agent', { agentId: agent.id, error: String(error) });
    }
  }

  const improving = results.filter(r => r.trend === 'improving').length;
  const declining = results.filter(r => r.trend === 'declining').length;

  const summary = `Processed ${agents.length} agents: ${improving} improving, ${declining} declining. Applied ${totalImprovements} total improvements.`;

  logger.info('Company-wide improvement completed', {
    companyId,
    agentsProcessed: agents.length,
    totalImprovements,
    improving,
    declining,
  });

  return {
    agentsProcessed: agents.length,
    totalImprovements,
    summary,
  };
}

// Get improvement history for an agent
export async function getImprovementHistory(agentId: string): Promise<Array<{
  date: Date;
  type: string;
  description: string;
  impact: string;
}>> {
  const memories = await searchMemories(agentId, 'self improvement evolution prompt update', {
    types: ['decision'],
    limit: 20,
  });

  return memories.map(m => ({
    date: m.createdAt,
    type: m.metadata?.tags?.[0] || 'unknown',
    description: m.title,
    impact: m.content.slice(0, 200),
  }));
}
