/**
 * Strategy Horizon API Routes
 *
 * Endpoints for managing multi-level strategic planning:
 * - Quarterly Vision (Long-term)
 * - Weekly Goals (Mid-term)
 * - Daily Strategy (Short-term)
 *
 * Also includes event trigger management.
 */

import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { eq, and, desc, gte, lte, type InferInsertModel } from 'drizzle-orm';
import { db } from '../lib/db';
import {
  strategyHorizons,
  eventTriggers,
  eventTriggerHistory,
  strategyAlignment,
  companies,
  companyState,
} from '@1person/core/db';

type NewStrategyHorizon = InferInsertModel<typeof strategyHorizons>;
import { authMiddleware } from '../middleware/auth';
import { HTTPException } from 'hono/http-exception';

const strategyRouter = new Hono();

// Apply auth to all routes
strategyRouter.use('*', authMiddleware);

// ==================== SCHEMAS ====================

const horizonEnum = z.enum(['quarterly', 'weekly', 'daily']);

const objectiveSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string(),
  keyResults: z.array(z.object({
    id: z.string(),
    metric: z.string(),
    target: z.number(),
    current: z.number(),
    unit: z.string(),
  })),
  progress: z.number().min(0).max(100),
  status: z.enum(['on_track', 'at_risk', 'behind', 'completed']),
});

const prioritySchema = z.object({
  rank: z.number(),
  title: z.string(),
  description: z.string(),
  category: z.enum(['growth', 'efficiency', 'innovation', 'risk', 'quality']),
  effort: z.enum(['low', 'medium', 'high']),
  impact: z.enum(['low', 'medium', 'high']),
});

const createStrategySchema = z.object({
  horizon: horizonEnum,
  vision: z.string().optional(),
  mission: z.string().optional(),
  theme: z.string().optional(),
  objectives: z.array(objectiveSchema).optional(),
  priorities: z.array(prioritySchema).optional(),
  resourceAllocation: z.object({
    budget: z.object({
      total: z.number(),
      allocated: z.number(),
      byCategory: z.record(z.number()),
    }).optional(),
    agents: z.object({
      total: z.number(),
      byDepartment: z.record(z.number()),
      byRole: z.record(z.number()),
    }).optional(),
    focus: z.record(z.number()).optional(),
  }).optional(),
  constraints: z.object({
    budgetLimit: z.number().optional(),
    maxAgents: z.number().optional(),
    mustComplete: z.array(z.string()).optional(),
    mustAvoid: z.array(z.string()).optional(),
    dependencies: z.array(z.string()).optional(),
  }).optional(),
});

const updateProgressSchema = z.object({
  progress: z.number().min(0).max(100),
  objectives: z.array(z.object({
    id: z.string(),
    progress: z.number().min(0).max(100),
    status: z.enum(['on_track', 'at_risk', 'behind', 'completed']).optional(),
  })).optional(),
});

const createTriggerSchema = z.object({
  name: z.string().min(2),
  description: z.string().optional(),
  triggerType: z.enum([
    'health_threshold',
    'budget_threshold',
    'task_failure_rate',
    'agent_performance',
    'milestone_achieved',
    'deadline_approaching',
    'external_event',
    'schedule',
    'state_change',
  ]),
  conditions: z.object({
    metric: z.string().optional(),
    operator: z.enum(['gt', 'gte', 'lt', 'lte', 'eq', 'neq']).optional(),
    threshold: z.number().optional(),
    schedule: z.string().optional(),
    timeWindow: z.number().optional(),
    stateField: z.string().optional(),
    stateValue: z.unknown().optional(),
  }),
  actions: z.array(z.object({
    type: z.enum([
      'ceo_reasoning_loop',
      'notify_user',
      'create_task',
      'send_message',
      'adjust_priority',
      'pause_operations',
    ]),
    params: z.record(z.unknown()),
    priority: z.enum(['critical', 'high', 'normal', 'low']),
  })),
  cooldownMinutes: z.number().optional(),
  maxTriggersPerDay: z.number().optional(),
});

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

// ==================== STRATEGY HORIZON ROUTES ====================

// Get all strategies for a company
strategyRouter.get('/company/:companyId', async (c) => {
  const { userId } = c.get('user');
  const { companyId } = c.req.param();

  await verifyCompanyAccess(userId, companyId);

  const strategies = await db.query.strategyHorizons.findMany({
    where: eq(strategyHorizons.companyId, companyId),
    orderBy: [desc(strategyHorizons.createdAt)],
  });

  return c.json({ data: strategies });
});

// Get active strategies (quarterly, weekly, daily)
strategyRouter.get('/company/:companyId/active', async (c) => {
  const { userId } = c.get('user');
  const { companyId } = c.req.param();

  await verifyCompanyAccess(userId, companyId);

  const now = new Date();

  const [quarterly, weekly, daily] = await Promise.all([
    db.query.strategyHorizons.findFirst({
      where: and(
        eq(strategyHorizons.companyId, companyId),
        eq(strategyHorizons.horizon, 'quarterly'),
        eq(strategyHorizons.status, 'active'),
        lte(strategyHorizons.periodStart, now),
        gte(strategyHorizons.periodEnd, now)
      ),
    }),
    db.query.strategyHorizons.findFirst({
      where: and(
        eq(strategyHorizons.companyId, companyId),
        eq(strategyHorizons.horizon, 'weekly'),
        eq(strategyHorizons.status, 'active'),
        lte(strategyHorizons.periodStart, now),
        gte(strategyHorizons.periodEnd, now)
      ),
    }),
    db.query.strategyHorizons.findFirst({
      where: and(
        eq(strategyHorizons.companyId, companyId),
        eq(strategyHorizons.horizon, 'daily'),
        eq(strategyHorizons.status, 'active'),
        lte(strategyHorizons.periodStart, now),
        gte(strategyHorizons.periodEnd, now)
      ),
    }),
  ]);

  // Get latest alignment
  const alignment = await db.query.strategyAlignment.findFirst({
    where: eq(strategyAlignment.companyId, companyId),
    orderBy: [desc(strategyAlignment.computedAt)],
  });

  return c.json({
    data: {
      quarterly,
      weekly,
      daily,
      alignment: alignment ? {
        score: alignment.overallAlignmentScore,
        quarterlyToWeekly: alignment.quarterlyToWeeklyScore,
        weeklyToDaily: alignment.weeklyToDailyScore,
        issues: alignment.alignmentIssues,
        computedAt: alignment.computedAt,
      } : null,
    },
  });
});

// Create or update strategy
strategyRouter.post(
  '/company/:companyId',
  zValidator('json', createStrategySchema),
  async (c) => {
    const { userId } = c.get('user');
    const { companyId } = c.req.param();
    const data = c.req.valid('json');

    await verifyCompanyAccess(userId, companyId);

    const now = new Date();

    // Calculate period boundaries
    let periodStart = new Date(now);
    let periodEnd = new Date(now);

    switch (data.horizon) {
      case 'quarterly':
        const quarter = Math.floor(now.getMonth() / 3);
        periodStart.setMonth(quarter * 3, 1);
        periodStart.setHours(0, 0, 0, 0);
        periodEnd.setMonth(quarter * 3 + 3, 0);
        periodEnd.setHours(23, 59, 59, 999);
        break;
      case 'weekly':
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

    // Mark existing active strategy as revised
    await db
      .update(strategyHorizons)
      .set({ status: 'revised', updatedAt: now })
      .where(
        and(
          eq(strategyHorizons.companyId, companyId),
          eq(strategyHorizons.horizon, data.horizon),
          eq(strategyHorizons.status, 'active')
        )
      );

    // Get parent horizon
    let parentHorizonId: string | undefined;
    if (data.horizon === 'weekly') {
      const quarterly = await db.query.strategyHorizons.findFirst({
        where: and(
          eq(strategyHorizons.companyId, companyId),
          eq(strategyHorizons.horizon, 'quarterly'),
          eq(strategyHorizons.status, 'active')
        ),
      });
      parentHorizonId = quarterly?.id;
    } else if (data.horizon === 'daily') {
      const weekly = await db.query.strategyHorizons.findFirst({
        where: and(
          eq(strategyHorizons.companyId, companyId),
          eq(strategyHorizons.horizon, 'weekly'),
          eq(strategyHorizons.status, 'active')
        ),
      });
      parentHorizonId = weekly?.id;
    }

    // Create new strategy
    const insertValues: NewStrategyHorizon = {
      companyId,
      horizon: data.horizon,
      status: 'active',
      periodStart,
      periodEnd,
      parentHorizonId,
      vision: data.vision,
      mission: data.mission,
      theme: data.theme,
      objectives: data.objectives as NewStrategyHorizon['objectives'],
      priorities: data.priorities as NewStrategyHorizon['priorities'],
      resourceAllocation: data.resourceAllocation as NewStrategyHorizon['resourceAllocation'],
      constraints: data.constraints as NewStrategyHorizon['constraints'],
      overallProgress: 0,
      healthScore: 100,
      createdBy: 'user',
      approvedBy: null,
      approvedAt: null,
    };

    const [strategy] = await db
      .insert(strategyHorizons)
      .values(insertValues)
      .returning();

    return c.json({ data: strategy }, 201);
  }
);

// Update strategy progress
strategyRouter.patch(
  '/:strategyId/progress',
  zValidator('json', updateProgressSchema),
  async (c) => {
    const { userId } = c.get('user');
    const { strategyId } = c.req.param();
    const data = c.req.valid('json');

    // Get strategy
    const strategy = await db.query.strategyHorizons.findFirst({
      where: eq(strategyHorizons.id, strategyId),
    });

    if (!strategy) {
      throw new HTTPException(404, { message: 'Strategy not found' });
    }

    await verifyCompanyAccess(userId, strategy.companyId);

    // Update objectives if provided
    type ObjectiveKR = {
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
    };

    let updatedObjectives = strategy.objectives as Array<ObjectiveKR> | null;

    if (data.objectives && updatedObjectives) {
      updatedObjectives = updatedObjectives.map(obj => {
        const update = data.objectives?.find(u => u.id === obj.id);
        if (update) {
          return {
            ...obj,
            progress: update.progress,
            status: (update.status || obj.status) as ObjectiveKR['status'],
          };
        }
        return obj;
      });
    }

    // Update strategy
    const [updated] = await db
      .update(strategyHorizons)
      .set({
        overallProgress: data.progress,
        objectives: updatedObjectives as Array<ObjectiveKR> | null,
        updatedAt: new Date(),
      })
      .where(eq(strategyHorizons.id, strategyId))
      .returning();

    return c.json({ data: updated });
  }
);

// Generate AI strategy
strategyRouter.post('/company/:companyId/generate', async (c) => {
  const { userId } = c.get('user');
  const { companyId } = c.req.param();
  const body = await c.req.json();
  const horizon = body.horizon as 'quarterly' | 'weekly' | 'daily';

  await verifyCompanyAccess(userId, companyId);

  // This would call the worker service to generate strategy
  // For now, return a placeholder
  return c.json({
    message: `Strategy generation for ${horizon} has been queued`,
    status: 'pending',
  });
});

// ==================== EVENT TRIGGER ROUTES ====================

// Get all triggers for a company
strategyRouter.get('/company/:companyId/triggers', async (c) => {
  const { userId } = c.get('user');
  const { companyId } = c.req.param();

  await verifyCompanyAccess(userId, companyId);

  const triggers = await db.query.eventTriggers.findMany({
    where: eq(eventTriggers.companyId, companyId),
    orderBy: [desc(eventTriggers.createdAt)],
  });

  return c.json({ data: triggers });
});

// Create trigger
strategyRouter.post(
  '/company/:companyId/triggers',
  zValidator('json', createTriggerSchema),
  async (c) => {
    const { userId } = c.get('user');
    const { companyId } = c.req.param();
    const data = c.req.valid('json');

    await verifyCompanyAccess(userId, companyId);

    const [trigger] = await db
      .insert(eventTriggers)
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

    return c.json({ data: trigger }, 201);
  }
);

// Update trigger
strategyRouter.patch('/triggers/:triggerId', async (c) => {
  const { userId } = c.get('user');
  const { triggerId } = c.req.param();
  const body = await c.req.json();

  const trigger = await db.query.eventTriggers.findFirst({
    where: eq(eventTriggers.id, triggerId),
  });

  if (!trigger) {
    throw new HTTPException(404, { message: 'Trigger not found' });
  }

  await verifyCompanyAccess(userId, trigger.companyId);

  const [updated] = await db
    .update(eventTriggers)
    .set({
      ...body,
      updatedAt: new Date(),
    })
    .where(eq(eventTriggers.id, triggerId))
    .returning();

  return c.json({ data: updated });
});

// Enable/disable trigger
strategyRouter.patch('/triggers/:triggerId/toggle', async (c) => {
  const { userId } = c.get('user');
  const { triggerId } = c.req.param();

  const trigger = await db.query.eventTriggers.findFirst({
    where: eq(eventTriggers.id, triggerId),
  });

  if (!trigger) {
    throw new HTTPException(404, { message: 'Trigger not found' });
  }

  await verifyCompanyAccess(userId, trigger.companyId);

  const [updated] = await db
    .update(eventTriggers)
    .set({
      enabled: trigger.enabled ? 0 : 1,
      updatedAt: new Date(),
    })
    .where(eq(eventTriggers.id, triggerId))
    .returning();

  return c.json({ data: updated });
});

// Delete trigger
strategyRouter.delete('/triggers/:triggerId', async (c) => {
  const { userId } = c.get('user');
  const { triggerId } = c.req.param();

  const trigger = await db.query.eventTriggers.findFirst({
    where: eq(eventTriggers.id, triggerId),
  });

  if (!trigger) {
    throw new HTTPException(404, { message: 'Trigger not found' });
  }

  await verifyCompanyAccess(userId, trigger.companyId);

  await db.delete(eventTriggers).where(eq(eventTriggers.id, triggerId));

  return c.json({ message: 'Trigger deleted' });
});

// Get trigger history
strategyRouter.get('/triggers/:triggerId/history', async (c) => {
  const { userId } = c.get('user');
  const { triggerId } = c.req.param();
  const limit = parseInt(c.req.query('limit') || '50');

  const trigger = await db.query.eventTriggers.findFirst({
    where: eq(eventTriggers.id, triggerId),
  });

  if (!trigger) {
    throw new HTTPException(404, { message: 'Trigger not found' });
  }

  await verifyCompanyAccess(userId, trigger.companyId);

  const history = await db.query.eventTriggerHistory.findMany({
    where: eq(eventTriggerHistory.triggerId, triggerId),
    orderBy: [desc(eventTriggerHistory.triggeredAt)],
    limit,
  });

  return c.json({ data: history });
});

// Get company trigger history
strategyRouter.get('/company/:companyId/triggers/history', async (c) => {
  const { userId } = c.get('user');
  const { companyId } = c.req.param();
  const limit = parseInt(c.req.query('limit') || '50');

  await verifyCompanyAccess(userId, companyId);

  const history = await db.query.eventTriggerHistory.findMany({
    where: eq(eventTriggerHistory.companyId, companyId),
    orderBy: [desc(eventTriggerHistory.triggeredAt)],
    limit,
  });

  return c.json({ data: history });
});

// Create default triggers
strategyRouter.post('/company/:companyId/triggers/defaults', async (c) => {
  const { userId } = c.get('user');
  const { companyId } = c.req.param();

  await verifyCompanyAccess(userId, companyId);

  // Check if triggers already exist
  const existing = await db.query.eventTriggers.findFirst({
    where: eq(eventTriggers.companyId, companyId),
  });

  if (existing) {
    throw new HTTPException(400, { message: 'Triggers already exist for this company' });
  }

  // Create default triggers
  const defaultTriggers = [
    {
      name: 'Critical Health Alert',
      description: 'Triggers when company health score drops below 50',
      triggerType: 'health_threshold' as const,
      conditions: { metric: 'healthScore', operator: 'lt' as const, threshold: 50 },
      actions: [
        { type: 'ceo_reasoning_loop' as const, params: { urgency: 'critical' }, priority: 'critical' as const },
        { type: 'notify_user' as const, params: {}, priority: 'critical' as const },
      ],
    },
    {
      name: 'Budget Warning',
      description: 'Triggers when budget utilization exceeds 80%',
      triggerType: 'budget_threshold' as const,
      conditions: { metric: 'budgetState.utilization', operator: 'gt' as const, threshold: 80 },
      actions: [
        { type: 'notify_user' as const, params: {}, priority: 'high' as const },
        { type: 'ceo_reasoning_loop' as const, params: { focus: 'budget' }, priority: 'high' as const },
      ],
    },
    {
      name: 'High Task Failure Rate',
      description: 'Triggers when task failure rate exceeds 30%',
      triggerType: 'task_failure_rate' as const,
      conditions: { metric: 'taskState.failureRate', operator: 'gt' as const, threshold: 30 },
      actions: [
        { type: 'ceo_reasoning_loop' as const, params: { focus: 'task_quality' }, priority: 'high' as const },
      ],
    },
  ];

  const created = await db
    .insert(eventTriggers)
    .values(
      defaultTriggers.map(t => ({
        companyId,
        ...t,
        cooldownMinutes: 60,
        maxTriggersPerDay: 5,
        enabled: 1,
      }))
    )
    .returning();

  return c.json({ data: created }, 201);
});

// ==================== TIMELINE VIEW ====================

// Get strategy timeline (calendar/gantt view data)
strategyRouter.get('/company/:companyId/timeline', async (c) => {
  const { userId } = c.get('user');
  const { companyId } = c.req.param();
  const startStr = c.req.query('start');
  const endStr = c.req.query('end');

  await verifyCompanyAccess(userId, companyId);

  const start = startStr ? new Date(startStr) : (() => {
    const d = new Date();
    d.setMonth(d.getMonth() - 3);
    return d;
  })();

  const end = endStr ? new Date(endStr) : (() => {
    const d = new Date();
    d.setMonth(d.getMonth() + 3);
    return d;
  })();

  const strategies = await db.query.strategyHorizons.findMany({
    where: and(
      eq(strategyHorizons.companyId, companyId),
      gte(strategyHorizons.periodEnd, start),
      lte(strategyHorizons.periodStart, end)
    ),
    orderBy: [strategyHorizons.periodStart],
  });

  // Group by horizon
  const quarterly = strategies.filter(s => s.horizon === 'quarterly');
  const weekly = strategies.filter(s => s.horizon === 'weekly');
  const daily = strategies.filter(s => s.horizon === 'daily');

  return c.json({
    data: {
      range: { start, end },
      quarterly: quarterly.map(s => ({
        id: s.id,
        theme: s.theme,
        vision: s.vision,
        status: s.status,
        progress: s.overallProgress,
        healthScore: s.healthScore,
        start: s.periodStart,
        end: s.periodEnd,
        objectives: s.objectives,
      })),
      weekly: weekly.map(s => ({
        id: s.id,
        theme: s.theme,
        status: s.status,
        progress: s.overallProgress,
        healthScore: s.healthScore,
        start: s.periodStart,
        end: s.periodEnd,
        parentHorizonId: s.parentHorizonId,
        priorities: s.priorities,
      })),
      daily: daily.map(s => ({
        id: s.id,
        theme: s.theme,
        status: s.status,
        progress: s.overallProgress,
        healthScore: s.healthScore,
        start: s.periodStart,
        end: s.periodEnd,
        parentHorizonId: s.parentHorizonId,
        priorities: s.priorities,
      })),
    },
  });
});

// Get strategy details by ID
strategyRouter.get('/:strategyId', async (c) => {
  const { userId } = c.get('user');
  const { strategyId } = c.req.param();

  const strategy = await db.query.strategyHorizons.findFirst({
    where: eq(strategyHorizons.id, strategyId),
  });

  if (!strategy) {
    throw new HTTPException(404, { message: 'Strategy not found' });
  }

  await verifyCompanyAccess(userId, strategy.companyId);

  // Get child horizons if this is quarterly or weekly
  let childHorizons: typeof strategy[] = [];
  if (strategy.horizon === 'quarterly' || strategy.horizon === 'weekly') {
    childHorizons = await db.query.strategyHorizons.findMany({
      where: eq(strategyHorizons.parentHorizonId, strategyId),
      orderBy: [strategyHorizons.periodStart],
    });
  }

  return c.json({
    data: {
      ...strategy,
      childHorizons,
    }
  });
});

// ==================== RISK ASSESSMENT ROUTES ====================

// Get latest risk assessment for a company
strategyRouter.get('/company/:companyId/risks', async (c) => {
  const { userId } = c.get('user');
  const { companyId } = c.req.param();

  await verifyCompanyAccess(userId, companyId);

  const state = await db.query.companyState.findFirst({
    where: eq(companyState.companyId, companyId),
  });

  if (!state?.riskAssessment) {
    return c.json({ data: null });
  }

  return c.json({ data: state.riskAssessment });
});

export default strategyRouter;
