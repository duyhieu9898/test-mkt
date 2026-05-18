/**
 * Brand IQ routes — Block 2.
 *
 * Founder owns one active profile per company. Generate it from URL +
 * samples, then refine each facet (voice / personas / style / visual /
 * OKRs) by hand. The active profile is auto-injected into every
 * agent's business context.
 */
import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { db } from '../lib/db';
import { companies } from '@1person/core/db';
import { authMiddleware } from '../middleware/auth';
import { HTTPException } from 'hono/http-exception';
import {
  generateBrandIq,
  getActiveBrandIq,
  updateBrandIqFacet,
} from '../services/brand-iq-extractor';

const brandIqRouter = new Hono();

brandIqRouter.use('*', authMiddleware);

async function verifyOwnership(companyId: string, userId: string) {
  const company = await db.query.companies.findFirst({
    where: eq(companies.id, companyId),
    columns: { id: true, ownerId: true },
  });
  if (!company) throw new HTTPException(404, { message: 'Company not found' });
  if (company.ownerId !== userId) throw new HTTPException(403, { message: 'Access denied' });
}

/* ─── Read ───────────────────────────────────────────────────────── */

brandIqRouter.get('/:companyId/active', async (c) => {
  const { userId } = c.get('user');
  const companyId = c.req.param('companyId');
  await verifyOwnership(companyId, userId);
  const profile = await getActiveBrandIq(companyId);
  return c.json({ data: profile });
});

/* ─── Generate / regenerate ──────────────────────────────────────── */

brandIqRouter.post(
  '/:companyId/generate',
  zValidator(
    'json',
    z.object({
      url: z.string().url().optional(),
      samples: z.array(z.string().min(50)).max(5).optional(),
    }),
  ),
  async (c) => {
    const { userId } = c.get('user');
    const companyId = c.req.param('companyId');
    await verifyOwnership(companyId, userId);
    const body = c.req.valid('json');
    try {
      const profile = await generateBrandIq(companyId, body);
      return c.json({ data: profile });
    } catch (e) {
      throw new HTTPException(400, { message: (e as Error).message });
    }
  },
);

/* ─── Manual facet edits ─────────────────────────────────────────── */

const voiceSchema = z.object({
  adjectives: z.array(z.string()).max(8),
  description: z.string().min(10).max(800),
  firstPerson: z.enum(['we', 'i', 'the_team', 'none']),
  sentenceLength: z.enum(['short', 'medium', 'long', 'varied']),
  signaturePhrases: z.array(z.string()).max(8),
  avoidPhrases: z.array(z.string()).max(8),
  emojiUsage: z.enum(['none', 'sparingly', 'frequent']),
});

const personaSchema = z.object({
  id: z.string().min(1).max(50),
  name: z.string().min(1).max(80),
  role: z.string().max(120),
  painPoints: z.array(z.string()).max(6),
  goals: z.array(z.string()).max(6),
  channels: z.array(z.string()).max(6),
});

const styleSchema = z.object({
  headlineRules: z.array(z.string()).max(6),
  bodyRules: z.array(z.string()).max(6),
  ctaRules: z.array(z.string()).max(6),
  formattingPreferences: z.array(z.string()).max(6),
});

const visualSchema = z.object({
  primaryColor: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  secondaryColor: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  accentColors: z.array(z.string().regex(/^#[0-9a-fA-F]{6}$/)).max(5),
  fontHeadline: z.string().nullable(),
  fontBody: z.string().nullable(),
  imageMood: z.string().max(200),
  logoUrl: z.string().url().nullable(),
});

const okrSchema = z.object({
  id: z.string().min(1).max(50),
  objective: z.string().min(3).max(200),
  keyResults: z.array(z.string()).max(6),
  quarter: z.string().regex(/^\d{4}-Q[1-4]$/),
});

const patchSchema = z.object({
  voice: voiceSchema.optional(),
  audiencePersonas: z.array(personaSchema).max(8).optional(),
  styleGuide: styleSchema.optional(),
  visualIdentity: visualSchema.optional(),
  okrs: z.array(okrSchema).max(8).optional(),
  tagline: z.string().max(120).nullable().optional(),
});

brandIqRouter.put(
  '/:companyId/active',
  zValidator('json', patchSchema),
  async (c) => {
    const { userId } = c.get('user');
    const companyId = c.req.param('companyId');
    await verifyOwnership(companyId, userId);
    const patch = c.req.valid('json');
    try {
      const updated = await updateBrandIqFacet(companyId, patch);
      return c.json({ data: updated });
    } catch (e) {
      throw new HTTPException(400, { message: (e as Error).message });
    }
  },
);

export default brandIqRouter;
