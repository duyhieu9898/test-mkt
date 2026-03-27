/**
 * Risk Monitoring Loop
 *
 * Proactively monitors critical business metrics and takes protective actions:
 * - Cash runway monitoring
 * - Infrastructure health
 * - Failure spike detection
 *
 * CEO Agent can:
 * - Pause campaigns (reduce spending)
 * - Reduce agents (scale down workforce)
 * - Scale infrastructure (up/down based on needs)
 * - Freeze hiring (stop agent creation)
 * - Emergency mode (minimal operations)
 */

import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { eq, and, desc, gte, sql } from 'drizzle-orm';
import * as schema from '@1person/core/db';
import { callLLM, type LLMMessage } from '../lib/llm';
import { agentLogger } from '../lib/logger';
import { getCompanyState } from './company-state-engine';
import { runCEOReasoningLoop } from './ceo-reasoning-loop';

const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/oneperson';
const client = postgres(DATABASE_URL);
const db = drizzle(client, { schema });

const logger = agentLogger.child({ service: 'risk-monitoring' });

// Risk severity levels
type RiskSeverity = 'critical' | 'high' | 'medium' | 'low';

// Risk categories
type RiskCategory = 'financial' | 'operational' | 'infrastructure' | 'performance';

interface RiskAssessment {
  category: RiskCategory;
  name: string;
  severity: RiskSeverity;
  currentValue: number;
  threshold: number;
  trend: 'improving' | 'stable' | 'worsening';
  description: string;
  recommendedActions: string[];
}

interface RiskMonitoringResult {
  companyId: string;
  timestamp: Date;
  overallRiskLevel: RiskSeverity;
  risks: RiskAssessment[];
  actionsTaken: Array<{
    action: string;
    reason: string;
    success: boolean;
  }>;
  requiresHumanReview: boolean;
}

// Risk thresholds configuration
const RISK_THRESHOLDS = {
  // Financial risks
  cashRunwayDays: {
    critical: 7,    // < 7 days runway = CRITICAL
    high: 14,       // < 14 days = HIGH
    medium: 30,     // < 30 days = MEDIUM
  },
  budgetUtilization: {
    critical: 95,   // > 95% = CRITICAL
    high: 85,       // > 85% = HIGH
    medium: 75,     // > 75% = MEDIUM
  },
  dailySpendRate: {
    critical: 150,  // > 150% of planned = CRITICAL
    high: 120,      // > 120% = HIGH
    medium: 100,    // > 100% = MEDIUM
  },

  // Operational risks
  taskFailureRate: {
    critical: 50,   // > 50% = CRITICAL
    high: 30,       // > 30% = HIGH
    medium: 15,     // > 15% = MEDIUM
  },
  agentErrorRate: {
    critical: 40,   // > 40% = CRITICAL
    high: 25,       // > 25% = HIGH
    medium: 10,     // > 10% = MEDIUM
  },
  pendingTaskBacklog: {
    critical: 100,  // > 100 pending = CRITICAL
    high: 50,       // > 50 = HIGH
    medium: 25,     // > 25 = MEDIUM
  },

  // Infrastructure risks
  systemHealth: {
    critical: 30,   // < 30% = CRITICAL
    high: 50,       // < 50% = HIGH
    medium: 70,     // < 70% = MEDIUM
  },
  responseTime: {
    critical: 10000, // > 10s = CRITICAL
    high: 5000,      // > 5s = HIGH
    medium: 2000,    // > 2s = MEDIUM
  },

  // Performance risks
  agentUtilization: {
    critical: 95,   // > 95% = CRITICAL (overworked)
    high: 85,       // > 85% = HIGH
    medium: 75,     // > 75% = MEDIUM
  },
  lowPerformingAgents: {
    critical: 50,   // > 50% underperforming = CRITICAL
    high: 30,       // > 30% = HIGH
    medium: 15,     // > 15% = MEDIUM
  },
};

/**
 * Main risk monitoring loop
 */
export async function runRiskMonitoringLoop(companyId: string): Promise<RiskMonitoringResult> {
  logger.info('Starting risk monitoring loop', { companyId });

  const timestamp = new Date();
  const risks: RiskAssessment[] = [];
  const actionsTaken: RiskMonitoringResult['actionsTaken'] = [];

  try {
    // Get current company state
    const companyState = await getCompanyState(companyId);

    if (!companyState) {
      logger.warn('No company state found', { companyId });
      return {
        companyId,
        timestamp,
        overallRiskLevel: 'low',
        risks: [],
        actionsTaken: [],
        requiresHumanReview: false,
      };
    }

    // Assess all risk categories
    const financialRisks = await assessFinancialRisks(companyId, companyState);
    const operationalRisks = await assessOperationalRisks(companyId, companyState);
    const infrastructureRisks = await assessInfrastructureRisks(companyId, companyState);
    const performanceRisks = await assessPerformanceRisks(companyId, companyState);

    risks.push(...financialRisks, ...operationalRisks, ...infrastructureRisks, ...performanceRisks);

    // Calculate overall risk level
    const overallRiskLevel = calculateOverallRiskLevel(risks);

    // Take automatic protective actions for critical/high risks
    const criticalRisks = risks.filter(r => r.severity === 'critical');
    const highRisks = risks.filter(r => r.severity === 'high');

    if (criticalRisks.length > 0) {
      logger.warn('Critical risks detected', { companyId, count: criticalRisks.length });

      for (const risk of criticalRisks) {
        const actions = await executeProtectiveActions(companyId, risk);
        actionsTaken.push(...actions);
      }

      // Trigger CEO reasoning loop for critical situations
      await triggerCEOEmergencyReview(companyId, criticalRisks);
    }

    if (highRisks.length > 0) {
      logger.info('High risks detected', { companyId, count: highRisks.length });

      for (const risk of highRisks) {
        const actions = await executeProtectiveActions(companyId, risk);
        actionsTaken.push(...actions);
      }
    }

    // Store risk assessment in company state
    await storeRiskAssessment(companyId, {
      overallRiskLevel,
      risks,
      actionsTaken,
      assessedAt: timestamp,
    });

    // Log audit entry
    await logRiskMonitoringAudit(companyId, overallRiskLevel, risks, actionsTaken);

    const result: RiskMonitoringResult = {
      companyId,
      timestamp,
      overallRiskLevel,
      risks,
      actionsTaken,
      requiresHumanReview: criticalRisks.length > 0,
    };

    logger.info('Risk monitoring complete', {
      companyId,
      overallRiskLevel,
      totalRisks: risks.length,
      criticalCount: criticalRisks.length,
      highCount: highRisks.length,
      actionsCount: actionsTaken.length,
    });

    return result;

  } catch (error) {
    logger.error('Risk monitoring failed', { companyId, error });
    throw error;
  }
}

/**
 * Assess financial risks
 */
async function assessFinancialRisks(
  companyId: string,
  state: NonNullable<Awaited<ReturnType<typeof getCompanyState>>>
): Promise<RiskAssessment[]> {
  const risks: RiskAssessment[] = [];
  const budgetState = state.budgetState as {
    totalBudget: number;
    used: number;
    remaining: number;
    utilization: number;
    dailySpendRate: number;
  } | null;

  if (!budgetState) return risks;

  // Cash runway check
  const dailySpend = budgetState.dailySpendRate || 0;
  const remaining = budgetState.remaining || 0;
  const runwayDays = dailySpend > 0 ? Math.floor(remaining / dailySpend) : 999;

  if (runwayDays < RISK_THRESHOLDS.cashRunwayDays.critical) {
    risks.push({
      category: 'financial',
      name: 'Cash Runway Critical',
      severity: 'critical',
      currentValue: runwayDays,
      threshold: RISK_THRESHOLDS.cashRunwayDays.critical,
      trend: 'worsening',
      description: `Only ${runwayDays} days of runway remaining at current spend rate`,
      recommendedActions: ['pause_campaigns', 'reduce_agents', 'freeze_hiring'],
    });
  } else if (runwayDays < RISK_THRESHOLDS.cashRunwayDays.high) {
    risks.push({
      category: 'financial',
      name: 'Cash Runway Low',
      severity: 'high',
      currentValue: runwayDays,
      threshold: RISK_THRESHOLDS.cashRunwayDays.high,
      trend: 'worsening',
      description: `${runwayDays} days of runway remaining`,
      recommendedActions: ['reduce_spend', 'optimize_costs'],
    });
  } else if (runwayDays < RISK_THRESHOLDS.cashRunwayDays.medium) {
    risks.push({
      category: 'financial',
      name: 'Cash Runway Warning',
      severity: 'medium',
      currentValue: runwayDays,
      threshold: RISK_THRESHOLDS.cashRunwayDays.medium,
      trend: 'stable',
      description: `${runwayDays} days of runway remaining`,
      recommendedActions: ['review_budget'],
    });
  }

  // Budget utilization check
  const utilization = budgetState.utilization || 0;

  if (utilization > RISK_THRESHOLDS.budgetUtilization.critical) {
    risks.push({
      category: 'financial',
      name: 'Budget Exhausted',
      severity: 'critical',
      currentValue: utilization,
      threshold: RISK_THRESHOLDS.budgetUtilization.critical,
      trend: 'worsening',
      description: `Budget ${utilization.toFixed(1)}% utilized - near exhaustion`,
      recommendedActions: ['pause_campaigns', 'emergency_mode'],
    });
  } else if (utilization > RISK_THRESHOLDS.budgetUtilization.high) {
    risks.push({
      category: 'financial',
      name: 'Budget High Usage',
      severity: 'high',
      currentValue: utilization,
      threshold: RISK_THRESHOLDS.budgetUtilization.high,
      trend: 'worsening',
      description: `Budget ${utilization.toFixed(1)}% utilized`,
      recommendedActions: ['reduce_spend'],
    });
  }

  return risks;
}

/**
 * Assess operational risks
 */
async function assessOperationalRisks(
  companyId: string,
  state: NonNullable<Awaited<ReturnType<typeof getCompanyState>>>
): Promise<RiskAssessment[]> {
  const risks: RiskAssessment[] = [];
  const taskState = state.taskState as {
    total: number;
    completed: number;
    failed: number;
    pending: number;
    inProgress: number;
    successRate: number;
  } | null;

  if (!taskState) return risks;

  // Task failure rate
  const failureRate = taskState.total > 0
    ? (taskState.failed / taskState.total) * 100
    : 0;

  if (failureRate > RISK_THRESHOLDS.taskFailureRate.critical) {
    risks.push({
      category: 'operational',
      name: 'Task Failure Spike',
      severity: 'critical',
      currentValue: failureRate,
      threshold: RISK_THRESHOLDS.taskFailureRate.critical,
      trend: 'worsening',
      description: `${failureRate.toFixed(1)}% task failure rate - operations severely impacted`,
      recommendedActions: ['pause_new_tasks', 'investigate_failures', 'scale_down'],
    });
  } else if (failureRate > RISK_THRESHOLDS.taskFailureRate.high) {
    risks.push({
      category: 'operational',
      name: 'Task Failure High',
      severity: 'high',
      currentValue: failureRate,
      threshold: RISK_THRESHOLDS.taskFailureRate.high,
      trend: 'worsening',
      description: `${failureRate.toFixed(1)}% task failure rate`,
      recommendedActions: ['investigate_failures', 'reduce_load'],
    });
  }

  // Pending task backlog
  const pendingTasks = taskState.pending || 0;

  if (pendingTasks > RISK_THRESHOLDS.pendingTaskBacklog.critical) {
    risks.push({
      category: 'operational',
      name: 'Task Backlog Critical',
      severity: 'critical',
      currentValue: pendingTasks,
      threshold: RISK_THRESHOLDS.pendingTaskBacklog.critical,
      trend: 'worsening',
      description: `${pendingTasks} tasks pending - severe backlog`,
      recommendedActions: ['scale_agents', 'prioritize_tasks', 'pause_low_priority'],
    });
  } else if (pendingTasks > RISK_THRESHOLDS.pendingTaskBacklog.high) {
    risks.push({
      category: 'operational',
      name: 'Task Backlog High',
      severity: 'high',
      currentValue: pendingTasks,
      threshold: RISK_THRESHOLDS.pendingTaskBacklog.high,
      trend: 'worsening',
      description: `${pendingTasks} tasks pending`,
      recommendedActions: ['scale_agents'],
    });
  }

  return risks;
}

/**
 * Assess infrastructure risks
 */
async function assessInfrastructureRisks(
  companyId: string,
  state: NonNullable<Awaited<ReturnType<typeof getCompanyState>>>
): Promise<RiskAssessment[]> {
  const risks: RiskAssessment[] = [];

  // Check system health score
  const healthScore = state.healthScore || 100;

  if (healthScore < RISK_THRESHOLDS.systemHealth.critical) {
    risks.push({
      category: 'infrastructure',
      name: 'System Health Critical',
      severity: 'critical',
      currentValue: healthScore,
      threshold: RISK_THRESHOLDS.systemHealth.critical,
      trend: 'worsening',
      description: `System health at ${healthScore}% - immediate action required`,
      recommendedActions: ['emergency_mode', 'scale_infrastructure', 'notify_admin'],
    });
  } else if (healthScore < RISK_THRESHOLDS.systemHealth.high) {
    risks.push({
      category: 'infrastructure',
      name: 'System Health Low',
      severity: 'high',
      currentValue: healthScore,
      threshold: RISK_THRESHOLDS.systemHealth.high,
      trend: 'worsening',
      description: `System health at ${healthScore}%`,
      recommendedActions: ['investigate_issues', 'scale_infrastructure'],
    });
  }

  return risks;
}

/**
 * Assess performance risks
 */
async function assessPerformanceRisks(
  companyId: string,
  state: NonNullable<Awaited<ReturnType<typeof getCompanyState>>>
): Promise<RiskAssessment[]> {
  const risks: RiskAssessment[] = [];
  const agentState = state.agentState as {
    total: number;
    active: number;
    idle: number;
    averagePerformance: number;
    topPerformers: string[];
    underperformers: string[];
  } | null;

  if (!agentState) return risks;

  // Check for underperforming agents
  const totalAgents = agentState.total || 0;
  const underperformers = agentState.underperformers?.length || 0;
  const underperformingRate = totalAgents > 0 ? (underperformers / totalAgents) * 100 : 0;

  if (underperformingRate > RISK_THRESHOLDS.lowPerformingAgents.critical) {
    risks.push({
      category: 'performance',
      name: 'Agent Performance Crisis',
      severity: 'critical',
      currentValue: underperformingRate,
      threshold: RISK_THRESHOLDS.lowPerformingAgents.critical,
      trend: 'worsening',
      description: `${underperformingRate.toFixed(0)}% of agents underperforming`,
      recommendedActions: ['retrain_agents', 'reduce_agents', 'reassign_tasks'],
    });
  } else if (underperformingRate > RISK_THRESHOLDS.lowPerformingAgents.high) {
    risks.push({
      category: 'performance',
      name: 'Agent Performance Low',
      severity: 'high',
      currentValue: underperformingRate,
      threshold: RISK_THRESHOLDS.lowPerformingAgents.high,
      trend: 'worsening',
      description: `${underperformingRate.toFixed(0)}% of agents underperforming`,
      recommendedActions: ['retrain_agents', 'review_assignments'],
    });
  }

  // Check agent utilization (overworked)
  const activeAgents = agentState.active || 0;
  const utilization = totalAgents > 0 ? (activeAgents / totalAgents) * 100 : 0;

  if (utilization > RISK_THRESHOLDS.agentUtilization.critical) {
    risks.push({
      category: 'performance',
      name: 'Agents Overloaded',
      severity: 'high',
      currentValue: utilization,
      threshold: RISK_THRESHOLDS.agentUtilization.critical,
      trend: 'worsening',
      description: `${utilization.toFixed(0)}% agent utilization - risk of burnout/failures`,
      recommendedActions: ['scale_agents', 'reduce_tasks'],
    });
  }

  return risks;
}

/**
 * Calculate overall risk level from individual risks
 */
function calculateOverallRiskLevel(risks: RiskAssessment[]): RiskSeverity {
  const criticalCount = risks.filter(r => r.severity === 'critical').length;
  const highCount = risks.filter(r => r.severity === 'high').length;
  const mediumCount = risks.filter(r => r.severity === 'medium').length;

  if (criticalCount > 0) return 'critical';
  if (highCount >= 2) return 'critical';
  if (highCount > 0) return 'high';
  if (mediumCount >= 3) return 'high';
  if (mediumCount > 0) return 'medium';
  return 'low';
}

/**
 * Execute protective actions based on risk
 */
async function executeProtectiveActions(
  companyId: string,
  risk: RiskAssessment
): Promise<Array<{ action: string; reason: string; success: boolean }>> {
  const results: Array<{ action: string; reason: string; success: boolean }> = [];

  for (const action of risk.recommendedActions) {
    try {
      const success = await executeAction(companyId, action, risk);
      results.push({
        action,
        reason: risk.description,
        success,
      });

      if (success) {
        logger.info('Protective action executed', { companyId, action, risk: risk.name });
      }
    } catch (error) {
      logger.error('Failed to execute protective action', { companyId, action, error });
      results.push({
        action,
        reason: risk.description,
        success: false,
      });
    }
  }

  return results;
}

/**
 * Execute a specific protective action
 */
async function executeAction(
  companyId: string,
  action: string,
  risk: RiskAssessment
): Promise<boolean> {
  const now = new Date();

  switch (action) {
    case 'pause_campaigns':
      // Pause all marketing/ad campaigns by setting agents to idle
      await db
        .update(schema.agents)
        .set({ status: 'idle', updatedAt: now })
        .where(
          and(
            eq(schema.agents.companyId, companyId),
            eq(schema.agents.role, 'ads_specialist')
          )
        );
      logger.info('Paused ad campaigns', { companyId });
      return true;

    case 'reduce_agents':
      // Reduce non-essential agents (keep CEO, pause others)
      const nonEssentialRoles = ['content_creator', 'ads_specialist'];
      for (const role of nonEssentialRoles) {
        await db
          .update(schema.agents)
          .set({ status: 'idle', updatedAt: now })
          .where(
            and(
              eq(schema.agents.companyId, companyId),
              eq(schema.agents.role, role as typeof schema.agents.$inferSelect['role'])
            )
          );
      }
      logger.info('Reduced non-essential agents', { companyId });
      return true;

    case 'freeze_hiring':
      // Update company settings to freeze new agent creation
      await db
        .update(schema.companies)
        .set({
          settings: sql`jsonb_set(COALESCE(settings, '{}'), '{hiringFrozen}', 'true')`,
          updatedAt: now,
        })
        .where(eq(schema.companies.id, companyId));
      logger.info('Hiring frozen', { companyId });
      return true;

    case 'emergency_mode':
      // Set company to emergency mode - minimal operations
      await db
        .update(schema.companies)
        .set({
          settings: sql`jsonb_set(COALESCE(settings, '{}'), '{emergencyMode}', 'true')`,
          updatedAt: now,
        })
        .where(eq(schema.companies.id, companyId));

      // Pause all non-CEO agents
      await db
        .update(schema.agents)
        .set({ status: 'idle', updatedAt: now })
        .where(
          and(
            eq(schema.agents.companyId, companyId),
            sql`role != 'ceo'`
          )
        );
      logger.warn('Emergency mode activated', { companyId });
      return true;

    case 'pause_new_tasks':
      // Cancel pending low-priority tasks
      await db
        .update(schema.tasks)
        .set({ status: 'cancelled', updatedAt: now })
        .where(
          and(
            eq(schema.tasks.companyId, companyId),
            eq(schema.tasks.status, 'pending'),
            eq(schema.tasks.priority, 'low')
          )
        );
      logger.info('Low priority tasks cancelled', { companyId });
      return true;

    case 'reduce_spend':
      // Log recommendation (actual budget adjustment requires human approval)
      logger.info('Spend reduction recommended', { companyId, risk: risk.name });
      return true;

    case 'scale_agents':
      // Log recommendation for scaling (requires budget approval)
      logger.info('Agent scaling recommended', { companyId, risk: risk.name });
      return true;

    case 'notify_admin':
      // Create a critical notification task
      await db.insert(schema.tasks).values({
        companyId,
        title: `CRITICAL: ${risk.name}`,
        description: `${risk.description}\n\nRecommended actions: ${risk.recommendedActions.join(', ')}`,
        type: 'notification',
        priority: 'critical',
        status: 'pending',
      });
      logger.warn('Admin notification created', { companyId, risk: risk.name });
      return true;

    default:
      logger.debug('Action logged for manual review', { action, risk: risk.name });
      return true;
  }
}

/**
 * Trigger CEO emergency review for critical situations
 */
async function triggerCEOEmergencyReview(
  companyId: string,
  criticalRisks: RiskAssessment[]
): Promise<void> {
  logger.warn('Triggering CEO emergency review', {
    companyId,
    risks: criticalRisks.map(r => r.name),
  });

  // Run CEO reasoning loop with emergency context
  await runCEOReasoningLoop(companyId, {
    triggerSource: 'risk_monitoring',
    urgency: 'critical',
    context: {
      criticalRisks: criticalRisks.map(r => ({
        name: r.name,
        severity: r.severity,
        value: r.currentValue,
        threshold: r.threshold,
        description: r.description,
      })),
    },
  });
}

/**
 * Store risk assessment in company state
 */
async function storeRiskAssessment(
  companyId: string,
  assessment: {
    overallRiskLevel: RiskSeverity;
    risks: RiskAssessment[];
    actionsTaken: RiskMonitoringResult['actionsTaken'];
    assessedAt: Date;
  }
): Promise<void> {
  await db
    .update(schema.companyState)
    .set({
      riskAssessment: {
        ...assessment,
        assessedAt: assessment.assessedAt.toISOString(),
      },
      updatedAt: new Date(),
    })
    .where(eq(schema.companyState.companyId, companyId));
}

/**
 * Log risk monitoring to audit log
 */
async function logRiskMonitoringAudit(
  companyId: string,
  overallRiskLevel: RiskSeverity,
  risks: RiskAssessment[],
  actionsTaken: RiskMonitoringResult['actionsTaken']
): Promise<void> {
  await db.insert(schema.auditLogs).values({
    companyId,
    action: 'risk_monitoring',
    entityType: 'company',
    entityId: companyId,
    details: {
      overallRiskLevel,
      riskCount: risks.length,
      criticalCount: risks.filter(r => r.severity === 'critical').length,
      highCount: risks.filter(r => r.severity === 'high').length,
      actionsTaken: actionsTaken.length,
    },
  });
}

/**
 * Get latest risk assessment for a company
 */
export async function getLatestRiskAssessment(companyId: string): Promise<{
  overallRiskLevel: RiskSeverity;
  risks: RiskAssessment[];
  assessedAt: Date;
} | null> {
  const state = await db.query.companyState.findFirst({
    where: eq(schema.companyState.companyId, companyId),
  });

  if (!state?.riskAssessment) return null;

  const assessment = state.riskAssessment as {
    overallRiskLevel: RiskSeverity;
    risks: RiskAssessment[];
    assessedAt: string;
  };

  return {
    ...assessment,
    assessedAt: new Date(assessment.assessedAt),
  };
}

/**
 * Check if company is in emergency mode
 */
export async function isEmergencyMode(companyId: string): Promise<boolean> {
  const company = await db.query.companies.findFirst({
    where: eq(schema.companies.id, companyId),
  });

  const settings = company?.settings as { emergencyMode?: boolean } | null;
  return settings?.emergencyMode === true;
}

/**
 * Exit emergency mode
 */
export async function exitEmergencyMode(companyId: string): Promise<void> {
  await db
    .update(schema.companies)
    .set({
      settings: sql`jsonb_set(COALESCE(settings, '{}'), '{emergencyMode}', 'false')`,
      updatedAt: new Date(),
    })
    .where(eq(schema.companies.id, companyId));

  logger.info('Emergency mode deactivated', { companyId });
}
