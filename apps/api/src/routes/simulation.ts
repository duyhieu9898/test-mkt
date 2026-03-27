import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import { simulations, simulationSnapshots, simulationTemplates } from '@1person/core/db';
import { db } from '../lib/db';
import { eq, desc, and, sql, inArray, isNull, or } from 'drizzle-orm';
import { authMiddleware } from '../middleware/auth';

const simulationRouter = new Hono();

// Auth middleware
simulationRouter.use('*', authMiddleware);

// Get all simulations for a company
simulationRouter.get('/company/:companyId', async (c) => {
  const companyId = c.req.param('companyId');
  const status = c.req.query('status');
  const limit = parseInt(c.req.query('limit') || '20');
  const offset = parseInt(c.req.query('offset') || '0');

  const conditions = [eq(simulations.companyId, companyId)];
  if (status) {
    conditions.push(eq(simulations.status, status as any));
  }

  const results = await db
    .select()
    .from(simulations)
    .where(and(...conditions))
    .orderBy(desc(simulations.createdAt))
    .limit(limit)
    .offset(offset);

  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(simulations)
    .where(and(...conditions));

  return c.json({ data: results, total: count, limit, offset });
});

// Get simulation details
simulationRouter.get('/:simulationId', async (c) => {
  const simulationId = c.req.param('simulationId');

  const [simulation] = await db
    .select()
    .from(simulations)
    .where(eq(simulations.id, simulationId));

  if (!simulation) {
    return c.json({ error: { code: 'NOT_FOUND', message: 'Simulation not found' } }, 404);
  }

  // Get snapshots
  const snapshots = await db
    .select()
    .from(simulationSnapshots)
    .where(eq(simulationSnapshots.simulationId, simulationId))
    .orderBy(simulationSnapshots.simulationTime);

  return c.json({ data: { ...simulation, snapshots } });
});

// Create simulation
simulationRouter.post(
  '/company/:companyId',
  zValidator(
    'json',
    z.object({
      name: z.string().min(1),
      description: z.string().optional(),
      type: z.enum(['scenario', 'stress_test', 'forecast', 'optimization', 'training']),
      config: z.object({
        timeframe: z.object({
          start: z.string(),
          end: z.string(),
          speedMultiplier: z.number().default(1),
        }),
        scenario: z.object({
          type: z.string(),
          parameters: z.record(z.unknown()),
        }),
        agentConfig: z.object({
          includeAgents: z.union([z.array(z.string()), z.literal('all')]),
          budgetOverrides: z.record(z.number()).optional(),
          behaviorOverrides: z.record(z.unknown()).optional(),
        }),
        marketConditions: z.object({
          growthRate: z.number(),
          competitionLevel: z.number(),
          marketVolatility: z.number(),
        }).optional(),
        events: z.array(z.object({
          time: z.string(),
          type: z.string(),
          parameters: z.record(z.unknown()),
        })).optional(),
      }),
    })
  ),
  async (c) => {
    const companyId = c.req.param('companyId');
    const data = c.req.valid('json');
    const userId = c.get('userId');

    const [simulation] = await db
      .insert(simulations)
      .values({
        companyId,
        name: data.name,
        description: data.description,
        type: data.type,
        config: data.config,
        createdBy: userId,
      })
      .returning();

    return c.json({ data: simulation }, 201);
  }
);

// Start simulation
simulationRouter.post('/:simulationId/start', async (c) => {
  const simulationId = c.req.param('simulationId');

  const [simulation] = await db
    .update(simulations)
    .set({
      status: 'running',
      startedAt: new Date(),
      progress: 0,
      updatedAt: new Date(),
    })
    .where(eq(simulations.id, simulationId))
    .returning();

  if (!simulation) {
    return c.json({ error: { code: 'NOT_FOUND', message: 'Simulation not found' } }, 404);
  }

  // TODO: Queue simulation job for background processing

  return c.json({ data: simulation });
});

// Pause simulation
simulationRouter.post('/:simulationId/pause', async (c) => {
  const simulationId = c.req.param('simulationId');

  const [simulation] = await db
    .update(simulations)
    .set({
      status: 'paused',
      updatedAt: new Date(),
    })
    .where(eq(simulations.id, simulationId))
    .returning();

  return c.json({ data: simulation });
});

// Cancel simulation
simulationRouter.post('/:simulationId/cancel', async (c) => {
  const simulationId = c.req.param('simulationId');

  const [simulation] = await db
    .update(simulations)
    .set({
      status: 'cancelled',
      updatedAt: new Date(),
    })
    .where(eq(simulations.id, simulationId))
    .returning();

  return c.json({ data: simulation });
});

// Update simulation progress (called by simulation worker)
simulationRouter.patch(
  '/:simulationId/progress',
  zValidator(
    'json',
    z.object({
      progress: z.number().min(0).max(100),
      currentStep: z.string().optional(),
      estimatedCompletion: z.string().optional(),
    })
  ),
  async (c) => {
    const simulationId = c.req.param('simulationId');
    const data = c.req.valid('json');

    const [simulation] = await db
      .update(simulations)
      .set({
        progress: data.progress,
        currentStep: data.currentStep,
        estimatedCompletion: data.estimatedCompletion ? new Date(data.estimatedCompletion) : undefined,
        updatedAt: new Date(),
      })
      .where(eq(simulations.id, simulationId))
      .returning();

    return c.json({ data: simulation });
  }
);

// Complete simulation (called by simulation worker)
simulationRouter.post(
  '/:simulationId/complete',
  zValidator(
    'json',
    z.object({
      results: z.any(),
      success: z.boolean().default(true),
      errorMessage: z.string().optional(),
    })
  ),
  async (c) => {
    const simulationId = c.req.param('simulationId');
    const { results, success, errorMessage } = c.req.valid('json');

    const [simulation] = await db
      .update(simulations)
      .set({
        status: success ? 'completed' : 'failed',
        results,
        progress: 100,
        completedAt: new Date(),
        errorMessage,
        updatedAt: new Date(),
      })
      .where(eq(simulations.id, simulationId))
      .returning();

    return c.json({ data: simulation });
  }
);

// Save snapshot
simulationRouter.post(
  '/:simulationId/snapshots',
  zValidator(
    'json',
    z.object({
      simulationTime: z.string(),
      companyState: z.record(z.unknown()).optional(),
      agentStates: z.array(z.any()).optional(),
      metrics: z.record(z.number()).optional(),
      events: z.array(z.any()).optional(),
    })
  ),
  async (c) => {
    const simulationId = c.req.param('simulationId');
    const data = c.req.valid('json');

    const [snapshot] = await db
      .insert(simulationSnapshots)
      .values({
        simulationId,
        simulationTime: new Date(data.simulationTime),
        companyState: data.companyState,
        agentStates: data.agentStates,
        metrics: data.metrics,
        events: data.events,
      })
      .returning();

    return c.json({ data: snapshot }, 201);
  }
);

// Get templates
simulationRouter.get('/templates/browse', async (c) => {
  const companyId = c.req.query('companyId');

  const conditions = [
    or(isNull(simulationTemplates.companyId), companyId ? eq(simulationTemplates.companyId, companyId) : sql`true`),
  ];

  const templates = await db
    .select()
    .from(simulationTemplates)
    .where(and(...conditions))
    .orderBy(desc(simulationTemplates.usageCount));

  return c.json({ data: templates });
});

// Create template
simulationRouter.post(
  '/templates',
  zValidator(
    'json',
    z.object({
      companyId: z.string().uuid().optional(),
      name: z.string().min(1),
      description: z.string().optional(),
      type: z.enum(['scenario', 'stress_test', 'forecast', 'optimization', 'training']),
      config: z.any(),
    })
  ),
  async (c) => {
    const data = c.req.valid('json');
    const userId = c.get('userId');

    const [template] = await db
      .insert(simulationTemplates)
      .values({
        ...data,
        authorId: userId,
      })
      .returning();

    return c.json({ data: template }, 201);
  }
);

// Create from template
simulationRouter.post(
  '/templates/:templateId/create',
  zValidator(
    'json',
    z.object({
      companyId: z.string().uuid(),
      name: z.string().min(1),
      description: z.string().optional(),
      configOverrides: z.record(z.unknown()).optional(),
    })
  ),
  async (c) => {
    const templateId = c.req.param('templateId');
    const data = c.req.valid('json');
    const userId = c.get('userId');

    // Get template
    const [template] = await db
      .select()
      .from(simulationTemplates)
      .where(eq(simulationTemplates.id, templateId));

    if (!template) {
      return c.json({ error: { code: 'NOT_FOUND', message: 'Template not found' } }, 404);
    }

    // Create simulation from template
    const config = { ...template.config, ...data.configOverrides };

    const [simulation] = await db
      .insert(simulations)
      .values({
        companyId: data.companyId,
        name: data.name,
        description: data.description || template.description,
        type: template.type,
        config,
        createdBy: userId,
      })
      .returning();

    // Update template usage
    await db
      .update(simulationTemplates)
      .set({ usageCount: sql`${simulationTemplates.usageCount} + 1` })
      .where(eq(simulationTemplates.id, templateId));

    return c.json({ data: simulation }, 201);
  }
);

// Create default templates
simulationRouter.post('/templates/defaults', async (c) => {
  const defaultTemplates = [
    {
      name: 'Growth Scenario',
      description: 'Simulate company growth with increasing workload and revenue',
      type: 'scenario' as const,
      isSystem: true,
      authorId: 'system',
      config: {
        timeframe: { duration: '30d', speedMultiplier: 100 },
        scenario: {
          type: 'growth',
          parameters: { growthRate: 0.1, newTasksPerDay: 50 },
        },
      },
    },
    {
      name: 'Stress Test',
      description: 'Test system under high load conditions',
      type: 'stress_test' as const,
      isSystem: true,
      authorId: 'system',
      config: {
        timeframe: { duration: '7d', speedMultiplier: 1000 },
        scenario: {
          type: 'high_load',
          parameters: { taskMultiplier: 10, concurrentTasks: 100 },
        },
      },
    },
    {
      name: 'Budget Optimization',
      description: 'Find optimal budget allocation across agents',
      type: 'optimization' as const,
      isSystem: true,
      authorId: 'system',
      config: {
        timeframe: { duration: '90d', speedMultiplier: 1000 },
        scenario: {
          type: 'budget_optimization',
          parameters: { targetMetric: 'roi', constraints: { maxBudget: 10000 } },
        },
      },
    },
  ];

  const templates = await db
    .insert(simulationTemplates)
    .values(defaultTemplates)
    .returning();

  return c.json({ data: templates }, 201);
});

export default simulationRouter;
