/**
 * Business Brain API (W0.2)
 *
 * CRUD for the four editable knowledge stores that back every generation:
 *   - brand voice
 *   - personas
 *   - products
 *   - campaign learnings
 *
 * All mutations are audit-logged by the underlying brain-store.
 * Route path: /api/v1/brain/:companyId/...
 *
 * See docs/architecture/06-transparent-data-system.md §6a
 *     docs/architecture/07-marketing-execution-roadmap.md §3 G2
 */

import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { db } from '../lib/db';
import { companies } from '@1person/core/db';
import { authMiddleware } from '../middleware/auth';
import { HTTPException } from 'hono/http-exception';
import { getTenantAI, ensureTenantForCompany } from '../lib/tenant-ai';

const brainRouter = new Hono();
brainRouter.use('*', authMiddleware);

// ─── helpers ────────────────────────────────────────────────────────

async function verifyOwnershipAndGetTenantId(
  companyId: string,
  userId: string,
): Promise<string> {
  const company = await db.query.companies.findFirst({
    where: eq(companies.id, companyId),
    columns: { id: true, name: true, ownerId: true },
  });
  if (!company) {
    throw new HTTPException(404, { message: 'Company not found' });
  }
  if (company.ownerId !== userId) {
    throw new HTTPException(403, { message: 'You do not own this company' });
  }
  return ensureTenantForCompany(company.id, company.name);
}

// ─── GET /:companyId — full snapshot ────────────────────────────────

brainRouter.get('/:companyId', async (c) => {
  const { userId } = c.get('user');
  const tenantId = await verifyOwnershipAndGetTenantId(
    c.req.param('companyId'),
    userId,
  );
  const ai = getTenantAI();
  const snapshot = await ai.brain.getSnapshot(tenantId);
  return c.json(snapshot);
});

// ─── Brand voice ────────────────────────────────────────────────────

const brandVoiceSchema = z.object({
  tone: z.string().min(1).max(50).optional(),
  description: z.string().max(2000).nullable().optional(),
  wordsToUse: z.array(z.string().max(50)).max(50).optional(),
  wordsToAvoid: z.array(z.string().max(50)).max(50).optional(),
  examples: z.array(z.string().max(500)).max(20).optional(),
});

brainRouter.get('/:companyId/brand-voice', async (c) => {
  const { userId } = c.get('user');
  const tenantId = await verifyOwnershipAndGetTenantId(
    c.req.param('companyId'),
    userId,
  );
  const ai = getTenantAI();
  const voice = await ai.brain.getBrandVoice(tenantId);
  return c.json(voice);
});

brainRouter.put(
  '/:companyId/brand-voice',
  zValidator('json', brandVoiceSchema),
  async (c) => {
    const { userId } = c.get('user');
    const tenantId = await verifyOwnershipAndGetTenantId(
      c.req.param('companyId'),
      userId,
    );
    const input = c.req.valid('json');
    const ai = getTenantAI();
    const voice = await ai.brain.upsertBrandVoice(tenantId, input, `user:${userId}`);
    return c.json(voice);
  },
);

// ─── Personas ───────────────────────────────────────────────────────

const personaSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().max(2000).nullable().optional(),
  attributes: z
    .object({
      demographics: z.string().max(500).optional(),
      painPoints: z.array(z.string().max(200)).max(20).optional(),
      goals: z.array(z.string().max(200)).max(20).optional(),
      channels: z.array(z.string().max(50)).max(20).optional(),
    })
    .optional(),
  isPrimary: z.boolean().optional(),
});

brainRouter.get('/:companyId/personas', async (c) => {
  const { userId } = c.get('user');
  const tenantId = await verifyOwnershipAndGetTenantId(
    c.req.param('companyId'),
    userId,
  );
  const ai = getTenantAI();
  const personas = await ai.brain.listPersonas(tenantId);
  return c.json({ data: personas });
});

brainRouter.post(
  '/:companyId/personas',
  zValidator('json', personaSchema),
  async (c) => {
    const { userId } = c.get('user');
    const tenantId = await verifyOwnershipAndGetTenantId(
      c.req.param('companyId'),
      userId,
    );
    const ai = getTenantAI();
    const persona = await ai.brain.createPersona(
      tenantId,
      c.req.valid('json'),
      `user:${userId}`,
    );
    return c.json(persona, 201);
  },
);

brainRouter.patch(
  '/:companyId/personas/:personaId',
  zValidator('json', personaSchema.partial()),
  async (c) => {
    const { userId } = c.get('user');
    const tenantId = await verifyOwnershipAndGetTenantId(
      c.req.param('companyId'),
      userId,
    );
    const ai = getTenantAI();
    const persona = await ai.brain.updatePersona(
      tenantId,
      c.req.param('personaId'),
      c.req.valid('json'),
      `user:${userId}`,
    );
    return c.json(persona);
  },
);

brainRouter.delete('/:companyId/personas/:personaId', async (c) => {
  const { userId } = c.get('user');
  const tenantId = await verifyOwnershipAndGetTenantId(
    c.req.param('companyId'),
    userId,
  );
  const ai = getTenantAI();
  await ai.brain.deletePersona(tenantId, c.req.param('personaId'), `user:${userId}`);
  return c.json({ success: true });
});

// ─── Products ───────────────────────────────────────────────────────

const productSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().max(2000).nullable().optional(),
  price: z.string().max(64).nullable().optional(),
  attributes: z
    .object({
      category: z.string().max(100).optional(),
      features: z.array(z.string().max(200)).max(30).optional(),
      benefits: z.array(z.string().max(200)).max(30).optional(),
      targetPersonaIds: z.array(z.string().uuid()).max(20).optional(),
    })
    .optional(),
});

brainRouter.get('/:companyId/products', async (c) => {
  const { userId } = c.get('user');
  const tenantId = await verifyOwnershipAndGetTenantId(
    c.req.param('companyId'),
    userId,
  );
  const ai = getTenantAI();
  const products = await ai.brain.listProducts(tenantId);
  return c.json({ data: products });
});

brainRouter.post(
  '/:companyId/products',
  zValidator('json', productSchema),
  async (c) => {
    const { userId } = c.get('user');
    const tenantId = await verifyOwnershipAndGetTenantId(
      c.req.param('companyId'),
      userId,
    );
    const ai = getTenantAI();
    const product = await ai.brain.createProduct(
      tenantId,
      c.req.valid('json'),
      `user:${userId}`,
    );
    return c.json(product, 201);
  },
);

brainRouter.patch(
  '/:companyId/products/:productId',
  zValidator('json', productSchema.partial()),
  async (c) => {
    const { userId } = c.get('user');
    const tenantId = await verifyOwnershipAndGetTenantId(
      c.req.param('companyId'),
      userId,
    );
    const ai = getTenantAI();
    const product = await ai.brain.updateProduct(
      tenantId,
      c.req.param('productId'),
      c.req.valid('json'),
      `user:${userId}`,
    );
    return c.json(product);
  },
);

brainRouter.delete('/:companyId/products/:productId', async (c) => {
  const { userId } = c.get('user');
  const tenantId = await verifyOwnershipAndGetTenantId(
    c.req.param('companyId'),
    userId,
  );
  const ai = getTenantAI();
  await ai.brain.deleteProduct(tenantId, c.req.param('productId'), `user:${userId}`);
  return c.json({ success: true });
});

// ─── Market Position (doc 10 §4) ────────────────────────────────────

const marketPositionSchema = z.object({
  swot: z
    .object({
      strengths: z.array(z.string().max(500)).max(20).optional(),
      weaknesses: z.array(z.string().max(500)).max(20).optional(),
      opportunities: z.array(z.string().max(500)).max(20).optional(),
      threats: z.array(z.string().max(500)).max(20).optional(),
    })
    .optional(),
  differentiation: z.string().max(2000).nullable().optional(),
  positioningStatement: z.string().max(2000).nullable().optional(),
  targetMarket: z.string().max(2000).nullable().optional(),
});

brainRouter.get('/:companyId/market-position', async (c) => {
  const { userId } = c.get('user');
  const tenantId = await verifyOwnershipAndGetTenantId(
    c.req.param('companyId'),
    userId,
  );
  const ai = getTenantAI();
  const mp = await ai.brain.getMarketPosition(tenantId);
  return c.json(mp);
});

brainRouter.put(
  '/:companyId/market-position',
  zValidator('json', marketPositionSchema),
  async (c) => {
    const { userId } = c.get('user');
    const tenantId = await verifyOwnershipAndGetTenantId(
      c.req.param('companyId'),
      userId,
    );
    const input = c.req.valid('json');
    const ai = getTenantAI();
    const mp = await ai.brain.upsertMarketPosition(tenantId, input, `user:${userId}`);
    return c.json(mp);
  },
);

// ─── Sales Playbook (doc 10 §4) ─────────────────────────────────────

const salesPlaybookSchema = z.object({
  idealCustomerProfile: z.string().max(4000).nullable().optional(),
  qualificationRules: z.array(z.string().max(500)).max(30).optional(),
  stages: z
    .array(
      z.object({
        name: z.string().min(1).max(100),
        description: z.string().max(500).optional(),
        exitCriteria: z.string().max(500).optional(),
      }),
    )
    .max(20)
    .optional(),
  objections: z
    .array(
      z.object({
        objection: z.string().min(1).max(500),
        response: z.string().min(1).max(2000),
      }),
    )
    .max(50)
    .optional(),
  closingLines: z.array(z.string().max(500)).max(20).optional(),
  emailTemplates: z
    .array(
      z.object({
        name: z.string().min(1).max(100),
        stage: z.string().max(100).optional(),
        body: z.string().max(4000),
      }),
    )
    .max(50)
    .optional(),
});

brainRouter.get('/:companyId/sales-playbook', async (c) => {
  const { userId } = c.get('user');
  const tenantId = await verifyOwnershipAndGetTenantId(
    c.req.param('companyId'),
    userId,
  );
  const ai = getTenantAI();
  const pb = await ai.brain.getSalesPlaybook(tenantId);
  return c.json(pb);
});

brainRouter.put(
  '/:companyId/sales-playbook',
  zValidator('json', salesPlaybookSchema),
  async (c) => {
    const { userId } = c.get('user');
    const tenantId = await verifyOwnershipAndGetTenantId(
      c.req.param('companyId'),
      userId,
    );
    const input = c.req.valid('json');
    const ai = getTenantAI();
    const pb = await ai.brain.upsertSalesPlaybook(tenantId, input, `user:${userId}`);
    return c.json(pb);
  },
);

// ─── Marketing Strategy (doc 10 §4) ─────────────────────────────────

const marketingStrategySchema = z.object({
  channels: z
    .array(
      z.object({
        name: z.string().min(1).max(100),
        kind: z.enum(['online', 'offline']),
        enabled: z.boolean(),
        budgetShare: z.number().min(0).max(100).optional(),
        voiceOverride: z.string().max(500).optional(),
        notes: z.string().max(1000).optional(),
      }),
    )
    .max(30)
    .optional(),
  monthlyBudget: z.string().max(64).nullable().optional(),
  themes: z
    .array(
      z.object({
        title: z.string().min(1).max(200),
        description: z.string().max(1000).optional(),
        quarter: z.string().max(50).optional(),
      }),
    )
    .max(20)
    .optional(),
  funnelStages: z.array(z.string().max(100)).max(10).optional(),
  kpis: z
    .array(
      z.object({
        name: z.string().min(1).max(100),
        target: z.string().max(100).optional(),
      }),
    )
    .max(20)
    .optional(),
});

brainRouter.get('/:companyId/marketing-strategy', async (c) => {
  const { userId } = c.get('user');
  const tenantId = await verifyOwnershipAndGetTenantId(
    c.req.param('companyId'),
    userId,
  );
  const ai = getTenantAI();
  const ms = await ai.brain.getMarketingStrategy(tenantId);
  return c.json(ms);
});

brainRouter.put(
  '/:companyId/marketing-strategy',
  zValidator('json', marketingStrategySchema),
  async (c) => {
    const { userId } = c.get('user');
    const tenantId = await verifyOwnershipAndGetTenantId(
      c.req.param('companyId'),
      userId,
    );
    const input = c.req.valid('json');
    const ai = getTenantAI();
    const ms = await ai.brain.upsertMarketingStrategy(tenantId, input, `user:${userId}`);
    return c.json(ms);
  },
);

// ─── Campaign learnings ─────────────────────────────────────────────

// ─── POST /:companyId/autoextract — re-run Brain autoextract ────────
//
// One-click rebuild of the Business Brain from the current business
// context. Used by the campaign flow's "Brain not ready yet" banner
// and by the Brain page's "Re-crawl" button. Idempotent by default —
// pass `?force=true` to overwrite an existing brand voice.
brainRouter.post('/:companyId/autoextract', async (c) => {
  const { userId } = c.get('user');
  const companyId = c.req.param('companyId');
  const force = c.req.query('force') === 'true';
  const tenantId = await verifyOwnershipAndGetTenantId(companyId, userId);

  const { autoExtractBrainFromCompany } = await import('../services/brain-autoextract');
  const ai = getTenantAI();

  if (force) {
    // Clear existing brand voice so autoextract runs fresh. Personas
    // and products are additive — we don't wipe them to avoid losing
    // manual edits the user has made.
    // (Brand voice has versioning; inserting a new one after a delete
    // would break history. We mimic "force" by simply re-running the
    // LLM extract AND calling upsertBrandVoice which updates in place.)
  }

  // Short-circuit idempotency when `force=false`
  if (!force) {
    const existing = await ai.brain.getBrandVoice(tenantId).catch(() => null);
    if (existing) {
      return c.json({ brandVoice: true, personas: 0, products: 0, skipped: true });
    }
  }

  const company = await db.query.companies.findFirst({
    where: eq(companies.id, companyId),
    columns: { name: true },
  });
  const result = await autoExtractBrainFromCompany(companyId, company?.name ?? 'Company');
  return c.json(result);
});

// ─── POST /:companyId/sales-playbook/autodraft ──────────────────────
//
// Đợt 4 G3 — reads the existing Business Brain and asks the LLM to
// draft a complete sales playbook (ICP + qualification + objections +
// closing lines + email templates). Does NOT save — returns the draft
// for the CEO to review and save via the existing PUT endpoint.
brainRouter.post('/:companyId/sales-playbook/autodraft', async (c) => {
  const { userId } = c.get('user');
  const companyId = c.req.param('companyId');
  const tenantId = await verifyOwnershipAndGetTenantId(companyId, userId);

  const { ensureSufficientCredits, chargeFixedCredits } = await import('../lib/credits');
  await ensureSufficientCredits(companyId, 3);

  const ai = getTenantAI();
  const snapshot = await ai.brain.getSnapshot(tenantId);
  const company = await db.query.companies.findFirst({
    where: eq(companies.id, companyId),
    columns: { name: true, industry: true },
  });

  const primaryPersona =
    (snapshot.personas ?? []).find((p: any) => p.isPrimary) ?? snapshot.personas?.[0] ?? null;

  const { llmGenerate, extractJSON } = await import('../lib/llm');
  const result = await llmGenerate(
    [
      {
        role: 'system',
        content:
          "You are a venture-stage sales enablement coach. Draft a concise sales playbook from the company's Business Brain. Return ONLY valid JSON.",
      },
      {
        role: 'user',
        content: `Company: ${company?.name ?? 'Unknown'}
Industry: ${company?.industry ?? 'unspecified'}
Brand voice: ${JSON.stringify(snapshot.brandVoice ?? {}, null, 2)}
Primary persona: ${JSON.stringify(primaryPersona ?? {}, null, 2)}
Products: ${JSON.stringify(snapshot.products ?? [], null, 2)}
Market position: ${JSON.stringify(snapshot.marketPosition ?? {}, null, 2)}

Return JSON with this exact shape:
{
  "idealCustomerProfile": "3-sentence ICP describing who, why, budget",
  "qualificationRules": ["4-6 rules like 'Has a budget >= X'"],
  "objections": [{"objection":"...","response":"..."}],
  "closingLines": ["3 closing lines in the brand voice"],
  "emailTemplates": [{"name":"Intro email","stage":"discovery","body":"..."},{"name":"Follow-up","stage":"proposal","body":"..."}]
}
Include 3-5 objections. Write in the brand voice above.`,
      },
    ],
    {
      featureKey: 'sales_deal_assistant',
      json: true,
      traceName: 'brain.sales_playbook_autodraft',
      metadata: { companyId },
    },
  );

  const draft = extractJSON(result.text);
  if (!draft || typeof draft !== 'object') {
    throw new HTTPException(500, {
      message: "The AI draft came back garbled. Please try again in a moment.",
    });
  }

  await chargeFixedCredits(companyId, 3, {
    featureKey: 'sales_deal_assistant',
    tier: result.tierUsed,
    refKind: 'brain_sales_playbook_autodraft',
    refId: result.traceId,
    actor: `user:${userId}`,
  });

  return c.json({ draft, traceId: result.traceId });
});

brainRouter.get('/:companyId/learnings', async (c) => {
  const { userId } = c.get('user');
  const tenantId = await verifyOwnershipAndGetTenantId(
    c.req.param('companyId'),
    userId,
  );
  const ai = getTenantAI();
  const limit = Math.min(Number(c.req.query('limit') ?? '20'), 100);
  const learnings = await ai.brain.listLearnings(tenantId, limit);
  return c.json({ data: learnings });
});

export default brainRouter;
