/**
 * Sales API — deal pipeline + AI Deal Assistant.
 * Route path: /api/v1/sales/:companyId/...
 * See docs/architecture/10-venture-ceo-ia.md §6 (Đợt 3).
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
import { llmGenerate, extractJSON } from '../lib/llm';
import { ensureSufficientCredits, chargeFixedCredits } from '../lib/credits';

const salesRouter = new Hono();
salesRouter.use('*', authMiddleware);

async function verifyOwnership(companyId: string, userId: string): Promise<string> {
  const company = await db.query.companies.findFirst({
    where: eq(companies.id, companyId),
    columns: { id: true, name: true, ownerId: true },
  });
  if (!company) throw new HTTPException(404, { message: 'Company not found' });
  if (company.ownerId !== userId) throw new HTTPException(403, { message: 'You do not own this company' });
  return ensureTenantForCompany(company.id, company.name);
}

const STAGES = ['discovery', 'qualified', 'proposal', 'negotiation', 'closed_won', 'closed_lost'] as const;

const dealSchema = z.object({
  title: z.string().min(1).max(255),
  contactName: z.string().max(255).nullable().optional(),
  contactEmail: z.string().max(255).nullable().optional(),
  company: z.string().max(255).nullable().optional(),
  value: z.string().max(64).nullable().optional(),
  currency: z.string().max(8).optional(),
  stage: z.enum(STAGES).optional(),
  closeDate: z.string().datetime().nullable().optional(),
  notes: z.string().max(8000).nullable().optional(),
  nextAction: z.string().max(500).nullable().optional(),
  nextActionDueAt: z.string().datetime().nullable().optional(),
});

function coerce(input: any) {
  return {
    ...input,
    closeDate: input.closeDate ? new Date(input.closeDate) : input.closeDate,
    nextActionDueAt: input.nextActionDueAt ? new Date(input.nextActionDueAt) : input.nextActionDueAt,
  };
}

// ─── Deals CRUD ────────────────────────────────────────────────────

salesRouter.get('/:companyId/deals', async (c) => {
  const { userId } = c.get('user');
  const tenantId = await verifyOwnership(c.req.param('companyId'), userId);
  const data = await getTenantAI().deals.list(tenantId);
  return c.json({ data });
});

salesRouter.post('/:companyId/deals', zValidator('json', dealSchema), async (c) => {
  const { userId } = c.get('user');
  const tenantId = await verifyOwnership(c.req.param('companyId'), userId);
  const deal = await getTenantAI().deals.create(tenantId, coerce(c.req.valid('json')), `user:${userId}`);
  return c.json(deal, 201);
});

salesRouter.get('/:companyId/deals/:id', async (c) => {
  const { userId } = c.get('user');
  const tenantId = await verifyOwnership(c.req.param('companyId'), userId);
  const ai = getTenantAI();
  const deal = await ai.deals.get(tenantId, c.req.param('id'));
  if (!deal) throw new HTTPException(404, { message: 'Deal not found' });
  const events = await ai.deals.listEvents(deal.id, 50);
  return c.json({ deal, events });
});

salesRouter.patch('/:companyId/deals/:id', zValidator('json', dealSchema.partial()), async (c) => {
  const { userId } = c.get('user');
  const tenantId = await verifyOwnership(c.req.param('companyId'), userId);
  const deal = await getTenantAI().deals.update(tenantId, c.req.param('id'), coerce(c.req.valid('json')), `user:${userId}`);
  return c.json(deal);
});

salesRouter.delete('/:companyId/deals/:id', async (c) => {
  const { userId } = c.get('user');
  const tenantId = await verifyOwnership(c.req.param('companyId'), userId);
  await getTenantAI().deals.delete(tenantId, c.req.param('id'), `user:${userId}`);
  return c.json({ success: true });
});

// ─── AI Deal Assistant ─────────────────────────────────────────────

const assistSchema = z.object({
  focus: z.enum(['next_action', 'email_draft', 'objection_handling']).optional(),
});

salesRouter.post('/:companyId/deals/:id/assist', zValidator('json', assistSchema), async (c) => {
  const { userId } = c.get('user');
  const companyId = c.req.param('companyId');
  const dealId = c.req.param('id');
  const tenantId = await verifyOwnership(companyId, userId);
  const { focus } = c.req.valid('json');

  await ensureSufficientCredits(companyId, 3);

  const ai = getTenantAI();
  const deal = await ai.deals.get(tenantId, dealId);
  if (!deal) throw new HTTPException(404, { message: 'Deal not found' });

  const [events, playbook, brain] = await Promise.all([
    ai.deals.listEvents(dealId, 20),
    ai.brain.getSalesPlaybook(tenantId).catch(() => null),
    ai.brain.getSnapshot(tenantId).catch(() => null),
  ]);
  const voice = (brain as any)?.brandVoice;

  const system = `You are an expert B2B sales coach embedded in 1Person. Given a deal, its history, and the company's Sales Playbook, recommend the single best next action and draft an email the CEO can copy-paste to the prospect. Output strict JSON only — no prose outside the JSON.`;

  const user = `DEAL:
${JSON.stringify({ title: deal.title, stage: deal.stage, contactName: deal.contactName, contactEmail: deal.contactEmail, company: deal.company, value: deal.value, currency: deal.currency, notes: deal.notes, nextAction: deal.nextAction }, null, 2)}

RECENT EVENTS (most recent first):
${events.map((e) => `- [${e.type}] ${JSON.stringify(e.payload)}`).join('\n') || '(none yet)'}

SALES PLAYBOOK:
${playbook ? JSON.stringify(playbook, null, 2) : '(no playbook — use standard B2B best practices)'}

BRAND VOICE (use for email tone):
${voice ? JSON.stringify(voice, null, 2) : '(default professional tone)'}

FOCUS: ${focus ?? 'next_action'}

Return JSON with this exact shape:
{
  "nextAction": "concrete one-line action the CEO should take next",
  "reasoning": "2-3 sentences on why, referencing the stage + history",
  "likelyObjection": "optional: the objection most likely to come up next, or null",
  "objectionResponse": "optional: a scripted response from the playbook, or null",
  "emailDraft": { "subject": "...", "body": "full email body, ready to copy-paste" },
  "confidence": 0-100
}`;

  const response = await llmGenerate(
    [{ role: 'system', content: system }, { role: 'user', content: user }],
    {
      featureKey: 'sales_deal_assistant',
      json: true,
      traceName: 'sales.deal_assistant',
      metadata: { dealId, companyId, stage: deal.stage },
    },
  );

  const parsed = extractJSON(response.text);
  if (!parsed || !parsed.nextAction || !parsed.emailDraft) {
    throw new HTTPException(502, { message: 'AI returned an unreadable response. Please try again.' });
  }

  await chargeFixedCredits(companyId, 3, {
    featureKey: 'sales_deal_assistant',
    refKind: 'deal',
    refId: dealId,
    actor: `user:${userId}`,
  });
  await ai.deals.appendEvent(dealId, {
    type: 'ai_suggestion',
    payload: { suggestion: parsed, traceId: response.traceId },
  });

  return c.json(parsed);
});

export default salesRouter;
