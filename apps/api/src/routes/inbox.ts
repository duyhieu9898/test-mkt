/**
 * CEO Inbox API Routes
 *
 * Endpoints for managing CEO inbox events and decisions.
 */

import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { eq, and, desc, inArray, sql } from 'drizzle-orm';
import { db } from '../lib/db';
import { ceoInboxEvents, companies } from '@1person/core/db';
import { authMiddleware } from '../middleware/auth';
import { HTTPException } from 'hono/http-exception';

const inboxRouter = new Hono();

// Apply auth to all routes
inboxRouter.use('*', authMiddleware);

// ==================== HELPER ====================

async function verifyCompanyAccess(userId: string, companyId: string) {
  const company = await db.query.companies.findFirst({
    where: and(
      eq(companies.id, companyId),
      eq(companies.ownerId, userId)
    ),
  });

  if (!company) {
    throw new HTTPException(404, { message: 'Company not found' });
  }

  return company;
}

// ==================== ROUTES ====================

// Get inbox events with filtering
inboxRouter.get('/company/:companyId', async (c) => {
  const { userId } = c.get('user');
  const { companyId } = c.req.param();
  const status = c.req.query('status')?.split(',');
  const eventTypes = c.req.query('eventTypes')?.split(',');
  const severity = c.req.query('severity')?.split(',');
  const limit = parseInt(c.req.query('limit') || '50');
  const offset = parseInt(c.req.query('offset') || '0');

  await verifyCompanyAccess(userId, companyId);

  const conditions = [eq(ceoInboxEvents.companyId, companyId)];

  if (status && status.length > 0 && status[0] !== '') {
    conditions.push(inArray(ceoInboxEvents.status, status as typeof ceoInboxEvents.$inferSelect['status'][]));
  }

  if (eventTypes && eventTypes.length > 0 && eventTypes[0] !== '') {
    conditions.push(inArray(ceoInboxEvents.eventType, eventTypes as typeof ceoInboxEvents.$inferSelect['eventType'][]));
  }

  if (severity && severity.length > 0 && severity[0] !== '') {
    conditions.push(inArray(ceoInboxEvents.severity, severity as typeof ceoInboxEvents.$inferSelect['severity'][]));
  }

  const events = await db.query.ceoInboxEvents.findMany({
    where: and(...conditions),
    orderBy: [desc(ceoInboxEvents.createdAt)],
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
    .from(ceoInboxEvents)
    .where(and(...conditions));

  return c.json({
    data: events,
    total: Number(countResult.count),
    limit,
    offset,
  });
});

// Get inbox statistics
inboxRouter.get('/company/:companyId/stats', async (c) => {
  const { userId } = c.get('user');
  const { companyId } = c.req.param();

  await verifyCompanyAccess(userId, companyId);

  const unreadEvents = await db.query.ceoInboxEvents.findMany({
    where: and(
      eq(ceoInboxEvents.companyId, companyId),
      eq(ceoInboxEvents.status, 'unread')
    ),
  });

  const pendingDecisions = unreadEvents.filter(e => e.requiresDecision === 1);
  const critical = unreadEvents.filter(e => e.severity === 'critical');

  const byType: Record<string, number> = {};
  const bySeverity: Record<string, number> = {};

  for (const event of unreadEvents) {
    byType[event.eventType] = (byType[event.eventType] || 0) + 1;
    bySeverity[event.severity] = (bySeverity[event.severity] || 0) + 1;
  }

  return c.json({
    data: {
      unread: unreadEvents.length,
      pendingDecisions: pendingDecisions.length,
      critical: critical.length,
      byType,
      bySeverity,
    },
  });
});

// Get pending decisions
inboxRouter.get('/company/:companyId/decisions', async (c) => {
  const { userId } = c.get('user');
  const { companyId } = c.req.param();

  await verifyCompanyAccess(userId, companyId);

  const decisions = await db.query.ceoInboxEvents.findMany({
    where: and(
      eq(ceoInboxEvents.companyId, companyId),
      eq(ceoInboxEvents.requiresDecision, 1),
      eq(ceoInboxEvents.status, 'unread')
    ),
    orderBy: [
      desc(ceoInboxEvents.severity),
      ceoInboxEvents.decisionDeadline,
    ],
    with: {
      sourceAgent: true,
      relatedAgent: true,
      relatedTask: true,
    },
  });

  return c.json({ data: decisions });
});

// Get single event
inboxRouter.get('/:eventId', async (c) => {
  const { userId } = c.get('user');
  const { eventId } = c.req.param();

  const event = await db.query.ceoInboxEvents.findFirst({
    where: eq(ceoInboxEvents.id, eventId),
    with: {
      sourceAgent: true,
      relatedAgent: true,
      relatedTask: true,
    },
  });

  if (!event) {
    throw new HTTPException(404, { message: 'Event not found' });
  }

  await verifyCompanyAccess(userId, event.companyId);

  return c.json({ data: event });
});

// Mark event as read
inboxRouter.patch('/:eventId/read', async (c) => {
  const { userId } = c.get('user');
  const { eventId } = c.req.param();

  const event = await db.query.ceoInboxEvents.findFirst({
    where: eq(ceoInboxEvents.id, eventId),
  });

  if (!event) {
    throw new HTTPException(404, { message: 'Event not found' });
  }

  await verifyCompanyAccess(userId, event.companyId);

  await db
    .update(ceoInboxEvents)
    .set({
      status: 'read',
      readAt: new Date(),
    })
    .where(eq(ceoInboxEvents.id, eventId));

  return c.json({ message: 'Marked as read' });
});

// Mark all as read
inboxRouter.patch('/company/:companyId/read-all', async (c) => {
  const { userId } = c.get('user');
  const { companyId } = c.req.param();

  await verifyCompanyAccess(userId, companyId);

  const result = await db
    .update(ceoInboxEvents)
    .set({
      status: 'read',
      readAt: new Date(),
    })
    .where(
      and(
        eq(ceoInboxEvents.companyId, companyId),
        eq(ceoInboxEvents.status, 'unread')
      )
    );

  return c.json({ message: 'All marked as read', count: result.length });
});

// Make a decision
const makeDecisionSchema = z.object({
  decisionId: z.string().min(1),
});

inboxRouter.post(
  '/:eventId/decide',
  zValidator('json', makeDecisionSchema),
  async (c) => {
    const { userId } = c.get('user');
    const { eventId } = c.req.param();
    const { decisionId } = c.req.valid('json');

    const event = await db.query.ceoInboxEvents.findFirst({
      where: eq(ceoInboxEvents.id, eventId),
    });

    if (!event) {
      throw new HTTPException(404, { message: 'Event not found' });
    }

    await verifyCompanyAccess(userId, event.companyId);

    if (!event.requiresDecision) {
      throw new HTTPException(400, { message: 'Event does not require a decision' });
    }

    type DecisionOption = {
      id: string;
      label: string;
      description?: string;
      action: string;
      params?: Record<string, unknown>;
      isRecommended?: boolean;
    };

    const options = event.decisionOptions as DecisionOption[] | null;
    const selectedOption = options?.find(o => o.id === decisionId);

    if (!selectedOption) {
      throw new HTTPException(400, { message: 'Invalid decision option' });
    }

    // Update event
    await db
      .update(ceoInboxEvents)
      .set({
        status: 'action_taken',
        decisionMade: decisionId,
        decisionMadeAt: new Date(),
        decisionMadeBy: userId,
        actionTakenAt: new Date(),
      })
      .where(eq(ceoInboxEvents.id, eventId));

    // TODO: Execute the action based on selectedOption.action

    return c.json({
      message: 'Decision recorded',
      decision: selectedOption,
    });
  }
);

// Dismiss event
inboxRouter.patch('/:eventId/dismiss', async (c) => {
  const { userId } = c.get('user');
  const { eventId } = c.req.param();

  const event = await db.query.ceoInboxEvents.findFirst({
    where: eq(ceoInboxEvents.id, eventId),
  });

  if (!event) {
    throw new HTTPException(404, { message: 'Event not found' });
  }

  await verifyCompanyAccess(userId, event.companyId);

  await db
    .update(ceoInboxEvents)
    .set({
      status: 'dismissed',
      actionTakenAt: new Date(),
    })
    .where(eq(ceoInboxEvents.id, eventId));

  return c.json({ message: 'Event dismissed' });
});

export default inboxRouter;
