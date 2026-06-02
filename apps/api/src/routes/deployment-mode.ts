/**
 * Deployment Mode API (P0-A1)
 *
 * Per-tenant cloud / private / on-premise routing selector. Backs the
 * `/settings/deployment` picker in the web UI and drives how apps/api
 * resolves the LLM provider for each company.
 *
 * Route path: /api/v1/deployment-mode/:companyId
 *
 * All mutations are audit-logged by the underlying deployment-store.
 * See docs/architecture/08-post-managed-agents-pmf-plan.md §P0-A1.
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

const deploymentModeRouter = new Hono();
deploymentModeRouter.use('*', authMiddleware);

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

// ─── GET /:companyId — current mode (defaults to cloud) ─────────────

deploymentModeRouter.get('/:companyId', async (c) => {
  const { userId } = c.get('user');
  const tenantId = await verifyOwnershipAndGetTenantId(
    c.req.param('companyId'),
    userId,
  );
  const ai = getTenantAI();
  const current = await ai.deployment.getMode(tenantId);
  if (!current) {
    return c.json({
      mode: 'cloud' as const,
      vllmUrl: null,
      vllmModel: null,
    });
  }
  return c.json({
    mode: current.mode,
    vllmUrl: current.vllmUrl,
    vllmModel: current.vllmModel,
  });
});

// ─── PUT /:companyId — upsert mode ──────────────────────────────────

const upsertSchema = z.object({
  mode: z.enum(['cloud', 'private', 'on_premise']),
  vllmUrl: z.string().url().max(500).nullable().optional(),
  vllmModel: z.string().min(1).max(255).nullable().optional(),
});

deploymentModeRouter.put(
  '/:companyId',
  zValidator('json', upsertSchema),
  async (c) => {
    const { userId } = c.get('user');
    const tenantId = await verifyOwnershipAndGetTenantId(
      c.req.param('companyId'),
      userId,
    );
    const input = c.req.valid('json');

    // On-premise requires an endpoint + model — protect non-technical users
    // from saving an unusable configuration.
    if (input.mode === 'on_premise') {
      if (!input.vllmUrl || !input.vllmModel) {
        throw new HTTPException(400, {
          message:
            'On-Premise mode requires a vLLM / Ollama endpoint URL and a model name.',
        });
      }
    }

    const ai = getTenantAI();
    const saved = await ai.deployment.upsertMode(
      tenantId,
      {
        mode: input.mode,
        vllmUrl: input.vllmUrl ?? null,
        vllmModel: input.vllmModel ?? null,
      },
      `user:${userId}`,
    );

    return c.json({
      mode: saved.mode,
      vllmUrl: saved.vllmUrl,
      vllmModel: saved.vllmModel,
    });
  },
);

export default deploymentModeRouter;
