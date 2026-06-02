/**
 * Marketing Playbooks Studio (P6) — lets the founder invoke ANY of the 41 expert
 * marketing skills directly, the way the source library works, but grounded in
 * their Brand IQ + business context and rendered in our UI.
 *
 *   GET  /marketing-skills/catalog            -> categorized list (metadata only)
 *   POST /marketing-skills/:companyId/run     -> { skill, request } -> expert deliverable
 *
 * Reuses the P1 knowledge layer (renderSkillKnowledge) + Brand IQ injection.
 */
import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { db } from '../lib/db';
import { companies } from '@1person/core/db';
import {
  listSkillCatalog,
  renderSkillKnowledge,
  skillLabel,
  MARKETING_SKILL_KNOWLEDGE,
} from '@1person/core';
import { authMiddleware } from '../middleware/auth';
import { HTTPException } from 'hono/http-exception';
import { llmGenerate } from '../lib/llm';
import { buildBusinessContext } from '../services/business-context';

const marketingSkillsRouter = new Hono();
marketingSkillsRouter.use('*', authMiddleware);

async function verifyOwnership(companyId: string, userId: string) {
  const company = await db.query.companies.findFirst({
    where: eq(companies.id, companyId),
    columns: { id: true, ownerId: true },
  });
  if (!company) throw new HTTPException(404, { message: 'Company not found' });
  if (company.ownerId !== userId) throw new HTTPException(403, { message: 'Access denied' });
}

/* ─── Catalog (metadata only — never ship full framework bodies to the client) ─ */
marketingSkillsRouter.get('/catalog', (c) => {
  return c.json({ data: listSkillCatalog() });
});

/* ─── Run a playbook ─────────────────────────────────────────────── */
marketingSkillsRouter.post(
  '/:companyId/run',
  zValidator(
    'json',
    z.object({
      skill: z.string().min(1).max(64),
      request: z.string().min(3).max(4000),
    }),
  ),
  async (c) => {
    const { userId } = c.get('user');
    const companyId = c.req.param('companyId');
    await verifyOwnership(companyId, userId);
    const { skill, request } = c.req.valid('json');

    if (!MARKETING_SKILL_KNOWLEDGE[skill]) {
      throw new HTTPException(400, { message: `Unknown playbook "${skill}"` });
    }

    const framework = renderSkillKnowledge(skill);
    const ctx = await buildBusinessContext(companyId, 'admin').catch(() => null);
    const businessBlock = ctx ? ctx.fullContext.slice(0, 3500) : '';

    const systemPrompt = `${framework}

=== COMPANY CONTEXT (use this — it already contains Brand IQ, audience, positioning) ===
${businessBlock || '(no business context yet — make reasonable assumptions and note them)'}

=== OUTPUT RULES ===
- Produce the actual deliverable the founder asked for, applying the playbook above end to end.
- Match the brand voice + customer language from the company context. If the context implies a language other than English, write in that language.
- Use clean Markdown (headings, bullet lists, tables where useful). Do not ask clarifying questions — make sensible assumptions and state them briefly if needed.`;

    const result = await llmGenerate(
      [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: request },
      ],
      { featureKey: 'marketing_skill_run', maxTokens: 2600, metadata: { skill } },
    );

    return c.json({
      data: { skill, skillLabel: skillLabel(skill), output: result.text, model: result.model },
    });
  },
);

export default marketingSkillsRouter;
