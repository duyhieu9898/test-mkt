/**
 * Screenshot → Vision analyzer (C1) — the zero-connect path for non-tech founders.
 *
 * Instead of wiring OAuth/tokens, the founder just pastes or drops a screenshot
 * of Facebook Ads Manager / GA4 / any dashboard, and Claude (vision) reads the
 * numbers and returns an analysis grounded in their Brand IQ + an optional
 * expert playbook (e.g. `ads`, `analytics`).
 *
 *   POST /vision/:companyId/analyze  { imageBase64, mediaType, request?, skill? }
 */
import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import Anthropic from '@anthropic-ai/sdk';
import { db } from '../lib/db';
import { companies } from '@1person/core/db';
import { renderSkillKnowledge, MARKETING_SKILL_KNOWLEDGE } from '@1person/core';
import { authMiddleware } from '../middleware/auth';
import { HTTPException } from 'hono/http-exception';
import { buildBusinessContext } from '../services/business-context';

const anthropic = new Anthropic();
const visionRouter = new Hono();
visionRouter.use('*', authMiddleware);

const MEDIA_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'] as const;
const MAX_BASE64_LEN = 7_000_000; // ~5MB image after decode — Anthropic's per-image cap

async function verifyOwnership(companyId: string, userId: string) {
  const company = await db.query.companies.findFirst({
    where: eq(companies.id, companyId),
    columns: { id: true, ownerId: true },
  });
  if (!company) throw new HTTPException(404, { message: 'Company not found' });
  if (company.ownerId !== userId) throw new HTTPException(403, { message: 'Access denied' });
}

visionRouter.post(
  '/:companyId/analyze',
  zValidator(
    'json',
    z.object({
      imageBase64: z.string().min(100),
      mediaType: z.enum(MEDIA_TYPES),
      request: z.string().max(2000).optional(),
      skill: z.string().max(64).optional(),
    }),
  ),
  async (c) => {
    const { userId } = c.get('user');
    const companyId = c.req.param('companyId');
    await verifyOwnership(companyId, userId);
    const { imageBase64, mediaType, request, skill } = c.req.valid('json');

    // Accept a data URL or raw base64.
    const data = imageBase64.replace(/^data:[^;]+;base64,/, '');
    if (data.length > MAX_BASE64_LEN) {
      throw new HTTPException(413, { message: 'Image too large — please use a screenshot under ~5MB.' });
    }

    const framework = skill && MARKETING_SKILL_KNOWLEDGE[skill] ? renderSkillKnowledge(skill) : '';
    const ctx = await buildBusinessContext(companyId, 'admin').catch(() => null);
    const businessBlock = ctx ? ctx.fullContext.slice(0, 2500) : '';

    const systemPrompt = `You are a senior marketing analyst. The founder has pasted a SCREENSHOT (e.g. Facebook Ads Manager, Google Analytics, a report, a competitor page). Read every number, label, and chart you can see, then analyze it for them.

${framework ? framework + '\n\n' : ''}${businessBlock ? `=== COMPANY CONTEXT (Brand IQ, audience, positioning) ===\n${businessBlock}\n\n` : ''}=== OUTPUT (Markdown) ===
1. **What this shows** — one short paragraph describing the screen and the key metrics you can read.
2. **Key findings** — 3-6 bullets with the actual numbers from the image (call out anything notably good or bad).
3. **Recommended actions** — 3-5 concrete, prioritized next steps for this founder, in their brand context.
If the image is unreadable or not a marketing dashboard, say so plainly. Match the company's language. Never invent numbers you cannot see.`;

    const userText =
      request?.trim() ||
      'Analyze this screenshot and tell me what is working, what is not, and what to do next.';

    try {
      const response = await anthropic.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 2000,
        system: systemPrompt,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'image', source: { type: 'base64', media_type: mediaType, data } },
              { type: 'text', text: userText },
            ],
          },
        ],
      });
      const block = response.content[0];
      const analysis = block && block.type === 'text' ? block.text : '';
      if (!analysis) throw new Error('No analysis returned');
      return c.json({ data: { analysis, model: 'claude-sonnet-4-20250514', skill: skill ?? null } });
    } catch (e) {
      throw new HTTPException(502, { message: `Vision analysis failed: ${(e as Error).message}` });
    }
  },
);

export default visionRouter;
