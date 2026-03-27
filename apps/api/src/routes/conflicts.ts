import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import { agentConflicts, conflictResolutionRules, conflictEvents, agents } from '@1person/core/db';
import { db } from '../lib/db';
import { eq, desc, and, inArray, sql, isNull } from 'drizzle-orm';
import { authMiddleware } from '../middleware/auth';

const conflictsRouter = new Hono();

// Auth middleware
conflictsRouter.use('*', authMiddleware);

// Get all conflicts for a company
conflictsRouter.get('/company/:companyId', async (c) => {
  const companyId = c.req.param('companyId');
  const status = c.req.query('status');
  const severity = c.req.query('severity');
  const type = c.req.query('type');
  const limit = parseInt(c.req.query('limit') || '50');
  const offset = parseInt(c.req.query('offset') || '0');

  const conditions = [eq(agentConflicts.companyId, companyId)];

  if (status) {
    conditions.push(eq(agentConflicts.status, status as any));
  }
  if (severity) {
    conditions.push(eq(agentConflicts.severity, severity as any));
  }
  if (type) {
    conditions.push(eq(agentConflicts.conflictType, type as any));
  }

  const conflicts = await db
    .select()
    .from(agentConflicts)
    .where(and(...conditions))
    .orderBy(desc(agentConflicts.detectedAt))
    .limit(limit)
    .offset(offset);

  // Get total count
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(agentConflicts)
    .where(and(...conditions));

  // Enrich with agent info
  const agentIds = [...new Set(conflicts.flatMap((c) => c.involvedAgentIds))];
  const involvedAgents = agentIds.length > 0
    ? await db
        .select({ id: agents.id, name: agents.name, role: agents.role, color: agents.color })
        .from(agents)
        .where(inArray(agents.id, agentIds))
    : [];

  const agentMap = new Map(involvedAgents.map((a) => [a.id, a]));

  const enrichedConflicts = conflicts.map((conflict) => ({
    ...conflict,
    involvedAgents: conflict.involvedAgentIds.map((id) => agentMap.get(id)).filter(Boolean),
  }));

  return c.json({
    data: enrichedConflicts,
    total: count,
    limit,
    offset,
  });
});

// Get conflict statistics
conflictsRouter.get('/company/:companyId/stats', async (c) => {
  const companyId = c.req.param('companyId');

  // Count by status
  const statusCounts = await db
    .select({
      status: agentConflicts.status,
      count: sql<number>`count(*)::int`,
    })
    .from(agentConflicts)
    .where(eq(agentConflicts.companyId, companyId))
    .groupBy(agentConflicts.status);

  // Count by severity (active only)
  const severityCounts = await db
    .select({
      severity: agentConflicts.severity,
      count: sql<number>`count(*)::int`,
    })
    .from(agentConflicts)
    .where(
      and(
        eq(agentConflicts.companyId, companyId),
        inArray(agentConflicts.status, ['detected', 'acknowledged', 'investigating', 'escalated', 'awaiting_input'])
      )
    )
    .groupBy(agentConflicts.severity);

  // Count by type (active only)
  const typeCounts = await db
    .select({
      type: agentConflicts.conflictType,
      count: sql<number>`count(*)::int`,
    })
    .from(agentConflicts)
    .where(
      and(
        eq(agentConflicts.companyId, companyId),
        inArray(agentConflicts.status, ['detected', 'acknowledged', 'investigating', 'escalated', 'awaiting_input'])
      )
    )
    .groupBy(agentConflicts.conflictType);

  // Recent activity
  const recentCount = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(agentConflicts)
    .where(
      and(
        eq(agentConflicts.companyId, companyId),
        sql`${agentConflicts.detectedAt} > now() - interval '24 hours'`
      )
    );

  // Average resolution time
  const avgResolution = await db
    .select({
      avgMinutes: sql<number>`
        avg(extract(epoch from (${agentConflicts.resolvedAt} - ${agentConflicts.detectedAt})) / 60)::int
      `,
    })
    .from(agentConflicts)
    .where(
      and(
        eq(agentConflicts.companyId, companyId),
        sql`${agentConflicts.resolvedAt} is not null`,
        sql`${agentConflicts.detectedAt} > now() - interval '30 days'`
      )
    );

  return c.json({
    data: {
      byStatus: Object.fromEntries(statusCounts.map((s) => [s.status, s.count])),
      bySeverity: Object.fromEntries(severityCounts.map((s) => [s.severity, s.count])),
      byType: Object.fromEntries(typeCounts.map((t) => [t.type, t.count])),
      recentCount24h: recentCount[0]?.count || 0,
      avgResolutionMinutes: avgResolution[0]?.avgMinutes || null,
      activeCount: severityCounts.reduce((sum, s) => sum + s.count, 0),
    },
  });
});

// Get single conflict with full details
conflictsRouter.get('/:conflictId', async (c) => {
  const conflictId = c.req.param('conflictId');

  const [conflict] = await db
    .select()
    .from(agentConflicts)
    .where(eq(agentConflicts.id, conflictId));

  if (!conflict) {
    return c.json({ error: { code: 'NOT_FOUND', message: 'Conflict not found' } }, 404);
  }

  // Get involved agents
  const involvedAgents = await db
    .select({ id: agents.id, name: agents.name, role: agents.role, color: agents.color, avatar: agents.avatar })
    .from(agents)
    .where(inArray(agents.id, conflict.involvedAgentIds));

  // Get events/history
  const events = await db
    .select()
    .from(conflictEvents)
    .where(eq(conflictEvents.conflictId, conflictId))
    .orderBy(desc(conflictEvents.createdAt))
    .limit(50);

  return c.json({
    data: {
      ...conflict,
      involvedAgents,
      events,
    },
  });
});

// Create a new conflict (usually called by the system)
conflictsRouter.post(
  '/company/:companyId',
  zValidator(
    'json',
    z.object({
      conflictType: z.enum([
        'resource', 'task', 'budget', 'priority', 'data', 'schedule', 'dependency', 'authority',
      ]),
      severity: z.enum(['critical', 'high', 'medium', 'low']).optional(),
      title: z.string().min(1),
      description: z.string().optional(),
      involvedAgentIds: z.array(z.string().uuid()).min(2),
      resourceType: z.string().optional(),
      resourceId: z.string().optional(),
      taskIds: z.array(z.string().uuid()).optional(),
      conflictDetails: z.any().optional(),
      metadata: z.record(z.unknown()).optional(),
    })
  ),
  async (c) => {
    const companyId = c.req.param('companyId');
    const data = c.req.valid('json');

    const [conflict] = await db
      .insert(agentConflicts)
      .values({
        companyId,
        ...data,
      })
      .returning();

    // Create initial event
    await db.insert(conflictEvents).values({
      conflictId: conflict.id,
      eventType: 'detected',
      actorType: 'system',
      description: `Conflict detected: ${conflict.title}`,
      data: {
        severity: conflict.severity,
        type: conflict.conflictType,
        involvedAgents: conflict.involvedAgentIds.length,
      },
    });

    return c.json({ data: conflict }, 201);
  }
);

// Update conflict status
conflictsRouter.patch(
  '/:conflictId/status',
  zValidator(
    'json',
    z.object({
      status: z.enum([
        'detected', 'acknowledged', 'investigating', 'escalated', 'awaiting_input', 'resolved', 'dismissed', 'auto_resolved',
      ]),
      comment: z.string().optional(),
    })
  ),
  async (c) => {
    const conflictId = c.req.param('conflictId');
    const { status, comment } = c.req.valid('json');
    const userId = c.get('userId');

    const updateData: Record<string, unknown> = {
      status,
      updatedAt: new Date(),
    };

    if (status === 'acknowledged') {
      updateData.acknowledgedAt = new Date();
      updateData.acknowledgedBy = userId;
    }

    if (status === 'resolved' || status === 'dismissed' || status === 'auto_resolved') {
      updateData.resolvedAt = new Date();
      updateData.resolvedBy = userId || 'user';
    }

    const [conflict] = await db
      .update(agentConflicts)
      .set(updateData)
      .where(eq(agentConflicts.id, conflictId))
      .returning();

    if (!conflict) {
      return c.json({ error: { code: 'NOT_FOUND', message: 'Conflict not found' } }, 404);
    }

    // Create event
    await db.insert(conflictEvents).values({
      conflictId,
      eventType: `status_changed_to_${status}`,
      actorType: 'user',
      actorId: userId,
      description: comment || `Status changed to ${status}`,
      data: { previousStatus: conflict.status, newStatus: status },
    });

    return c.json({ data: conflict });
  }
);

// Resolve a conflict
conflictsRouter.post(
  '/:conflictId/resolve',
  zValidator(
    'json',
    z.object({
      strategy: z.enum([
        'priority_based', 'first_come', 'round_robin', 'quota_based', 'human_decision', 'ceo_decision', 'negotiation', 'merge', 'defer', 'cancel',
      ]),
      resolution: z.object({
        action: z.string(),
        winner: z.string().optional(),
        details: z.string(),
        compensations: z.array(z.object({
          agentId: z.string(),
          action: z.string(),
        })).optional(),
      }),
    })
  ),
  async (c) => {
    const conflictId = c.req.param('conflictId');
    const { strategy, resolution } = c.req.valid('json');
    const userId = c.get('userId');

    const [conflict] = await db
      .update(agentConflicts)
      .set({
        status: 'resolved',
        resolutionStrategy: strategy,
        resolution,
        resolvedBy: userId,
        resolvedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(agentConflicts.id, conflictId))
      .returning();

    if (!conflict) {
      return c.json({ error: { code: 'NOT_FOUND', message: 'Conflict not found' } }, 404);
    }

    // Create event
    await db.insert(conflictEvents).values({
      conflictId,
      eventType: 'resolved',
      actorType: 'user',
      actorId: userId,
      description: `Conflict resolved using ${strategy} strategy: ${resolution.details}`,
      data: { strategy, resolution },
    });

    return c.json({ data: conflict });
  }
);

// Escalate a conflict
conflictsRouter.post(
  '/:conflictId/escalate',
  zValidator(
    'json',
    z.object({
      reason: z.string(),
      escalateTo: z.enum(['ceo', 'human']).optional(),
    })
  ),
  async (c) => {
    const conflictId = c.req.param('conflictId');
    const { reason, escalateTo } = c.req.valid('json');
    const userId = c.get('userId');

    // Get current conflict
    const [current] = await db
      .select()
      .from(agentConflicts)
      .where(eq(agentConflicts.id, conflictId));

    if (!current) {
      return c.json({ error: { code: 'NOT_FOUND', message: 'Conflict not found' } }, 404);
    }

    const newLevel = (current.escalationLevel || 0) + 1;

    const [conflict] = await db
      .update(agentConflicts)
      .set({
        status: 'escalated',
        escalationLevel: newLevel,
        escalatedAt: new Date(),
        escalationReason: reason,
        updatedAt: new Date(),
      })
      .where(eq(agentConflicts.id, conflictId))
      .returning();

    // Create event
    await db.insert(conflictEvents).values({
      conflictId,
      eventType: 'escalated',
      actorType: userId ? 'user' : 'system',
      actorId: userId,
      description: `Escalated to level ${newLevel}${escalateTo ? ` (${escalateTo})` : ''}: ${reason}`,
      data: { level: newLevel, escalateTo, reason },
    });

    return c.json({ data: conflict });
  }
);

// Add comment to conflict
conflictsRouter.post(
  '/:conflictId/comments',
  zValidator(
    'json',
    z.object({
      comment: z.string().min(1),
    })
  ),
  async (c) => {
    const conflictId = c.req.param('conflictId');
    const { comment } = c.req.valid('json');
    const userId = c.get('userId');

    // Verify conflict exists
    const [conflict] = await db
      .select({ id: agentConflicts.id })
      .from(agentConflicts)
      .where(eq(agentConflicts.id, conflictId));

    if (!conflict) {
      return c.json({ error: { code: 'NOT_FOUND', message: 'Conflict not found' } }, 404);
    }

    // Create comment event
    const [event] = await db
      .insert(conflictEvents)
      .values({
        conflictId,
        eventType: 'comment',
        actorType: 'user',
        actorId: userId,
        description: comment,
      })
      .returning();

    return c.json({ data: event }, 201);
  }
);

// Get resolution rules for a company
conflictsRouter.get('/company/:companyId/rules', async (c) => {
  const companyId = c.req.param('companyId');

  const rules = await db
    .select()
    .from(conflictResolutionRules)
    .where(eq(conflictResolutionRules.companyId, companyId))
    .orderBy(desc(conflictResolutionRules.priority));

  return c.json({ data: rules });
});

// Create resolution rule
conflictsRouter.post(
  '/company/:companyId/rules',
  zValidator(
    'json',
    z.object({
      name: z.string().min(1),
      description: z.string().optional(),
      enabled: z.boolean().optional(),
      priority: z.number().optional(),
      conflictTypes: z.array(z.string()).optional(),
      severities: z.array(z.string()).optional(),
      agentRoles: z.array(z.string()).optional(),
      resourceTypes: z.array(z.string()).optional(),
      strategy: z.enum([
        'priority_based', 'first_come', 'round_robin', 'quota_based', 'human_decision', 'ceo_decision', 'negotiation', 'merge', 'defer', 'cancel',
      ]),
      autoResolve: z.boolean().optional(),
      escalateAfterMinutes: z.number().optional(),
      escalateTo: z.string().optional(),
    })
  ),
  async (c) => {
    const companyId = c.req.param('companyId');
    const data = c.req.valid('json');

    const [rule] = await db
      .insert(conflictResolutionRules)
      .values({
        companyId,
        ...data,
      } as any)
      .returning();

    return c.json({ data: rule }, 201);
  }
);

// Update resolution rule
conflictsRouter.patch(
  '/rules/:ruleId',
  zValidator(
    'json',
    z.object({
      name: z.string().min(1).optional(),
      description: z.string().optional(),
      enabled: z.boolean().optional(),
      priority: z.number().optional(),
      strategy: z.enum([
        'priority_based', 'first_come', 'round_robin', 'quota_based', 'human_decision', 'ceo_decision', 'negotiation', 'merge', 'defer', 'cancel',
      ]).optional(),
      autoResolve: z.boolean().optional(),
      escalateAfterMinutes: z.number().optional(),
    })
  ),
  async (c) => {
    const ruleId = c.req.param('ruleId');
    const data = c.req.valid('json');

    const [rule] = await db
      .update(conflictResolutionRules)
      .set({
        ...data,
        updatedAt: new Date(),
      })
      .where(eq(conflictResolutionRules.id, ruleId))
      .returning();

    if (!rule) {
      return c.json({ error: { code: 'NOT_FOUND', message: 'Rule not found' } }, 404);
    }

    return c.json({ data: rule });
  }
);

// Delete resolution rule
conflictsRouter.delete('/rules/:ruleId', async (c) => {
  const ruleId = c.req.param('ruleId');

  await db.delete(conflictResolutionRules).where(eq(conflictResolutionRules.id, ruleId));

  return c.json({ success: true });
});

// Create default resolution rules for a company
conflictsRouter.post('/company/:companyId/rules/defaults', async (c) => {
  const companyId = c.req.param('companyId');

  const defaultRules = [
    {
      name: 'Critical Resource Auto-Escalate',
      description: 'Immediately escalate critical resource conflicts to human',
      priority: 100,
      conflictTypes: ['resource'] as any,
      severities: ['critical'] as any,
      strategy: 'human_decision' as const,
      autoResolve: false,
      escalateAfterMinutes: 5,
      escalateTo: 'human',
    },
    {
      name: 'Task Priority Resolution',
      description: 'Resolve task conflicts based on task priority',
      priority: 80,
      conflictTypes: ['task'] as any,
      strategy: 'priority_based' as const,
      autoResolve: true,
    },
    {
      name: 'Budget Quota Resolution',
      description: 'Resolve budget conflicts based on agent quotas',
      priority: 70,
      conflictTypes: ['budget'] as any,
      strategy: 'quota_based' as const,
      autoResolve: true,
    },
    {
      name: 'Schedule First-Come Resolution',
      description: 'Resolve scheduling conflicts on first-come basis',
      priority: 60,
      conflictTypes: ['schedule'] as any,
      strategy: 'first_come' as const,
      autoResolve: true,
    },
    {
      name: 'Default CEO Decision',
      description: 'Escalate unresolved conflicts to CEO agent',
      priority: 10,
      strategy: 'ceo_decision' as const,
      autoResolve: false,
      escalateAfterMinutes: 30,
      escalateTo: 'ceo',
    },
  ];

  const rules = await db
    .insert(conflictResolutionRules)
    .values(defaultRules.map((rule) => ({ ...rule, companyId })))
    .returning();

  return c.json({ data: rules }, 201);
});

export default conflictsRouter;
