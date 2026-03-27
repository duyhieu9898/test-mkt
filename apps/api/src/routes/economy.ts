import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import {
  agentCredits,
  creditTransactions,
  resourcePricing,
  agentPerformanceScores,
  creditTransferRequests,
  agents,
} from '@1person/core/db';
import { db } from '../lib/db';
import { eq, desc, and, sql, inArray, gte, lte } from 'drizzle-orm';
import { authMiddleware } from '../middleware/auth';

const economyRouter = new Hono();

// Auth middleware
economyRouter.use('*', authMiddleware);

// Get all agent credits for a company
economyRouter.get('/company/:companyId/credits', async (c) => {
  const companyId = c.req.param('companyId');

  const credits = await db
    .select({
      credit: agentCredits,
      agent: {
        id: agents.id,
        name: agents.name,
        role: agents.role,
        color: agents.color,
        avatar: agents.avatar,
      },
    })
    .from(agentCredits)
    .innerJoin(agents, eq(agentCredits.agentId, agents.id))
    .where(eq(agentCredits.companyId, companyId))
    .orderBy(desc(agentCredits.budgetSpent));

  return c.json({
    data: credits.map(({ credit, agent }) => ({
      ...credit,
      agent,
      utilizationPercent: {
        apiCalls: credit.monthlyApiCallsLimit > 0 ? (credit.apiCallsUsed / credit.monthlyApiCallsLimit) * 100 : 0,
        tokens: credit.monthlyTokensLimit > 0 ? (credit.tokensUsed / credit.monthlyTokensLimit) * 100 : 0,
        tools: credit.monthlyToolsLimit > 0 ? (credit.toolsUsed / credit.monthlyToolsLimit) * 100 : 0,
        externalApi: credit.monthlyExternalApiLimit > 0 ? (credit.externalApiUsed / credit.monthlyExternalApiLimit) * 100 : 0,
        budget: credit.budgetAllocation > 0 ? (credit.budgetSpent / credit.budgetAllocation) * 100 : 0,
      },
    })),
  });
});

// Get agent credits
economyRouter.get('/agent/:agentId', async (c) => {
  const agentId = c.req.param('agentId');

  const [credit] = await db
    .select({
      credit: agentCredits,
      agent: {
        id: agents.id,
        name: agents.name,
        role: agents.role,
        color: agents.color,
      },
    })
    .from(agentCredits)
    .innerJoin(agents, eq(agentCredits.agentId, agents.id))
    .where(eq(agentCredits.agentId, agentId));

  if (!credit) {
    return c.json({ error: { code: 'NOT_FOUND', message: 'Agent credits not found' } }, 404);
  }

  return c.json({ data: { ...credit.credit, agent: credit.agent } });
});

// Initialize agent credits
economyRouter.post(
  '/agent/:agentId/initialize',
  zValidator(
    'json',
    z.object({
      companyId: z.string().uuid(),
      budgetAllocation: z.number().optional(),
      monthlyApiCallsLimit: z.number().optional(),
      monthlyTokensLimit: z.number().optional(),
      monthlyToolsLimit: z.number().optional(),
      monthlyExternalApiLimit: z.number().optional(),
    })
  ),
  async (c) => {
    const agentId = c.req.param('agentId');
    const data = c.req.valid('json');

    // Check if already initialized
    const [existing] = await db
      .select({ id: agentCredits.id })
      .from(agentCredits)
      .where(eq(agentCredits.agentId, agentId));

    if (existing) {
      return c.json({ error: { code: 'ALREADY_EXISTS', message: 'Agent credits already initialized' } }, 400);
    }

    const [credit] = await db
      .insert(agentCredits)
      .values({
        agentId,
        companyId: data.companyId,
        budgetAllocation: data.budgetAllocation || 100,
        monthlyApiCallsLimit: data.monthlyApiCallsLimit || 10000,
        monthlyTokensLimit: data.monthlyTokensLimit || 1000000,
        monthlyToolsLimit: data.monthlyToolsLimit || 5000,
        monthlyExternalApiLimit: data.monthlyExternalApiLimit || 1000,
        apiCallsBalance: data.monthlyApiCallsLimit || 10000,
        tokensBalance: data.monthlyTokensLimit || 1000000,
        toolsBalance: data.monthlyToolsLimit || 5000,
        externalApiBalance: data.monthlyExternalApiLimit || 1000,
      })
      .returning();

    // Record initial allocation transaction
    await db.insert(creditTransactions).values([
      {
        companyId: data.companyId,
        agentId,
        transactionType: 'allocation',
        resourceType: 'api_calls',
        amount: credit.apiCallsBalance,
        balanceBefore: 0,
        balanceAfter: credit.apiCallsBalance,
        description: 'Initial allocation',
      },
      {
        companyId: data.companyId,
        agentId,
        transactionType: 'allocation',
        resourceType: 'tokens',
        amount: credit.tokensBalance,
        balanceBefore: 0,
        balanceAfter: credit.tokensBalance,
        description: 'Initial allocation',
      },
    ]);

    return c.json({ data: credit }, 201);
  }
);

// Record resource usage
economyRouter.post(
  '/agent/:agentId/usage',
  zValidator(
    'json',
    z.object({
      resourceType: z.enum(['api_calls', 'compute', 'storage', 'bandwidth', 'tokens', 'tools', 'external_api']),
      amount: z.number().positive(),
      costUsd: z.number().optional(),
      referenceType: z.string().optional(),
      referenceId: z.string().optional(),
      description: z.string().optional(),
    })
  ),
  async (c) => {
    const agentId = c.req.param('agentId');
    const data = c.req.valid('json');

    // Get current credits
    const [credit] = await db
      .select()
      .from(agentCredits)
      .where(eq(agentCredits.agentId, agentId));

    if (!credit) {
      return c.json({ error: { code: 'NOT_FOUND', message: 'Agent credits not found' } }, 404);
    }

    // Determine field based on resource type
    const fieldMap: Record<string, { balance: string; used: string }> = {
      api_calls: { balance: 'apiCallsBalance', used: 'apiCallsUsed' },
      tokens: { balance: 'tokensBalance', used: 'tokensUsed' },
      tools: { balance: 'toolsBalance', used: 'toolsUsed' },
      external_api: { balance: 'externalApiBalance', used: 'externalApiUsed' },
    };

    const field = fieldMap[data.resourceType];
    if (!field) {
      return c.json({ error: { code: 'INVALID_RESOURCE', message: 'Invalid resource type' } }, 400);
    }

    const currentBalance = credit[field.balance as keyof typeof credit] as number;
    const currentUsed = credit[field.used as keyof typeof credit] as number;
    const newBalance = Math.max(0, currentBalance - data.amount);
    const newUsed = currentUsed + data.amount;

    // Update balance
    const [updatedCredit] = await db
      .update(agentCredits)
      .set({
        [field.balance]: newBalance,
        [field.used]: newUsed,
        budgetSpent: sql`${agentCredits.budgetSpent} + ${data.costUsd || 0}`,
        updatedAt: new Date(),
      })
      .where(eq(agentCredits.agentId, agentId))
      .returning();

    // Record transaction
    await db.insert(creditTransactions).values({
      companyId: credit.companyId,
      agentId,
      transactionType: 'usage',
      resourceType: data.resourceType,
      amount: -data.amount,
      balanceBefore: currentBalance,
      balanceAfter: newBalance,
      costUsd: data.costUsd,
      referenceType: data.referenceType,
      referenceId: data.referenceId,
      description: data.description,
    });

    return c.json({
      data: {
        previousBalance: currentBalance,
        amount: data.amount,
        newBalance,
        totalUsed: newUsed,
      },
    });
  }
);

// Get transaction history
economyRouter.get('/agent/:agentId/transactions', async (c) => {
  const agentId = c.req.param('agentId');
  const limit = parseInt(c.req.query('limit') || '50');
  const offset = parseInt(c.req.query('offset') || '0');
  const resourceType = c.req.query('resourceType');

  const conditions = [eq(creditTransactions.agentId, agentId)];
  if (resourceType) {
    conditions.push(eq(creditTransactions.resourceType, resourceType as any));
  }

  const transactions = await db
    .select()
    .from(creditTransactions)
    .where(and(...conditions))
    .orderBy(desc(creditTransactions.createdAt))
    .limit(limit)
    .offset(offset);

  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(creditTransactions)
    .where(and(...conditions));

  return c.json({ data: transactions, total: count, limit, offset });
});

// Get company economy overview
economyRouter.get('/company/:companyId/overview', async (c) => {
  const companyId = c.req.param('companyId');

  // Get all agent credits
  const credits = await db
    .select()
    .from(agentCredits)
    .where(eq(agentCredits.companyId, companyId));

  // Calculate totals
  const totals = credits.reduce(
    (acc, c) => ({
      totalBudget: acc.totalBudget + c.budgetAllocation,
      totalSpent: acc.totalSpent + c.budgetSpent,
      totalApiCalls: acc.totalApiCalls + c.apiCallsUsed,
      totalTokens: acc.totalTokens + c.tokensUsed,
      totalTools: acc.totalTools + c.toolsUsed,
    }),
    { totalBudget: 0, totalSpent: 0, totalApiCalls: 0, totalTokens: 0, totalTools: 0 }
  );

  // Get recent transactions
  const recentTransactions = await db
    .select({
      transaction: creditTransactions,
      agent: {
        id: agents.id,
        name: agents.name,
        color: agents.color,
      },
    })
    .from(creditTransactions)
    .innerJoin(agents, eq(creditTransactions.agentId, agents.id))
    .where(eq(creditTransactions.companyId, companyId))
    .orderBy(desc(creditTransactions.createdAt))
    .limit(20);

  // Get top spenders
  const topSpenders = await db
    .select({
      agentId: agentCredits.agentId,
      agentName: agents.name,
      agentColor: agents.color,
      budgetSpent: agentCredits.budgetSpent,
      budgetAllocation: agentCredits.budgetAllocation,
    })
    .from(agentCredits)
    .innerJoin(agents, eq(agentCredits.agentId, agents.id))
    .where(eq(agentCredits.companyId, companyId))
    .orderBy(desc(agentCredits.budgetSpent))
    .limit(5);

  return c.json({
    data: {
      totals,
      utilizationPercent: totals.totalBudget > 0 ? (totals.totalSpent / totals.totalBudget) * 100 : 0,
      agentCount: credits.length,
      recentTransactions: recentTransactions.map(({ transaction, agent }) => ({
        ...transaction,
        agent,
      })),
      topSpenders,
    },
  });
});

// Update agent limits
economyRouter.patch(
  '/agent/:agentId/limits',
  zValidator(
    'json',
    z.object({
      budgetAllocation: z.number().optional(),
      monthlyApiCallsLimit: z.number().optional(),
      monthlyTokensLimit: z.number().optional(),
      monthlyToolsLimit: z.number().optional(),
      monthlyExternalApiLimit: z.number().optional(),
    })
  ),
  async (c) => {
    const agentId = c.req.param('agentId');
    const data = c.req.valid('json');

    const [credit] = await db
      .update(agentCredits)
      .set({
        ...data,
        updatedAt: new Date(),
      })
      .where(eq(agentCredits.agentId, agentId))
      .returning();

    if (!credit) {
      return c.json({ error: { code: 'NOT_FOUND', message: 'Agent credits not found' } }, 404);
    }

    return c.json({ data: credit });
  }
);

// Reset monthly credits
economyRouter.post('/company/:companyId/reset', async (c) => {
  const companyId = c.req.param('companyId');

  // Get all agent credits
  const credits = await db
    .select()
    .from(agentCredits)
    .where(eq(agentCredits.companyId, companyId));

  // Reset each agent
  for (const credit of credits) {
    await db
      .update(agentCredits)
      .set({
        apiCallsBalance: credit.monthlyApiCallsLimit,
        apiCallsUsed: 0,
        tokensBalance: credit.monthlyTokensLimit,
        tokensUsed: 0,
        toolsBalance: credit.monthlyToolsLimit,
        toolsUsed: 0,
        externalApiBalance: credit.monthlyExternalApiLimit,
        externalApiUsed: 0,
        budgetSpent: 0,
        lastResetAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(agentCredits.id, credit.id));

    // Record reset transaction
    await db.insert(creditTransactions).values({
      companyId,
      agentId: credit.agentId,
      transactionType: 'reset',
      resourceType: 'api_calls',
      amount: credit.monthlyApiCallsLimit,
      balanceBefore: credit.apiCallsBalance,
      balanceAfter: credit.monthlyApiCallsLimit,
      description: 'Monthly reset',
    });
  }

  return c.json({ success: true, resetCount: credits.length });
});

// Request credit transfer
economyRouter.post(
  '/transfer/request',
  zValidator(
    'json',
    z.object({
      fromAgentId: z.string().uuid(),
      toAgentId: z.string().uuid(),
      resourceType: z.enum(['api_calls', 'tokens', 'tools', 'external_api']),
      amount: z.number().positive(),
      reason: z.string().min(1),
    })
  ),
  async (c) => {
    const data = c.req.valid('json');

    // Get from agent credits
    const [fromCredit] = await db
      .select()
      .from(agentCredits)
      .where(eq(agentCredits.agentId, data.fromAgentId));

    if (!fromCredit) {
      return c.json({ error: { code: 'NOT_FOUND', message: 'Source agent credits not found' } }, 404);
    }

    const [request] = await db
      .insert(creditTransferRequests)
      .values({
        companyId: fromCredit.companyId,
        fromAgentId: data.fromAgentId,
        toAgentId: data.toAgentId,
        resourceType: data.resourceType,
        amount: data.amount,
        reason: data.reason,
      })
      .returning();

    return c.json({ data: request }, 201);
  }
);

// Get pending transfer requests
economyRouter.get('/company/:companyId/transfers/pending', async (c) => {
  const companyId = c.req.param('companyId');

  const requests = await db
    .select({
      request: creditTransferRequests,
      fromAgent: {
        id: agents.id,
        name: agents.name,
        color: agents.color,
      },
    })
    .from(creditTransferRequests)
    .innerJoin(agents, eq(creditTransferRequests.fromAgentId, agents.id))
    .where(
      and(
        eq(creditTransferRequests.companyId, companyId),
        eq(creditTransferRequests.status, 'pending')
      )
    )
    .orderBy(desc(creditTransferRequests.createdAt));

  return c.json({ data: requests });
});

// Approve/reject transfer
economyRouter.post(
  '/transfer/:requestId/decision',
  zValidator(
    'json',
    z.object({
      approved: z.boolean(),
      reason: z.string().optional(),
    })
  ),
  async (c) => {
    const requestId = c.req.param('requestId');
    const { approved, reason } = c.req.valid('json');
    const userId = c.get('userId');

    const [request] = await db
      .select()
      .from(creditTransferRequests)
      .where(eq(creditTransferRequests.id, requestId));

    if (!request) {
      return c.json({ error: { code: 'NOT_FOUND', message: 'Transfer request not found' } }, 404);
    }

    if (request.status !== 'pending') {
      return c.json({ error: { code: 'INVALID_STATUS', message: 'Request already processed' } }, 400);
    }

    if (approved) {
      // Get current balances
      const [fromCredit] = await db
        .select()
        .from(agentCredits)
        .where(eq(agentCredits.agentId, request.fromAgentId));

      const [toCredit] = await db
        .select()
        .from(agentCredits)
        .where(eq(agentCredits.agentId, request.toAgentId));

      if (!fromCredit || !toCredit) {
        return c.json({ error: { code: 'NOT_FOUND', message: 'Agent credits not found' } }, 404);
      }

      const fieldMap: Record<string, string> = {
        api_calls: 'apiCallsBalance',
        tokens: 'tokensBalance',
        tools: 'toolsBalance',
        external_api: 'externalApiBalance',
      };

      const field = fieldMap[request.resourceType] as keyof typeof fromCredit;
      const fromBalance = fromCredit[field] as number;
      const toBalance = toCredit[field] as number;

      if (fromBalance < request.amount) {
        return c.json({ error: { code: 'INSUFFICIENT_BALANCE', message: 'Insufficient balance' } }, 400);
      }

      // Perform transfer
      await db
        .update(agentCredits)
        .set({ [field]: fromBalance - request.amount, updatedAt: new Date() })
        .where(eq(agentCredits.agentId, request.fromAgentId));

      await db
        .update(agentCredits)
        .set({ [field]: toBalance + request.amount, updatedAt: new Date() })
        .where(eq(agentCredits.agentId, request.toAgentId));

      // Record transactions
      await db.insert(creditTransactions).values([
        {
          companyId: request.companyId,
          agentId: request.fromAgentId,
          transactionType: 'transfer',
          resourceType: request.resourceType,
          amount: -request.amount,
          balanceBefore: fromBalance,
          balanceAfter: fromBalance - request.amount,
          counterpartyAgentId: request.toAgentId,
          description: `Transfer to agent`,
        },
        {
          companyId: request.companyId,
          agentId: request.toAgentId,
          transactionType: 'transfer',
          resourceType: request.resourceType,
          amount: request.amount,
          balanceBefore: toBalance,
          balanceAfter: toBalance + request.amount,
          counterpartyAgentId: request.fromAgentId,
          description: `Transfer from agent`,
        },
      ]);
    }

    // Update request status
    const [updatedRequest] = await db
      .update(creditTransferRequests)
      .set({
        status: approved ? 'completed' : 'rejected',
        responseReason: reason,
        approvedBy: userId,
        approvedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(creditTransferRequests.id, requestId))
      .returning();

    return c.json({ data: updatedRequest });
  }
);

// Get performance scores
economyRouter.get('/agent/:agentId/performance', async (c) => {
  const agentId = c.req.param('agentId');
  const limit = parseInt(c.req.query('limit') || '10');

  const scores = await db
    .select()
    .from(agentPerformanceScores)
    .where(eq(agentPerformanceScores.agentId, agentId))
    .orderBy(desc(agentPerformanceScores.periodEnd))
    .limit(limit);

  return c.json({ data: scores });
});

// Get pricing configuration
economyRouter.get('/company/:companyId/pricing', async (c) => {
  const companyId = c.req.param('companyId');

  const pricing = await db
    .select()
    .from(resourcePricing)
    .where(eq(resourcePricing.companyId, companyId));

  return c.json({ data: pricing });
});

// Create default pricing
economyRouter.post('/company/:companyId/pricing/defaults', async (c) => {
  const companyId = c.req.param('companyId');

  const defaultPricing = [
    {
      resourceType: 'api_calls' as const,
      name: 'API Calls',
      pricePerUnit: 0.001,
      unitName: 'call',
      modelPricing: {
        'claude-3-5-sonnet': { input: 0.003, output: 0.015 },
        'claude-3-opus': { input: 0.015, output: 0.075 },
        'gpt-4-turbo': { input: 0.01, output: 0.03 },
        'gpt-4o': { input: 0.005, output: 0.015 },
      },
      isDefault: true,
    },
    {
      resourceType: 'tokens' as const,
      name: 'Tokens',
      pricePerUnit: 0.00001,
      unitName: 'token',
      isDefault: true,
    },
    {
      resourceType: 'tools' as const,
      name: 'Tool Invocations',
      pricePerUnit: 0.0001,
      unitName: 'invocation',
      isDefault: true,
    },
    {
      resourceType: 'external_api' as const,
      name: 'External API Calls',
      pricePerUnit: 0.01,
      unitName: 'call',
      isDefault: true,
    },
  ];

  const pricing = await db
    .insert(resourcePricing)
    .values(defaultPricing.map((p) => ({ ...p, companyId })))
    .returning();

  return c.json({ data: pricing }, 201);
});

export default economyRouter;
