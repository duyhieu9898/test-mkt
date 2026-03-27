/**
 * CEO Inbox Service
 *
 * Manages events requiring CEO/Founder attention:
 * - Decision requests
 * - System alerts
 * - Success notifications
 * - Budget/Risk alerts
 */

import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { eq, and, desc, inArray, sql, lt, isNull, or } from 'drizzle-orm';
import * as schema from '@1person/core/db';
import { agentLogger } from '../lib/logger';

const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/oneperson';
const client = postgres(DATABASE_URL);
const db = drizzle(client, { schema });

const logger = agentLogger.child({ service: 'ceo-inbox' });

type EventType = 'decision_required' | 'system_alert' | 'success_event' | 'budget_alert' | 'risk_alert' | 'agent_escalation' | 'task_blocked' | 'strategy_update' | 'info';
type Severity = 'critical' | 'high' | 'medium' | 'low' | 'info';

interface CreateEventInput {
  companyId: string;
  eventType: EventType;
  severity: Severity;
  title: string;
  description?: string;
  details?: Record<string, unknown>;
  sourceType?: string;
  sourceId?: string;
  sourceAgentId?: string;
  relatedTaskId?: string;
  relatedAgentId?: string;
  requiresDecision?: boolean;
  decisionOptions?: Array<{
    id: string;
    label: string;
    description?: string;
    action: string;
    params?: Record<string, unknown>;
    isRecommended?: boolean;
  }>;
  decisionDeadline?: Date;
  expiresAt?: Date;
}

/**
 * Create a new CEO inbox event
 */
export async function createInboxEvent(input: CreateEventInput): Promise<schema.CEOInboxEvent> {
  logger.info('Creating CEO inbox event', { companyId: input.companyId, type: input.eventType, severity: input.severity });

  const [event] = await db
    .insert(schema.ceoInboxEvents)
    .values({
      companyId: input.companyId,
      eventType: input.eventType,
      severity: input.severity,
      title: input.title,
      description: input.description,
      details: input.details,
      sourceType: input.sourceType,
      sourceId: input.sourceId,
      sourceAgentId: input.sourceAgentId,
      relatedTaskId: input.relatedTaskId,
      relatedAgentId: input.relatedAgentId,
      requiresDecision: input.requiresDecision ? 1 : 0,
      decisionOptions: input.decisionOptions,
      decisionDeadline: input.decisionDeadline,
      expiresAt: input.expiresAt,
    })
    .returning();

  return event;
}

/**
 * Get unread events for a company
 */
export async function getUnreadEvents(companyId: string, limit = 50): Promise<schema.CEOInboxEvent[]> {
  return db.query.ceoInboxEvents.findMany({
    where: and(
      eq(schema.ceoInboxEvents.companyId, companyId),
      eq(schema.ceoInboxEvents.status, 'unread')
    ),
    orderBy: [
      desc(schema.ceoInboxEvents.severity),
      desc(schema.ceoInboxEvents.createdAt),
    ],
    limit,
  });
}

/**
 * Get all events for a company with filtering
 */
export async function getEvents(
  companyId: string,
  options: {
    status?: string[];
    eventTypes?: EventType[];
    severity?: Severity[];
    limit?: number;
    offset?: number;
  } = {}
): Promise<{ events: schema.CEOInboxEvent[]; total: number }> {
  const { status, eventTypes, severity, limit = 50, offset = 0 } = options;

  const conditions = [eq(schema.ceoInboxEvents.companyId, companyId)];

  if (status && status.length > 0) {
    conditions.push(inArray(schema.ceoInboxEvents.status, status as typeof schema.ceoInboxEvents.$inferSelect['status'][]));
  }

  if (eventTypes && eventTypes.length > 0) {
    conditions.push(inArray(schema.ceoInboxEvents.eventType, eventTypes));
  }

  if (severity && severity.length > 0) {
    conditions.push(inArray(schema.ceoInboxEvents.severity, severity));
  }

  const events = await db.query.ceoInboxEvents.findMany({
    where: and(...conditions),
    orderBy: [desc(schema.ceoInboxEvents.createdAt)],
    limit,
    offset,
    with: {
      sourceAgent: true,
      relatedAgent: true,
      relatedTask: true,
    },
  });

  const [countResult] = await db
    .select({ count: sql<number>`count(*)` })
    .from(schema.ceoInboxEvents)
    .where(and(...conditions));

  return {
    events,
    total: Number(countResult.count),
  };
}

/**
 * Get pending decisions
 */
export async function getPendingDecisions(companyId: string): Promise<schema.CEOInboxEvent[]> {
  const now = new Date();

  return db.query.ceoInboxEvents.findMany({
    where: and(
      eq(schema.ceoInboxEvents.companyId, companyId),
      eq(schema.ceoInboxEvents.requiresDecision, 1),
      eq(schema.ceoInboxEvents.status, 'unread'),
      or(
        isNull(schema.ceoInboxEvents.decisionDeadline),
        sql`${schema.ceoInboxEvents.decisionDeadline} > ${now}`
      )
    ),
    orderBy: [
      desc(schema.ceoInboxEvents.severity),
      schema.ceoInboxEvents.decisionDeadline,
    ],
  });
}

/**
 * Mark event as read
 */
export async function markAsRead(eventId: string): Promise<void> {
  await db
    .update(schema.ceoInboxEvents)
    .set({
      status: 'read',
      readAt: new Date(),
    })
    .where(eq(schema.ceoInboxEvents.id, eventId));
}

/**
 * Mark all events as read for a company
 */
export async function markAllAsRead(companyId: string): Promise<number> {
  const result = await db
    .update(schema.ceoInboxEvents)
    .set({
      status: 'read',
      readAt: new Date(),
    })
    .where(
      and(
        eq(schema.ceoInboxEvents.companyId, companyId),
        eq(schema.ceoInboxEvents.status, 'unread')
      )
    );

  return result.length;
}

/**
 * Take action on a decision event
 */
export async function makeDecision(
  eventId: string,
  decisionId: string,
  userId?: string
): Promise<{ success: boolean; actionResult?: unknown }> {
  const event = await db.query.ceoInboxEvents.findFirst({
    where: eq(schema.ceoInboxEvents.id, eventId),
  });

  if (!event) {
    throw new Error('Event not found');
  }

  if (!event.requiresDecision) {
    throw new Error('Event does not require a decision');
  }

  const options = event.decisionOptions as CreateEventInput['decisionOptions'];
  const selectedOption = options?.find(o => o.id === decisionId);

  if (!selectedOption) {
    throw new Error('Invalid decision option');
  }

  // Update event status
  await db
    .update(schema.ceoInboxEvents)
    .set({
      status: 'action_taken',
      decisionMade: decisionId,
      decisionMadeAt: new Date(),
      decisionMadeBy: userId,
      actionTakenAt: new Date(),
    })
    .where(eq(schema.ceoInboxEvents.id, eventId));

  // Execute the action (this would call appropriate services)
  const actionResult = await executeDecisionAction(event.companyId, selectedOption.action, selectedOption.params);

  logger.info('Decision made on CEO inbox event', {
    eventId,
    decisionId,
    action: selectedOption.action,
  });

  return { success: true, actionResult };
}

/**
 * Execute the action associated with a decision
 */
async function executeDecisionAction(
  companyId: string,
  action: string,
  params?: Record<string, unknown>
): Promise<unknown> {
  // This would integrate with various services based on the action type
  switch (action) {
    case 'approve_budget':
      // Would call budget service
      logger.info('Budget approved', { companyId, params });
      return { approved: true };

    case 'approve_task':
      // Would approve a task
      if (params?.taskId) {
        await db
          .update(schema.tasks)
          .set({ status: 'pending' })
          .where(eq(schema.tasks.id, params.taskId as string));
      }
      return { approved: true };

    case 'reject_task':
      if (params?.taskId) {
        await db
          .update(schema.tasks)
          .set({ status: 'cancelled' })
          .where(eq(schema.tasks.id, params.taskId as string));
      }
      return { rejected: true };

    case 'pause_agent':
      if (params?.agentId) {
        await db
          .update(schema.agents)
          .set({ status: 'idle' })
          .where(eq(schema.agents.id, params.agentId as string));
      }
      return { paused: true };

    case 'resume_agent':
      if (params?.agentId) {
        await db
          .update(schema.agents)
          .set({ status: 'running' })
          .where(eq(schema.agents.id, params.agentId as string));
      }
      return { resumed: true };

    case 'acknowledge':
      // Just acknowledge, no action needed
      return { acknowledged: true };

    default:
      logger.warn('Unknown decision action', { action, params });
      return { action, executed: false };
  }
}

/**
 * Dismiss an event
 */
export async function dismissEvent(eventId: string): Promise<void> {
  await db
    .update(schema.ceoInboxEvents)
    .set({
      status: 'dismissed',
      actionTakenAt: new Date(),
    })
    .where(eq(schema.ceoInboxEvents.id, eventId));
}

/**
 * Get inbox statistics
 */
export async function getInboxStats(companyId: string): Promise<{
  unread: number;
  pendingDecisions: number;
  critical: number;
  byType: Record<string, number>;
}> {
  const unreadEvents = await db.query.ceoInboxEvents.findMany({
    where: and(
      eq(schema.ceoInboxEvents.companyId, companyId),
      eq(schema.ceoInboxEvents.status, 'unread')
    ),
  });

  const pendingDecisions = unreadEvents.filter(e => e.requiresDecision === 1);
  const critical = unreadEvents.filter(e => e.severity === 'critical');

  const byType: Record<string, number> = {};
  for (const event of unreadEvents) {
    byType[event.eventType] = (byType[event.eventType] || 0) + 1;
  }

  return {
    unread: unreadEvents.length,
    pendingDecisions: pendingDecisions.length,
    critical: critical.length,
    byType,
  };
}

/**
 * Clean up expired events
 */
export async function cleanupExpiredEvents(): Promise<number> {
  const now = new Date();

  const result = await db
    .update(schema.ceoInboxEvents)
    .set({ status: 'expired' })
    .where(
      and(
        lt(schema.ceoInboxEvents.expiresAt, now),
        inArray(schema.ceoInboxEvents.status, ['unread', 'read'])
      )
    );

  return result.length;
}

// ==================== HELPER FUNCTIONS FOR CREATING COMMON EVENTS ====================

/**
 * Create a decision required event
 */
export async function createDecisionEvent(
  companyId: string,
  title: string,
  description: string,
  options: CreateEventInput['decisionOptions'],
  opts: {
    severity?: Severity;
    deadline?: Date;
    sourceAgentId?: string;
    relatedTaskId?: string;
    details?: Record<string, unknown>;
  } = {}
): Promise<schema.CEOInboxEvent> {
  return createInboxEvent({
    companyId,
    eventType: 'decision_required',
    severity: opts.severity || 'high',
    title,
    description,
    decisionOptions: options,
    requiresDecision: true,
    decisionDeadline: opts.deadline,
    sourceAgentId: opts.sourceAgentId,
    relatedTaskId: opts.relatedTaskId,
    details: opts.details,
  });
}

/**
 * Create a system alert event
 */
export async function createSystemAlert(
  companyId: string,
  title: string,
  description: string,
  severity: Severity,
  details?: Record<string, unknown>
): Promise<schema.CEOInboxEvent> {
  return createInboxEvent({
    companyId,
    eventType: 'system_alert',
    severity,
    title,
    description,
    details,
    sourceType: 'system',
  });
}

/**
 * Create a success event
 */
export async function createSuccessEvent(
  companyId: string,
  title: string,
  description: string,
  details?: Record<string, unknown>
): Promise<schema.CEOInboxEvent> {
  return createInboxEvent({
    companyId,
    eventType: 'success_event',
    severity: 'info',
    title,
    description,
    details,
  });
}

/**
 * Create a budget alert
 */
export async function createBudgetAlert(
  companyId: string,
  title: string,
  description: string,
  severity: Severity,
  details: {
    currentSpend: number;
    budget: number;
    utilization: number;
  }
): Promise<schema.CEOInboxEvent> {
  return createInboxEvent({
    companyId,
    eventType: 'budget_alert',
    severity,
    title,
    description,
    details,
    sourceType: 'system',
  });
}

/**
 * Create a risk alert
 */
export async function createRiskAlert(
  companyId: string,
  title: string,
  description: string,
  severity: Severity,
  details: Record<string, unknown>
): Promise<schema.CEOInboxEvent> {
  return createInboxEvent({
    companyId,
    eventType: 'risk_alert',
    severity,
    title,
    description,
    details,
    sourceType: 'system',
  });
}

/**
 * Create an agent escalation event
 */
export async function createAgentEscalation(
  companyId: string,
  agentId: string,
  title: string,
  description: string,
  severity: Severity,
  options?: CreateEventInput['decisionOptions']
): Promise<schema.CEOInboxEvent> {
  return createInboxEvent({
    companyId,
    eventType: 'agent_escalation',
    severity,
    title,
    description,
    sourceType: 'agent',
    sourceAgentId: agentId,
    relatedAgentId: agentId,
    requiresDecision: options ? true : false,
    decisionOptions: options,
  });
}
