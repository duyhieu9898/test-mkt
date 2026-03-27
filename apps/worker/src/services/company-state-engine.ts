import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { eq, and, desc, gte, sql, count, sum, avg } from 'drizzle-orm';
import * as schema from '@1person/core/db';
import { agentLogger } from '../lib/logger';

const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/oneperson';
const client = postgres(DATABASE_URL);
const db = drizzle(client, { schema });

const logger = agentLogger.child({ service: 'company-state-engine' });

// Types matching schema
type CompanyStateType = typeof schema.companyState.$inferSelect;
type StrategyState = NonNullable<CompanyStateType['currentStrategy']>;
type BudgetState = NonNullable<CompanyStateType['budgetState']>;
type AgentStateType = NonNullable<CompanyStateType['agentState']>;
type TaskState = NonNullable<CompanyStateType['taskState']>;
type HealthIndicators = NonNullable<CompanyStateType['healthIndicators']>;
type Alert = NonNullable<CompanyStateType['activeAlerts']>[number];

// Compute and update company state
export async function computeCompanyState(companyId: string): Promise<CompanyStateType> {
  logger.info('Computing company state', { companyId });

  const now = new Date();
  const startOfDay = new Date(now);
  startOfDay.setHours(0, 0, 0, 0);
  const startOfWeek = new Date(now);
  startOfWeek.setDate(now.getDate() - 7);
  const startOfMonth = new Date(now);
  startOfMonth.setDate(1);

  // Parallel data fetching
  const [
    company,
    agents,
    tasks,
    departments,
    actionLogs,
    objectives,
  ] = await Promise.all([
    db.query.companies.findFirst({ where: eq(schema.companies.id, companyId) }),
    db.query.agents.findMany({ where: eq(schema.agents.companyId, companyId) }),
    db.query.tasks.findMany({ where: eq(schema.tasks.companyId, companyId) }),
    db.query.departments.findMany({ where: eq(schema.departments.companyId, companyId) }),
    db.query.actionLogs.findMany({
      where: and(
        eq(schema.actionLogs.companyId, companyId),
        gte(schema.actionLogs.createdAt, startOfMonth)
      ),
    }),
    db.query.strategicObjectives?.findMany({
      where: and(
        eq(schema.strategicObjectives.companyId, companyId),
        eq(schema.strategicObjectives.status, 'active')
      ),
    }).catch(() => []), // Handle if table doesn't exist yet
  ]);

  if (!company) {
    throw new Error(`Company not found: ${companyId}`);
  }

  // Compute Budget State
  const totalCostMonth = actionLogs.reduce((sum, l) => sum + parseFloat(l.cost || '0'), 0);
  const daysInMonth = now.getDate();
  const monthlyBurn = (totalCostMonth / daysInMonth) * 30;
  const budget = parseFloat(company.monthlyBudget || '1000');
  const remaining = budget - totalCostMonth;
  const projectedRunway = monthlyBurn > 0 ? remaining / monthlyBurn : Infinity;

  const budgetByDepartment: Record<string, { allocated: number; spent: number }> = {};
  for (const dept of departments) {
    budgetByDepartment[dept.id] = {
      allocated: parseFloat(dept.budgetAllocated || '0'),
      spent: parseFloat(dept.budgetSpent || '0'),
    };
  }

  const budgetAlerts: Alert[] = [];
  if (remaining < budget * 0.2) {
    budgetAlerts.push({
      id: `budget-low-${Date.now()}`,
      type: 'warning',
      category: 'budget',
      message: `Budget running low: ${((remaining / budget) * 100).toFixed(0)}% remaining`,
      createdAt: now.toISOString(),
      acknowledged: false,
    });
  }

  const budgetState: BudgetState = {
    totalBudget: budget,
    spent: totalCostMonth,
    remaining,
    monthlyBurn,
    projectedRunway: Math.min(projectedRunway, 999),
    byDepartment: budgetByDepartment,
    alerts: budgetAlerts.map(a => ({ type: a.type, message: a.message, severity: a.type })),
  };

  // Compute Agent State
  const byStatus: Record<string, number> = {};
  const byRole: Record<string, number> = {};
  const byDepartment: Record<string, number> = {};

  for (const agent of agents) {
    byStatus[agent.status] = (byStatus[agent.status] || 0) + 1;
    byRole[agent.role] = (byRole[agent.role] || 0) + 1;
    if (agent.departmentId) {
      byDepartment[agent.departmentId] = (byDepartment[agent.departmentId] || 0) + 1;
    }
  }

  const agentScores = agents
    .map(a => ({ id: a.id, name: a.name, score: parseFloat(a.performanceScore || '0') }))
    .filter(a => a.score > 0);

  const avgPerformance = agentScores.length > 0
    ? agentScores.reduce((sum, a) => sum + a.score, 0) / agentScores.length
    : 0;

  const sortedByScore = [...agentScores].sort((a, b) => b.score - a.score);
  const topPerformers = sortedByScore.slice(0, 3);
  const underperformers = sortedByScore
    .filter(a => a.score < 60)
    .slice(-3)
    .map(a => ({
      ...a,
      issues: a.score < 40 ? ['Very low performance', 'Needs review'] : ['Below average'],
    }));

  const activeAgents = agents.filter(a => ['active', 'ready', 'running'].includes(a.status));
  const inProgressTasks = tasks.filter(t => t.status === 'in_progress');
  const capacityUtilization = activeAgents.length > 0
    ? Math.min((inProgressTasks.length / activeAgents.length) * 100, 100)
    : 0;

  const agentState: AgentStateType = {
    total: agents.length,
    byStatus,
    byRole,
    byDepartment,
    avgPerformance,
    topPerformers,
    underperformers,
    capacityUtilization,
  };

  // Compute Task State
  const taskByStatus: Record<string, number> = {};
  const taskByPriority: Record<string, number> = {};

  for (const task of tasks) {
    taskByStatus[task.status] = (taskByStatus[task.status] || 0) + 1;
    taskByPriority[task.priority] = (taskByPriority[task.priority] || 0) + 1;
  }

  const completedTasks = tasks.filter(t => t.status === 'completed' && t.startedAt && t.completedAt);
  const avgCompletionTime = completedTasks.length > 0
    ? completedTasks.reduce((sum, t) => {
        const start = new Date(t.startedAt!).getTime();
        const end = new Date(t.completedAt!).getTime();
        return sum + (end - start);
      }, 0) / completedTasks.length / 1000 / 60 // minutes
    : 0;

  const totalTasks = tasks.length;
  const completedCount = tasks.filter(t => t.status === 'completed').length;
  const failedCount = tasks.filter(t => t.status === 'failed').length;
  const successRate = (completedCount + failedCount) > 0
    ? (completedCount / (completedCount + failedCount)) * 100
    : 0;

  const blockedTasks = tasks
    .filter(t => t.status === 'failed' || (t.status === 'pending' && t.errorMessage))
    .slice(0, 5)
    .map(t => ({
      id: t.id,
      title: t.title,
      reason: t.errorMessage || 'Unknown',
    }));

  const criticalPath = tasks
    .filter(t => t.priority === 'critical' && t.status !== 'completed')
    .slice(0, 5)
    .map(t => ({
      id: t.id,
      title: t.title,
      deadline: t.deadline?.toISOString(),
    }));

  const taskState: TaskState = {
    total: totalTasks,
    byStatus: taskByStatus,
    byPriority: taskByPriority,
    avgCompletionTime,
    successRate,
    backlogSize: tasks.filter(t => t.status === 'pending' || t.status === 'queued').length,
    blockedTasks,
    criticalPath,
  };

  // Compute Department Metrics
  const departmentMetrics: Record<string, {
    name: string;
    agentCount: number;
    taskCount: number;
    successRate: number;
    avgResponseTime: number;
    kpiProgress: Array<{ kpi: string; target: number; current: number }>;
  }> = {};

  for (const dept of departments) {
    const deptAgents = agents.filter(a => a.departmentId === dept.id);
    const deptAgentIds = deptAgents.map(a => a.id);
    const deptTasks = tasks.filter(t => t.assignedAgentId && deptAgentIds.includes(t.assignedAgentId));

    const deptCompleted = deptTasks.filter(t => t.status === 'completed').length;
    const deptFailed = deptTasks.filter(t => t.status === 'failed').length;
    const deptSuccessRate = (deptCompleted + deptFailed) > 0
      ? (deptCompleted / (deptCompleted + deptFailed)) * 100
      : 0;

    departmentMetrics[dept.id] = {
      name: dept.name,
      agentCount: deptAgents.length,
      taskCount: deptTasks.length,
      successRate: deptSuccessRate,
      avgResponseTime: 0, // Would need message data
      kpiProgress: [],
    };
  }

  // Compute Health Indicators
  const agentHealth = Math.min(avgPerformance, 100);
  const budgetHealth = Math.max(0, Math.min(100, (remaining / budget) * 100));
  const taskHealth = successRate;
  const communicationHealth = 80; // Would need communication data
  const growthHealth = activeAgents.length >= 3 ? 80 : activeAgents.length * 25;

  const healthIndicators: HealthIndicators = {
    agentHealth,
    budgetHealth,
    taskHealth,
    communicationHealth,
    growthHealth,
  };

  const healthScore = (agentHealth + budgetHealth + taskHealth + communicationHealth + growthHealth) / 5;

  // Compute Strategy
  const currentStrategy: StrategyState = {
    vision: company.businessPlan?.vision || 'Not defined',
    priorities: (objectives || []).map(obj => ({
      id: obj.id,
      title: obj.title,
      category: obj.category,
      urgency: 'medium',
      progress: obj.progress || 0,
    })),
    quarterlyGoals: (company.goals?.kpis || []).map(kpi => ({
      goal: kpi.name,
      metric: kpi.unit,
      target: kpi.target,
      current: 0,
    })),
    lastUpdated: now.toISOString(),
  };

  // Compute Alerts
  const activeAlerts: Alert[] = [...budgetAlerts];

  if (capacityUtilization > 90) {
    activeAlerts.push({
      id: `capacity-high-${Date.now()}`,
      type: 'warning',
      category: 'capacity',
      message: `High capacity utilization: ${capacityUtilization.toFixed(0)}%`,
      createdAt: now.toISOString(),
      acknowledged: false,
    });
  }

  if (successRate < 70 && (completedCount + failedCount) > 5) {
    activeAlerts.push({
      id: `performance-low-${Date.now()}`,
      type: 'critical',
      category: 'performance',
      message: `Low task success rate: ${successRate.toFixed(0)}%`,
      createdAt: now.toISOString(),
      acknowledged: false,
    });
  }

  if (underperformers.length > 0) {
    activeAlerts.push({
      id: `agents-underperforming-${Date.now()}`,
      type: 'warning',
      category: 'agent',
      message: `${underperformers.length} agents underperforming`,
      createdAt: now.toISOString(),
      acknowledged: false,
    });
  }

  // Recent Events
  const recentEvents = actionLogs
    .slice(-10)
    .map(log => ({
      id: log.id,
      type: log.action,
      description: `${log.toolName}: ${log.action}`,
      timestamp: log.createdAt.toISOString(),
      impact: log.status === 'success' ? 'positive' as const : 'negative' as const,
    }));

  // Upsert state
  const stateData = {
    companyId,
    currentStrategy,
    budgetState,
    agentState,
    taskState,
    departmentMetrics,
    healthScore,
    healthIndicators,
    activeAlerts,
    recentEvents,
    lastComputedAt: now,
    updatedAt: now,
  };

  // Check if state exists
  const existingState = await db.query.companyState.findFirst({
    where: eq(schema.companyState.companyId, companyId),
  });

  let state: CompanyStateType;

  if (existingState) {
    await db
      .update(schema.companyState)
      .set(stateData)
      .where(eq(schema.companyState.companyId, companyId));
    state = { ...existingState, ...stateData };
  } else {
    const [newState] = await db
      .insert(schema.companyState)
      .values(stateData)
      .returning();
    state = newState;
  }

  logger.info('Company state computed', {
    companyId,
    healthScore: healthScore.toFixed(1),
    alerts: activeAlerts.length,
  });

  return state;
}

// Get current company state (compute if stale)
export async function getCompanyState(companyId: string, maxAge: number = 5 * 60 * 1000): Promise<CompanyStateType> {
  const existingState = await db.query.companyState.findFirst({
    where: eq(schema.companyState.companyId, companyId),
  });

  if (existingState) {
    const age = Date.now() - existingState.lastComputedAt.getTime();
    if (age < maxAge) {
      return existingState;
    }
  }

  // State is stale or doesn't exist, compute fresh
  return computeCompanyState(companyId);
}

// Save state snapshot for history
export async function saveStateSnapshot(
  companyId: string,
  snapshotType: 'hourly' | 'daily' | 'weekly'
): Promise<void> {
  const state = await getCompanyState(companyId);

  await db.insert(schema.companyStateHistory).values({
    companyId,
    snapshotAt: new Date(),
    snapshotType,
    metrics: {
      healthScore: state.healthScore || 0,
      taskSuccessRate: state.taskState?.successRate || 0,
      avgAgentPerformance: state.agentState?.avgPerformance || 0,
      budgetUtilization: state.budgetState
        ? (state.budgetState.spent / state.budgetState.totalBudget) * 100
        : 0,
      capacityUtilization: state.agentState?.capacityUtilization || 0,
      activeAgents: (state.agentState?.byStatus?.active || 0) +
                    (state.agentState?.byStatus?.ready || 0) +
                    (state.agentState?.byStatus?.running || 0),
      completedTasks: state.taskState?.byStatus?.completed || 0,
      totalCost: state.budgetState?.spent || 0,
    },
  });

  logger.info('State snapshot saved', { companyId, snapshotType });
}

// Get state trends
export async function getStateTrends(
  companyId: string,
  days: number = 7
): Promise<Array<{
  date: Date;
  healthScore: number;
  taskSuccessRate: number;
  avgAgentPerformance: number;
}>> {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);

  const history = await db.query.companyStateHistory.findMany({
    where: and(
      eq(schema.companyStateHistory.companyId, companyId),
      gte(schema.companyStateHistory.snapshotAt, startDate)
    ),
    orderBy: [schema.companyStateHistory.snapshotAt],
  });

  return history.map(h => ({
    date: h.snapshotAt,
    healthScore: h.metrics?.healthScore || 0,
    taskSuccessRate: h.metrics?.taskSuccessRate || 0,
    avgAgentPerformance: h.metrics?.avgAgentPerformance || 0,
  }));
}

// Get state summary for CEO decision making
export async function getStateForDecisionMaking(companyId: string): Promise<{
  summary: string;
  keyMetrics: Record<string, number>;
  criticalIssues: string[];
  opportunities: string[];
  recommendations: string[];
}> {
  const state = await getCompanyState(companyId);

  const keyMetrics = {
    healthScore: state.healthScore || 0,
    taskSuccessRate: state.taskState?.successRate || 0,
    budgetRemaining: state.budgetState?.remaining || 0,
    capacityUtilization: state.agentState?.capacityUtilization || 0,
    activeAgents: (state.agentState?.byStatus?.active || 0) +
                  (state.agentState?.byStatus?.ready || 0),
    pendingTasks: state.taskState?.backlogSize || 0,
  };

  const criticalIssues = (state.activeAlerts || [])
    .filter(a => a.type === 'critical')
    .map(a => a.message);

  const opportunities: string[] = [];
  const recommendations: string[] = [];

  // Analyze and provide recommendations
  if (keyMetrics.capacityUtilization < 50 && keyMetrics.pendingTasks > 0) {
    opportunities.push('Agents have spare capacity');
    recommendations.push('Consider assigning more tasks to existing agents');
  }

  if (keyMetrics.capacityUtilization > 80) {
    opportunities.push('High demand for agent work');
    recommendations.push('Consider spawning additional agents');
  }

  if (keyMetrics.taskSuccessRate < 70) {
    criticalIssues.push('Task success rate is below acceptable threshold');
    recommendations.push('Review failing tasks and agent capabilities');
  }

  if (keyMetrics.budgetRemaining < (state.budgetState?.totalBudget || 0) * 0.2) {
    criticalIssues.push('Budget running low');
    recommendations.push('Review spending and optimize costs');
  }

  const summary = `Company health: ${keyMetrics.healthScore.toFixed(0)}/100. ` +
    `${keyMetrics.activeAgents} active agents, ${keyMetrics.pendingTasks} pending tasks. ` +
    `Success rate: ${keyMetrics.taskSuccessRate.toFixed(0)}%. ` +
    `Budget utilization: ${((1 - keyMetrics.budgetRemaining / (state.budgetState?.totalBudget || 1)) * 100).toFixed(0)}%.`;

  return {
    summary,
    keyMetrics,
    criticalIssues,
    opportunities,
    recommendations,
  };
}

// Run periodic state computation (called by scheduler)
export async function runStateComputationJob(): Promise<void> {
  logger.info('Running state computation job for all companies');

  const companies = await db.query.companies.findMany({
    where: eq(schema.companies.status, 'active'),
  });

  for (const company of companies) {
    try {
      await computeCompanyState(company.id);
    } catch (error) {
      logger.error('Failed to compute state for company', {
        companyId: company.id,
        error: String(error),
      });
    }
  }

  logger.info('State computation job completed', { companiesProcessed: companies.length });
}
