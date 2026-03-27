import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { HTTPException } from 'hono/http-exception';
import { authMiddleware, getUserCompanies } from '../middleware/auth';
import { executionMetrics } from '../services/execution-metrics-service';

const metrics = new Hono();

// Apply auth middleware
metrics.use('*', authMiddleware);

// Helper to verify company access
async function verifyCompanyAccess(userId: string, companyId: string): Promise<boolean> {
  const userCompanies = await getUserCompanies(userId);
  return userCompanies.some((co: { id: string }) => co.id === companyId);
}

// Get overall execution metrics
metrics.get('/company/:companyId', async (c) => {
  const companyId = c.req.param('companyId');
  const { userId } = c.get('user');

  if (!(await verifyCompanyAccess(userId, companyId))) {
    throw new HTTPException(403, { message: 'Access denied' });
  }

  const startDate = c.req.query('startDate') ? new Date(c.req.query('startDate')!) : undefined;
  const endDate = c.req.query('endDate') ? new Date(c.req.query('endDate')!) : undefined;

  const data = await executionMetrics.getMetrics(companyId, { startDate, endDate });

  return c.json({ data });
});

// Get time series data
const timeSeriesSchema = z.object({
  metric: z.enum(['count', 'cost', 'success_rate']),
  granularity: z.enum(['hour', 'day', 'week']),
  startDate: z.string().transform((s) => new Date(s)),
  endDate: z.string().transform((s) => new Date(s)),
});

metrics.get('/company/:companyId/timeseries', zValidator('query', timeSeriesSchema), async (c) => {
  const companyId = c.req.param('companyId');
  const { userId } = c.get('user');
  const query = c.req.valid('query');

  if (!(await verifyCompanyAccess(userId, companyId))) {
    throw new HTTPException(403, { message: 'Access denied' });
  }

  const data = await executionMetrics.getTaskTimeSeries(companyId, query);

  return c.json({ data });
});

// Get agent performance
metrics.get('/company/:companyId/agents', async (c) => {
  const companyId = c.req.param('companyId');
  const { userId } = c.get('user');

  if (!(await verifyCompanyAccess(userId, companyId))) {
    throw new HTTPException(403, { message: 'Access denied' });
  }

  const agentType = c.req.query('agentType');
  const startDate = c.req.query('startDate') ? new Date(c.req.query('startDate')!) : undefined;
  const endDate = c.req.query('endDate') ? new Date(c.req.query('endDate')!) : undefined;

  const data = await executionMetrics.getAgentPerformance(companyId, {
    agentType,
    startDate,
    endDate,
  });

  return c.json({ data });
});

// Get cost breakdown
metrics.get('/company/:companyId/costs', async (c) => {
  const companyId = c.req.param('companyId');
  const { userId } = c.get('user');

  if (!(await verifyCompanyAccess(userId, companyId))) {
    throw new HTTPException(403, { message: 'Access denied' });
  }

  const startDate = c.req.query('startDate') ? new Date(c.req.query('startDate')!) : undefined;
  const endDate = c.req.query('endDate') ? new Date(c.req.query('endDate')!) : undefined;

  const data = await executionMetrics.getCostBreakdown(companyId, { startDate, endDate });

  return c.json({ data });
});

// Get recent errors
metrics.get('/company/:companyId/errors', async (c) => {
  const companyId = c.req.param('companyId');
  const { userId } = c.get('user');

  if (!(await verifyCompanyAccess(userId, companyId))) {
    throw new HTTPException(403, { message: 'Access denied' });
  }

  const limit = parseInt(c.req.query('limit') || '20');
  const data = await executionMetrics.getRecentErrors(companyId, limit);

  return c.json({ data });
});

// Get asset generation stats
metrics.get('/company/:companyId/assets', async (c) => {
  const companyId = c.req.param('companyId');
  const { userId } = c.get('user');

  if (!(await verifyCompanyAccess(userId, companyId))) {
    throw new HTTPException(403, { message: 'Access denied' });
  }

  const startDate = c.req.query('startDate') ? new Date(c.req.query('startDate')!) : undefined;
  const endDate = c.req.query('endDate') ? new Date(c.req.query('endDate')!) : undefined;

  const data = await executionMetrics.getAssetGenerationStats(companyId, { startDate, endDate });

  return c.json({ data });
});

// Get real-time status
metrics.get('/company/:companyId/realtime', async (c) => {
  const companyId = c.req.param('companyId');
  const { userId } = c.get('user');

  if (!(await verifyCompanyAccess(userId, companyId))) {
    throw new HTTPException(403, { message: 'Access denied' });
  }

  const data = await executionMetrics.getRealTimeStatus(companyId);

  return c.json({ data });
});

// Get dashboard summary (combines multiple metrics)
metrics.get('/company/:companyId/dashboard', async (c) => {
  const companyId = c.req.param('companyId');
  const { userId } = c.get('user');

  if (!(await verifyCompanyAccess(userId, companyId))) {
    throw new HTTPException(403, { message: 'Access denied' });
  }

  const now = new Date();
  const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  const [
    dailyMetrics,
    weeklyMetrics,
    realtimeStatus,
    agentPerformance,
    costBreakdown,
    recentErrors,
    assetStats,
  ] = await Promise.all([
    executionMetrics.getMetrics(companyId, { startDate: oneDayAgo, endDate: now }),
    executionMetrics.getMetrics(companyId, { startDate: oneWeekAgo, endDate: now }),
    executionMetrics.getRealTimeStatus(companyId),
    executionMetrics.getAgentPerformance(companyId, { startDate: oneWeekAgo }),
    executionMetrics.getCostBreakdown(companyId, { startDate: oneWeekAgo }),
    executionMetrics.getRecentErrors(companyId, 5),
    executionMetrics.getAssetGenerationStats(companyId, { startDate: oneWeekAgo }),
  ]);

  return c.json({
    data: {
      daily: dailyMetrics,
      weekly: weeklyMetrics,
      realtime: realtimeStatus,
      agentPerformance,
      costBreakdown,
      recentErrors,
      assetStats,
    },
  });
});

export default metrics;
