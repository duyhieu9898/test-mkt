import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { eq, and, sql } from 'drizzle-orm';
import * as schema from '@1person/core/db';
import { BudgetExceededError } from './errors';

// Database connection
const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/oneperson';
const client = postgres(DATABASE_URL);
const db = drizzle(client, { schema });

// Cost per 1K tokens by model
const MODEL_COSTS = {
  // OpenAI
  'gpt-4o-mini': { input: 0.00015, output: 0.0006 },
  'gpt-4o': { input: 0.005, output: 0.015 },
  'gpt-4-turbo': { input: 0.01, output: 0.03 },
  'gpt-3.5-turbo': { input: 0.0005, output: 0.0015 },
  // Anthropic
  'claude-3-5-sonnet-20241022': { input: 0.003, output: 0.015 },
  'claude-3-5-haiku-20241022': { input: 0.00025, output: 0.00125 },
  'claude-3-opus-20240229': { input: 0.015, output: 0.075 },
} as const;

export interface BudgetInfo {
  agentId: string;
  companyId: string;
  budgetLimit: number;
  budgetSpent: number;
  budgetRemaining: number;
  percentUsed: number;
  isOverBudget: boolean;
  warningThreshold: boolean; // > 80% used
}

export interface CostEstimate {
  estimatedTokens: number;
  estimatedCost: number;
  model: string;
}

// Calculate cost for a given model and token count
export function calculateCost(
  model: string,
  promptTokens: number,
  completionTokens: number
): number {
  const costs = MODEL_COSTS[model as keyof typeof MODEL_COSTS] || MODEL_COSTS['gpt-4o-mini'];
  return (promptTokens / 1000) * costs.input + (completionTokens / 1000) * costs.output;
}

// Estimate cost before making a request
export function estimateCost(model: string, estimatedTokens: number): CostEstimate {
  const costs = MODEL_COSTS[model as keyof typeof MODEL_COSTS] || MODEL_COSTS['gpt-4o-mini'];
  // Assume 40% prompt, 60% completion for estimation
  const promptTokens = Math.round(estimatedTokens * 0.4);
  const completionTokens = Math.round(estimatedTokens * 0.6);
  const estimatedCost =
    (promptTokens / 1000) * costs.input + (completionTokens / 1000) * costs.output;

  return {
    estimatedTokens,
    estimatedCost,
    model,
  };
}

// Get budget information for an agent
export async function getAgentBudget(agentId: string): Promise<BudgetInfo | null> {
  const agent = await db.query.agents.findFirst({
    where: eq(schema.agents.id, agentId),
  });

  if (!agent) return null;

  const budgetLimit = parseFloat(agent.budgetLimit || '0');
  const budgetSpent = parseFloat(agent.budgetSpent || '0');
  const budgetRemaining = Math.max(0, budgetLimit - budgetSpent);
  const percentUsed = budgetLimit > 0 ? (budgetSpent / budgetLimit) * 100 : 0;

  return {
    agentId,
    companyId: agent.companyId,
    budgetLimit,
    budgetSpent,
    budgetRemaining,
    percentUsed,
    isOverBudget: budgetSpent >= budgetLimit && budgetLimit > 0,
    warningThreshold: percentUsed >= 80 && percentUsed < 100,
  };
}

// Get company-wide budget
export async function getCompanyBudget(companyId: string): Promise<{
  totalBudget: number;
  totalSpent: number;
  remaining: number;
  agentBreakdown: Array<{ agentId: string; agentName: string; spent: number; limit: number }>;
}> {
  const company = await db.query.companies.findFirst({
    where: eq(schema.companies.id, companyId),
  });

  const agents = await db.query.agents.findMany({
    where: eq(schema.agents.companyId, companyId),
  });

  const settings = (company?.settings || {}) as { monthlyBudget?: number };
  const totalBudget = settings.monthlyBudget || 0;
  const totalSpent = agents.reduce((sum, a) => sum + parseFloat(a.budgetSpent || '0'), 0);

  return {
    totalBudget,
    totalSpent,
    remaining: Math.max(0, totalBudget - totalSpent),
    agentBreakdown: agents.map((a) => ({
      agentId: a.id,
      agentName: a.name,
      spent: parseFloat(a.budgetSpent || '0'),
      limit: parseFloat(a.budgetLimit || '0'),
    })),
  };
}

// Check if agent can execute a task (budget check)
export async function checkBudget(
  agentId: string,
  estimatedCost: number
): Promise<{ allowed: boolean; reason?: string; budget?: BudgetInfo }> {
  const budget = await getAgentBudget(agentId);

  if (!budget) {
    return { allowed: true }; // No agent = no budget check
  }

  // No budget limit set = unlimited
  if (budget.budgetLimit === 0) {
    return { allowed: true, budget };
  }

  // Check if over budget
  if (budget.isOverBudget) {
    return {
      allowed: false,
      reason: `Budget exceeded: $${budget.budgetSpent.toFixed(2)} / $${budget.budgetLimit.toFixed(2)}`,
      budget,
    };
  }

  // Check if estimated cost would exceed budget
  if (budget.budgetSpent + estimatedCost > budget.budgetLimit) {
    return {
      allowed: false,
      reason: `Estimated cost ($${estimatedCost.toFixed(4)}) would exceed remaining budget ($${budget.budgetRemaining.toFixed(2)})`,
      budget,
    };
  }

  return { allowed: true, budget };
}

// Record cost after execution
export async function recordCost(
  agentId: string,
  cost: number,
  metadata: {
    model: string;
    promptTokens: number;
    completionTokens: number;
    taskId?: string;
  }
): Promise<void> {
  // Update agent's budget spent
  await db
    .update(schema.agents)
    .set({
      budgetSpent: sql`${schema.agents.budgetSpent}::numeric + ${cost}`,
    })
    .where(eq(schema.agents.id, agentId));

  // Log the cost
  const agent = await db.query.agents.findFirst({
    where: eq(schema.agents.id, agentId),
  });

  if (agent) {
    await db.insert(schema.actionLogs).values({
      companyId: agent.companyId,
      agentId,
      taskId: metadata.taskId,
      toolName: 'llm',
      action: 'token_usage',
      input: { model: metadata.model },
      output: {
        promptTokens: metadata.promptTokens,
        completionTokens: metadata.completionTokens,
        totalTokens: metadata.promptTokens + metadata.completionTokens,
      },
      tokensUsed: metadata.promptTokens + metadata.completionTokens,
      promptTokens: metadata.promptTokens,
      completionTokens: metadata.completionTokens,
      cost: String(cost),
      status: 'success',
    });
  }
}

// Middleware to check budget before task execution
export async function budgetGuard(
  agentId: string,
  estimatedTokens: number,
  model: string
): Promise<void> {
  const estimate = estimateCost(model, estimatedTokens);
  const check = await checkBudget(agentId, estimate.estimatedCost);

  if (!check.allowed) {
    throw new BudgetExceededError(
      check.budget?.budgetLimit || 0,
      check.budget?.budgetSpent || 0,
      { agentId, reason: check.reason }
    );
  }

  // Log warning if approaching budget limit
  if (check.budget?.warningThreshold) {
    console.warn(
      `[Budget Warning] Agent ${agentId} is at ${check.budget.percentUsed.toFixed(1)}% of budget`
    );
  }
}

// Reset monthly budgets (call from a cron job)
export async function resetMonthlyBudgets(companyId?: string): Promise<number> {
  const where = companyId ? eq(schema.agents.companyId, companyId) : undefined;

  const result = await db
    .update(schema.agents)
    .set({ budgetSpent: '0' })
    .where(where || sql`1=1`);

  console.log(`[Budget] Reset budgets for ${companyId || 'all companies'}`);
  return 0; // Result doesn't have count in drizzle
}

// Get cost analytics
export async function getCostAnalytics(
  companyId: string,
  periodDays: number = 30
): Promise<{
  totalCost: number;
  costByAgent: Array<{ agentId: string; name: string; cost: number }>;
  costByModel: Array<{ model: string; cost: number; tokens: number }>;
  dailyCosts: Array<{ date: string; cost: number }>;
}> {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - periodDays);

  const logs = await db.query.actionLogs.findMany({
    where: and(
      eq(schema.actionLogs.companyId, companyId),
      sql`${schema.actionLogs.createdAt} >= ${startDate}`
    ),
  });

  // Aggregate costs
  const totalCost = logs.reduce((sum, log) => sum + parseFloat(log.cost || '0'), 0);

  // Cost by agent
  const agentCosts = new Map<string, { name: string; cost: number }>();
  const agents = await db.query.agents.findMany({
    where: eq(schema.agents.companyId, companyId),
  });
  const agentMap = new Map(agents.map((a) => [a.id, a.name]));

  for (const log of logs) {
    if (log.agentId) {
      const existing = agentCosts.get(log.agentId) || {
        name: agentMap.get(log.agentId) || 'Unknown',
        cost: 0,
      };
      existing.cost += parseFloat(log.cost || '0');
      agentCosts.set(log.agentId, existing);
    }
  }

  // Cost by model
  const modelCosts = new Map<string, { cost: number; tokens: number }>();
  for (const log of logs) {
    const input = log.input as { model?: string } | null;
    const model = input?.model || 'unknown';
    const existing = modelCosts.get(model) || { cost: 0, tokens: 0 };
    existing.cost += parseFloat(log.cost || '0');
    existing.tokens += log.tokensUsed || 0;
    modelCosts.set(model, existing);
  }

  // Daily costs
  const dailyCosts = new Map<string, number>();
  for (const log of logs) {
    const date = new Date(log.createdAt).toISOString().split('T')[0];
    const existing = dailyCosts.get(date) || 0;
    dailyCosts.set(date, existing + parseFloat(log.cost || '0'));
  }

  return {
    totalCost,
    costByAgent: Array.from(agentCosts.entries()).map(([agentId, data]) => ({
      agentId,
      name: data.name,
      cost: data.cost,
    })),
    costByModel: Array.from(modelCosts.entries()).map(([model, data]) => ({
      model,
      cost: data.cost,
      tokens: data.tokens,
    })),
    dailyCosts: Array.from(dailyCosts.entries())
      .map(([date, cost]) => ({ date, cost }))
      .sort((a, b) => a.date.localeCompare(b.date)),
  };
}
