/**
 * Event-Driven CEO Triggers
 *
 * Activates CEO Reasoning Loop based on:
 * - Health threshold breaches
 * - Budget threshold breaches
 * - Task failure rate spikes
 * - Agent performance issues
 * - Milestone achievements
 * - Deadline approaching
 * - State changes
 *
 * Features:
 * - Configurable triggers per company
 * - Rate limiting (cooldown)
 * - Trigger history for audit
 * - Multiple action types
 */

import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { eq, and, desc, gte, lte, sql, isNull, or } from 'drizzle-orm';
import * as schema from '@1person/core/db';
import { agentLogger } from '../lib/logger';
import { getCompanyState } from './company-state-engine';
import { runCEOReasoningLoop } from './ceo-reasoning-loop';
import { queueNotification } from '../lib/queue';

const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/oneperson';
const client = postgres(DATABASE_URL);
const db = drizzle(client, { schema });

const logger = agentLogger.child({ service: 'event-triggers' });

// Types
type EventTrigger = typeof schema.eventTriggers.$inferSelect;
type EventTriggerInsert = typeof schema.eventTriggers.$inferInsert;
type TriggerType = 'health_threshold' | 'budget_threshold' | 'task_failure_rate' |
  'agent_performance' | 'milestone_achieved' | 'deadline_approaching' |
  'external_event' | 'schedule' | 'state_change';

interface TriggerConditions {
  metric?: string;
  operator?: 'gt' | 'gte' | 'lt' | 'lte' | 'eq' | 'neq';
  threshold?: number;
  schedule?: string;
  timeWindow?: number;
  stateField?: string;
  stateValue?: unknown;
  and?: TriggerConditions[];
  or?: TriggerConditions[];
}

interface TriggerAction {
  type: 'ceo_reasoning_loop' | 'notify_user' | 'create_task' | 'send_message' | 'adjust_priority' | 'pause_operations';
  params: Record<string, unknown>;
  priority: 'critical' | 'high' | 'normal' | 'low';
}

interface TriggerContext {
  companyId: string;
  triggerId: string;
  triggerType: TriggerType;
  currentValue: number;
  thresholdValue: number;
  reason: string;
}

// ==================== TRIGGER MANAGEMENT ====================

/**
 * Create a new trigger
 */
export async function createTrigger(
  companyId: string,
  data: {
    name: string;
    description?: string;
    triggerType: TriggerType;
    conditions: TriggerConditions;
    actions: TriggerAction[];
    cooldownMinutes?: number;
    maxTriggersPerDay?: number;
  }
): Promise<EventTrigger> {
  const [trigger] = await db
    .insert(schema.eventTriggers)
    .values({
      companyId,
      name: data.name,
      description: data.description,
      triggerType: data.triggerType,
      conditions: data.conditions,
      actions: data.actions,
      cooldownMinutes: data.cooldownMinutes ?? 60,
      maxTriggersPerDay: data.maxTriggersPerDay ?? 10,
      enabled: 1,
    })
    .returning();

  logger.info('Trigger created', { companyId, triggerId: trigger.id, type: data.triggerType });

  return trigger;
}

/**
 * Get all triggers for a company
 */
export async function getTriggers(companyId: string): Promise<EventTrigger[]> {
  return db.query.eventTriggers.findMany({
    where: eq(schema.eventTriggers.companyId, companyId),
    orderBy: [desc(schema.eventTriggers.createdAt)],
  });
}

/**
 * Get enabled triggers for a company
 */
export async function getEnabledTriggers(companyId: string): Promise<EventTrigger[]> {
  return db.query.eventTriggers.findMany({
    where: and(
      eq(schema.eventTriggers.companyId, companyId),
      eq(schema.eventTriggers.enabled, 1)
    ),
  });
}

/**
 * Enable/disable a trigger
 */
export async function setTriggerEnabled(triggerId: string, enabled: boolean): Promise<void> {
  await db
    .update(schema.eventTriggers)
    .set({ enabled: enabled ? 1 : 0, updatedAt: new Date() })
    .where(eq(schema.eventTriggers.id, triggerId));
}

/**
 * Delete a trigger
 */
export async function deleteTrigger(triggerId: string): Promise<void> {
  await db.delete(schema.eventTriggers).where(eq(schema.eventTriggers.id, triggerId));
}

// ==================== TRIGGER EVALUATION ====================

/**
 * Evaluate all triggers for a company
 */
export async function evaluateTriggers(companyId: string): Promise<{
  triggersEvaluated: number;
  triggersActivated: number;
  results: Array<{
    triggerId: string;
    name: string;
    activated: boolean;
    reason?: string;
    actions?: string[];
  }>;
}> {
  logger.debug('Evaluating triggers', { companyId });

  const triggers = await getEnabledTriggers(companyId);
  const companyState = await getCompanyState(companyId);

  const results: Array<{
    triggerId: string;
    name: string;
    activated: boolean;
    reason?: string;
    actions?: string[];
  }> = [];

  let triggersActivated = 0;

  for (const trigger of triggers) {
    try {
      // Check cooldown
      if (trigger.lastTriggeredAt) {
        const cooldownMs = (trigger.cooldownMinutes || 60) * 60 * 1000;
        const timeSinceLastTrigger = Date.now() - new Date(trigger.lastTriggeredAt).getTime();

        if (timeSinceLastTrigger < cooldownMs) {
          results.push({
            triggerId: trigger.id,
            name: trigger.name,
            activated: false,
            reason: 'In cooldown period',
          });
          continue;
        }
      }

      // Check daily limit
      const todayTriggerCount = await getTodayTriggerCount(trigger.id);
      if (todayTriggerCount >= (trigger.maxTriggersPerDay || 10)) {
        results.push({
          triggerId: trigger.id,
          name: trigger.name,
          activated: false,
          reason: 'Daily limit reached',
        });
        continue;
      }

      // Evaluate conditions
      const evaluation = evaluateConditions(trigger, companyState);

      if (evaluation.triggered) {
        // Execute actions
        const actionsExecuted = await executeTriggerActions(
          trigger,
          companyId,
          evaluation.currentValue,
          evaluation.reason
        );

        // Record trigger activation
        await recordTriggerActivation(trigger, companyId, evaluation, actionsExecuted);

        results.push({
          triggerId: trigger.id,
          name: trigger.name,
          activated: true,
          reason: evaluation.reason,
          actions: actionsExecuted.map(a => a.action),
        });

        triggersActivated++;
      } else {
        results.push({
          triggerId: trigger.id,
          name: trigger.name,
          activated: false,
          reason: 'Conditions not met',
        });
      }
    } catch (error) {
      logger.error('Trigger evaluation failed', {
        triggerId: trigger.id,
        error: String(error),
      });
      results.push({
        triggerId: trigger.id,
        name: trigger.name,
        activated: false,
        reason: `Error: ${String(error)}`,
      });
    }
  }

  return {
    triggersEvaluated: triggers.length,
    triggersActivated,
    results,
  };
}

/**
 * Evaluate trigger conditions against company state
 */
function evaluateConditions(
  trigger: EventTrigger,
  companyState: Awaited<ReturnType<typeof getCompanyState>>
): { triggered: boolean; currentValue: number; reason: string } {
  const conditions = trigger.conditions as TriggerConditions;
  const triggerType = trigger.triggerType;

  // Get metric value based on trigger type
  let currentValue = 0;
  let thresholdValue = conditions.threshold || 0;

  switch (triggerType) {
    case 'health_threshold':
      currentValue = companyState.healthScore || 100;
      break;

    case 'budget_threshold':
      const budgetState = companyState.budgetState as { utilization?: number } | null;
      currentValue = (budgetState?.utilization || 0) * 100;
      break;

    case 'task_failure_rate':
      const taskState = companyState.taskState as { failureRate?: number } | null;
      currentValue = (taskState?.failureRate || 0) * 100;
      break;

    case 'agent_performance':
      const agentState = companyState.agentState as { avgPerformance?: number } | null;
      currentValue = agentState?.avgPerformance || 100;
      break;

    case 'state_change':
      // For state changes, we check if the field matches the expected value
      if (conditions.stateField) {
        const stateValue = getNestedValue(companyState, conditions.stateField);
        const matches = stateValue === conditions.stateValue;
        return {
          triggered: matches,
          currentValue: matches ? 1 : 0,
          reason: matches
            ? `State field ${conditions.stateField} changed to expected value`
            : 'State not matching',
        };
      }
      break;

    default:
      // Use custom metric from conditions
      if (conditions.metric) {
        currentValue = getNestedValue(companyState, conditions.metric) as number || 0;
      }
  }

  // Evaluate operator
  const operator = conditions.operator || 'lt';
  let triggered = false;

  switch (operator) {
    case 'gt':
      triggered = currentValue > thresholdValue;
      break;
    case 'gte':
      triggered = currentValue >= thresholdValue;
      break;
    case 'lt':
      triggered = currentValue < thresholdValue;
      break;
    case 'lte':
      triggered = currentValue <= thresholdValue;
      break;
    case 'eq':
      triggered = currentValue === thresholdValue;
      break;
    case 'neq':
      triggered = currentValue !== thresholdValue;
      break;
  }

  return {
    triggered,
    currentValue,
    reason: triggered
      ? `${triggerType}: ${currentValue} ${operator} ${thresholdValue}`
      : `Condition not met: ${currentValue} ${operator} ${thresholdValue}`,
  };
}

/**
 * Execute trigger actions
 */
async function executeTriggerActions(
  trigger: EventTrigger,
  companyId: string,
  currentValue: number,
  reason: string
): Promise<Array<{ action: string; result: string; duration: number }>> {
  const actions = trigger.actions as TriggerAction[];
  const results: Array<{ action: string; result: string; duration: number }> = [];

  for (const action of actions) {
    const startTime = Date.now();
    let result = 'success';

    try {
      switch (action.type) {
        case 'ceo_reasoning_loop':
          // Trigger CEO reasoning loop
          const companyState = await getCompanyState(companyId);
          await runCEOReasoningLoop({
            companyId,
            companyState,
            trigger: 'event',
            triggerData: {
              triggerId: trigger.id,
              triggerType: trigger.triggerType,
              currentValue,
              reason,
            },
          });
          break;

        case 'notify_user':
          // Send notification to company owner
          const company = await db.query.companies.findFirst({
            where: eq(schema.companies.id, companyId),
          });

          if (company?.ownerId) {
            await queueNotification({
              type: 'system_alert',
              userId: company.ownerId,
              companyId,
              title: `Alert: ${trigger.name}`,
              message: reason,
              metadata: {
                triggerId: trigger.id,
                currentValue,
                priority: action.priority,
              },
            });
          }
          break;

        case 'create_task':
          // Create a task for the issue
          const taskParams = action.params as { title?: string; description?: string; priority?: string };
          await db.insert(schema.tasks).values({
            companyId,
            title: taskParams.title || `Auto-task: ${trigger.name}`,
            description: taskParams.description || `Triggered because: ${reason}`,
            type: 'automated',
            priority: (taskParams.priority as 'critical' | 'high' | 'medium' | 'low') || 'high',
            status: 'pending',
            input: {
              type: 'trigger_task',
              data: {
                autoCreated: true,
                triggerId: trigger.id,
              },
            },
          });
          break;

        case 'adjust_priority':
          // Adjust task priorities
          const priorityParams = action.params as { newPriority?: string };
          logger.info('Would adjust priorities', { newPriority: priorityParams.newPriority });
          break;

        case 'pause_operations':
          // Pause operations (for critical situations)
          logger.warn('Pause operations triggered', { companyId, trigger: trigger.name });
          // Could set a flag in company state to pause autonomous operations
          break;

        default:
          result = 'unknown_action';
      }
    } catch (error) {
      result = `failed: ${String(error)}`;
      logger.error('Trigger action failed', {
        triggerId: trigger.id,
        action: action.type,
        error: String(error),
      });
    }

    results.push({
      action: action.type,
      result,
      duration: Date.now() - startTime,
    });
  }

  return results;
}

/**
 * Record trigger activation in history
 */
async function recordTriggerActivation(
  trigger: EventTrigger,
  companyId: string,
  evaluation: { currentValue: number; reason: string },
  actionsExecuted: Array<{ action: string; result: string; duration: number }>
): Promise<void> {
  const now = new Date();

  // Update trigger stats
  await db
    .update(schema.eventTriggers)
    .set({
      triggerCount: sql`${schema.eventTriggers.triggerCount} + 1`,
      lastTriggeredAt: now,
      lastTriggeredValue: evaluation.currentValue,
      updatedAt: now,
    })
    .where(eq(schema.eventTriggers.id, trigger.id));

  // Insert history record
  await db.insert(schema.eventTriggerHistory).values({
    triggerId: trigger.id,
    companyId,
    triggerType: trigger.triggerType,
    triggeredValue: evaluation.currentValue,
    thresholdValue: (trigger.conditions as TriggerConditions).threshold,
    triggerReason: evaluation.reason,
    actionsExecuted: actionsExecuted.map(a => ({
      action: a.action,
      result: a.result as 'success' | 'failed' | 'skipped',
      details: '',
      duration: a.duration,
    })),
    resultSummary: `${actionsExecuted.length} actions executed`,
    success: actionsExecuted.every(a => a.result === 'success') ? 1 : 0,
  });

  logger.info('Trigger activated', {
    triggerId: trigger.id,
    name: trigger.name,
    value: evaluation.currentValue,
    actions: actionsExecuted.length,
  });
}

/**
 * Get trigger count for today
 */
async function getTodayTriggerCount(triggerId: string): Promise<number> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const result = await db
    .select({ count: sql<number>`count(*)` })
    .from(schema.eventTriggerHistory)
    .where(
      and(
        eq(schema.eventTriggerHistory.triggerId, triggerId),
        gte(schema.eventTriggerHistory.triggeredAt, today)
      )
    );

  return result[0]?.count || 0;
}

/**
 * Get trigger history
 */
export async function getTriggerHistory(
  companyId: string,
  options?: {
    triggerId?: string;
    limit?: number;
    since?: Date;
  }
): Promise<Array<typeof schema.eventTriggerHistory.$inferSelect>> {
  const conditions = [eq(schema.eventTriggerHistory.companyId, companyId)];

  if (options?.triggerId) {
    conditions.push(eq(schema.eventTriggerHistory.triggerId, options.triggerId));
  }

  if (options?.since) {
    conditions.push(gte(schema.eventTriggerHistory.triggeredAt, options.since));
  }

  return db.query.eventTriggerHistory.findMany({
    where: and(...conditions),
    orderBy: [desc(schema.eventTriggerHistory.triggeredAt)],
    limit: options?.limit || 50,
  });
}

// ==================== DEFAULT TRIGGERS ====================

/**
 * Create default triggers for a company
 */
export async function createDefaultTriggers(companyId: string): Promise<EventTrigger[]> {
  const defaultTriggers: Array<{
    name: string;
    description: string;
    triggerType: TriggerType;
    conditions: TriggerConditions;
    actions: TriggerAction[];
  }> = [
    {
      name: 'Critical Health Alert',
      description: 'Triggers when company health score drops below 50',
      triggerType: 'health_threshold',
      conditions: {
        metric: 'healthScore',
        operator: 'lt',
        threshold: 50,
      },
      actions: [
        {
          type: 'ceo_reasoning_loop',
          params: { urgency: 'critical' },
          priority: 'critical',
        },
        {
          type: 'notify_user',
          params: {},
          priority: 'critical',
        },
      ],
    },
    {
      name: 'Budget Warning',
      description: 'Triggers when budget utilization exceeds 80%',
      triggerType: 'budget_threshold',
      conditions: {
        metric: 'budgetState.utilization',
        operator: 'gt',
        threshold: 80,
      },
      actions: [
        {
          type: 'notify_user',
          params: {},
          priority: 'high',
        },
        {
          type: 'ceo_reasoning_loop',
          params: { focus: 'budget' },
          priority: 'high',
        },
      ],
    },
    {
      name: 'High Task Failure Rate',
      description: 'Triggers when task failure rate exceeds 30%',
      triggerType: 'task_failure_rate',
      conditions: {
        metric: 'taskState.failureRate',
        operator: 'gt',
        threshold: 30,
      },
      actions: [
        {
          type: 'ceo_reasoning_loop',
          params: { focus: 'task_quality' },
          priority: 'high',
        },
      ],
    },
    {
      name: 'Agent Performance Drop',
      description: 'Triggers when average agent performance drops below 60',
      triggerType: 'agent_performance',
      conditions: {
        metric: 'agentState.avgPerformance',
        operator: 'lt',
        threshold: 60,
      },
      actions: [
        {
          type: 'ceo_reasoning_loop',
          params: { focus: 'agent_improvement' },
          priority: 'normal',
        },
      ],
    },
  ];

  const createdTriggers: EventTrigger[] = [];

  for (const triggerData of defaultTriggers) {
    const trigger = await createTrigger(companyId, {
      ...triggerData,
      cooldownMinutes: 60,
      maxTriggersPerDay: 5,
    });
    createdTriggers.push(trigger);
  }

  logger.info('Default triggers created', {
    companyId,
    count: createdTriggers.length,
  });

  return createdTriggers;
}

// ==================== UTILITIES ====================

/**
 * Get nested value from object using dot notation
 */
function getNestedValue(obj: Record<string, unknown>, path: string): unknown {
  return path.split('.').reduce((current: unknown, key) => {
    if (current && typeof current === 'object') {
      return (current as Record<string, unknown>)[key];
    }
    return undefined;
  }, obj);
}

// ==================== SCHEDULED EVALUATION ====================

/**
 * Run trigger evaluation for all active companies
 * Should be called by the scheduler (e.g., every 5 minutes)
 */
export async function runTriggerEvaluation(): Promise<void> {
  logger.info('Running trigger evaluation for all companies');

  const companies = await db.query.companies.findMany({
    where: eq(schema.companies.status, 'active'),
  });

  for (const company of companies) {
    try {
      const result = await evaluateTriggers(company.id);

      if (result.triggersActivated > 0) {
        logger.info('Triggers activated', {
          companyId: company.id,
          activated: result.triggersActivated,
        });
      }
    } catch (error) {
      logger.error('Trigger evaluation failed for company', {
        companyId: company.id,
        error: String(error),
      });
    }
  }
}
