import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { authMiddleware } from '../middleware/auth';
import { FTUXProcessor } from '../services/ftux-processor';
import { orchestrator, feedbackLoop } from '../agents';
import { db } from '../lib/db';
import { companies, agents as agentsTable, type BusinessPlan } from '@1person/core/db';
import { eq, and, ne } from 'drizzle-orm';
import { HTTPException } from 'hono/http-exception';
import { finalizeFtuxCompany } from '../services/ftux-finalization';

const ftuxRouter = new Hono();

// Auth middleware
ftuxRouter.use('*', authMiddleware);

const processSchema = z.object({
  prompt: z.string()
    .trim()
    .min(10, 'Describe your business in at least 10 characters')
    .max(1000),
  websiteOption: z.enum(['has_website', 'new_business', 'skip']).default('skip'),
  websiteUrl: z.string().optional(),
});

// Start FTUX processing
ftuxRouter.post('/process', zValidator('json', processSchema), async (c) => {
  const { userId } = c.get('user');
  const { prompt, websiteOption, websiteUrl } = c.req.valid('json');

  // Auto-detect website option from URL
  const effectiveWebsiteOption = websiteUrl ? 'has_website' : websiteOption;

  const processor = new FTUXProcessor();
  const sessionId = await processor.startSession(userId, prompt, {
    websiteOption: effectiveWebsiteOption,
    websiteUrl,
  });

  // Start async processing (non-blocking)
  processor.processAsync(sessionId).catch((error) => {
    console.error('FTUX processing error:', error);
  });

  return c.json({ sessionId, status: 'started' });
});

// Get processing status
ftuxRouter.get('/status/:sessionId', async (c) => {
  const sessionId = c.req.param('sessionId');

  const processor = new FTUXProcessor();
  const status = await processor.getStatus(sessionId);

  if (!status) {
    return c.json({ error: { code: 'NOT_FOUND', message: 'Session not found' } }, 404);
  }

  return c.json({
    status: status.status,
    currentStep: status.currentStep,
    completedSteps: status.completedSteps,
    progress: status.progress,
    detectedInfo: status.detectedInfo,
    websiteAnalysis: status.websiteAnalysis,
    masterPlan: status.masterPlan,
    results: status.results,
    error: status.error,
  });
});

const finalizationByCompany = new Map<string, Promise<Awaited<ReturnType<typeof finalizeFtuxCompany>>>>();

ftuxRouter.post(
  '/finalize',
  zValidator('json', z.object({ companyId: z.string().uuid() })),
  async (c) => {
    const { userId } = c.get('user');
    const { companyId } = c.req.valid('json');
    const company = await db.query.companies.findFirst({
      where: and(eq(companies.id, companyId), eq(companies.ownerId, userId)),
      columns: { id: true },
    });
    if (!company) throw new HTTPException(404, { message: 'Company not found' });

    let finalization = finalizationByCompany.get(companyId);
    if (!finalization) {
      finalization = finalizeFtuxCompany(companyId, userId);
      finalizationByCompany.set(companyId, finalization);
    }

    try {
      return c.json(await finalization);
    } finally {
      if (finalizationByCompany.get(companyId) === finalization) {
        finalizationByCompany.delete(companyId);
      }
    }
  },
);

ftuxRouter.post(
  '/approve-growth-plan',
  zValidator('json', z.object({ companyId: z.string().uuid() })),
  async (c) => {
    const { userId } = c.get('user');
    const { companyId } = c.req.valid('json');
    const company = await db.query.companies.findFirst({
      where: and(eq(companies.id, companyId), eq(companies.ownerId, userId)),
    });
    if (!company) throw new HTTPException(404, { message: 'Company not found' });

    const businessPlan = company.businessPlan as BusinessPlan | null;
    if (!businessPlan?.growthPlan) {
      throw new HTTPException(400, { message: 'Generate the Growth Plan before approving it' });
    }

    const approvedAt = new Date().toISOString();
    await db
      .update(companies)
      .set({
        businessPlan: {
          ...businessPlan,
          growthPlanVersion: businessPlan.growthPlanVersion ?? 1,
          growthPlanApprovedAt: approvedAt,
        },
        updatedAt: new Date(),
      })
      .where(eq(companies.id, companyId));

    return c.json({ approvedAt });
  },
);

// Trigger execution - Orchestrator decides workflow dynamically
const executeSchema = z.object({
  companyId: z.string().uuid(),
  goal: z.string().optional(),
  websiteUrl: z.string().optional(),
});

ftuxRouter.post('/execute', zValidator('json', executeSchema), async (c) => {
  const { companyId, goal, websiteUrl } = c.req.valid('json');

  const executionGoal = goal || 'Analyze company, create marketing strategy, and start growth execution';

  // Auto-extract Business Brain (brand voice, primary persona, products)
  // from the crawled context BEFORE the orchestrator runs — this way the
  // seed campaigns and banners that fire next already have a non-empty
  // Brain to draw from. Idempotent: if brand voice already exists we skip.
  (async () => {
    try {
      const { autoExtractBrainFromCompany } = await import('../services/brain-autoextract');
      const { db: dbInstance } = await import('../lib/db');
      const { companies } = await import('@1person/core/db');
      const { eq } = await import('drizzle-orm');
      const company = await dbInstance.query.companies.findFirst({
        where: eq(companies.id, companyId),
        columns: { id: true, name: true },
      });
      const result = await autoExtractBrainFromCompany(companyId, company?.name ?? 'Company');
      console.log(
        `[FTUX Execute] brain autoExtract — brandVoice=${result.brandVoice}, personas=${result.personas}, products=${result.products}${result.skipped ? ' (skipped, already exists)' : ''}`,
      );
    } catch (err) {
      console.warn('[FTUX Execute] brain autoExtract failed:', err);
    }
  })();

  // Orchestrator uses AI (PlannerAgent) to decide what to run
  // No hardcoded engine sequence - AI decides based on context
  orchestrator.executeGoal(companyId, executionGoal, {
    websiteUrl,
    companyId,
  }).then((result) => {
    console.log(`[FTUX Execute] ${result.summary}`);
  }).catch((error) => {
    console.error('[FTUX Execute] Orchestrator failed:', error);
  });

  // Auto-create marketing campaigns from master plan
  // This runs in parallel with the orchestrator — user sees campaigns immediately
  (async () => {
    try {
      const { marketingAutonomous } = await import('../services/marketing-autonomous');
      const { buildBusinessContext } = await import('../services/business-context');
      const ctx = await buildBusinessContext(companyId);
      const company = await db.query.companies.findFirst({
        where: eq(companies.id, companyId),
        columns: { businessPlan: true },
      });
      const growthPlan = (company?.businessPlan as BusinessPlan | null)?.growthPlan;
      const firstPriority = (items: Array<{ action: string; priority: string }> | undefined) =>
        items?.find((item) => item.priority === 'high') ?? items?.[0];
      const contentPriority = firstPriority(growthPlan?.contentPlan.items);
      const socialPriority = firstPriority(growthPlan?.socialMediaPlan.items);

      // Turn the approved executive plan into initial campaigns. Fallbacks
      // cover companies created before persisted Growth Plans existed.
      const campaigns = [
        {
          goal: contentPriority?.action || `Get leads for ${ctx.companyName}`,
          audience: (Array.isArray(ctx.targetAudience) ? ctx.targetAudience.join(', ') : ctx.targetAudience) || 'potential customers',
          reason: contentPriority
            ? `Approved Growth Plan priority: ${contentPriority.action}`
            : 'Initial marketing setup - attract first customers',
          suggestedBudget: 10,
          channel: 'meta',
        },
        {
          goal: socialPriority?.action || `Build brand awareness for ${ctx.companyName}`,
          audience: (Array.isArray(ctx.targetAudience) ? ctx.targetAudience.join(', ') : ctx.targetAudience) || 'industry professionals',
          reason: socialPriority
            ? `Approved Growth Plan priority: ${socialPriority.action}`
            : 'Brand visibility - establish online presence',
          suggestedBudget: 5,
          channel: 'linkedin',
        },
      ];

      // W1B.4 — emit step events via the shared event bus so these seed
      // campaigns show up in the Live Workflow Panel like user-triggered
      // ones. Without this, onboarding auto-campaigns appear fully-formed
      // and the user never sees "AI working" realtime.
      const { eventBus } = await import('../services/event-bus');

      for (const opportunity of campaigns) {
        try {
          const campaignId = await marketingAutonomous.createAutonomousCampaign(
            companyId,
            opportunity,
            async (ev) => {
              eventBus.publish({
                type: 'system:broadcast',
                companyId,
                source: 'ftux-seed',
                payload: {
                  kind: 'campaign:step',
                  // onStep fires before we know the campaignId; we rely on
                  // the payload carrying the step + status + timestamp.
                  // The progress panel uses a *latest* seed campaign fallback
                  // when it subscribes before the row exists.
                  ...ev,
                },
              });
            },
          );
          console.log(`[FTUX] Auto-created campaign: ${campaignId}`);
        } catch (err) {
          console.warn('[FTUX] Campaign creation failed:', err);
        }
      }

      // Auto-create a video script
      try {
        const { generateScript, breakIntoScenes } = await import('../services/video-engine');
        const { db: dbInstance } = await import('../lib/db');
        const { videoProjects } = await import('@1person/core/db');

        const script = await generateScript(companyId, { format: '30s', aspectRatio: '9:16' });
        const scenes = await breakIntoScenes(script, '30s');

        await dbInstance.insert(videoProjects).values({
          companyId,
          title: `${ctx.companyName} - Introduction`,
          format: '30s',
          aspectRatio: '9:16',
          status: 'scenes',
          script,
          scenes: scenes as any,
        });

        console.log('[FTUX] Auto-created video project');
      } catch (err) {
        console.warn('[FTUX] Video creation failed:', err);
      }
    } catch (err) {
      console.warn('[FTUX] Marketing auto-setup failed:', err);
    }
  })();

  return c.json({
    status: 'started',
    message: 'AI orchestrator activated - creating campaigns, banners, and content automatically',
  });
});

// Trigger feedback loop for continuous improvement
ftuxRouter.post('/feedback', zValidator('json', z.object({ companyId: z.string().uuid() })), async (c) => {
  const { companyId } = c.req.valid('json');

  // Run feedback evaluation (async)
  feedbackLoop.evaluate(companyId).then((result) => {
    console.log(`[Feedback] ${result.issues.length} issues found, ${result.actionsTriggered.length} actions triggered`);
  }).catch((error) => {
    console.error('[Feedback] Evaluation failed:', error);
  });

  return c.json({ status: 'started', message: 'Feedback evaluation triggered' });
});

// Customize AI team based on user text description
const customizeSchema = z.object({
  companyId: z.string().uuid(),
  currentTeam: z.array(z.any()),
  request: z.string().min(3),
  companyName: z.string().optional(),
});

ftuxRouter.post('/customize-team', zValidator('json', customizeSchema), async (c) => {
  const { userId } = c.get('user');
  const { companyId, currentTeam, request, companyName } = c.req.valid('json');
  const company = await db.query.companies.findFirst({
    where: and(eq(companies.id, companyId), eq(companies.ownerId, userId)),
    columns: { id: true },
  });
  if (!company) throw new HTTPException(404, { message: 'Company not found' });
  const { llmGenerate, extractJSON } = await import('../lib/llm');

  const teamList = currentTeam.map((a: any) =>
    `${a.name} - ${a.title} (role: ${a.role}, id: ${a.id})`
  ).join('\n');

  try {
    const { text } = await llmGenerate([{
      role: 'system',
      content: 'You modify an AI team structure. Return the COMPLETE updated team as JSON array. Keep existing agents unless user asks to remove them.',
    }, {
      role: 'user',
      content: `Current team for "${companyName || 'company'}":
${teamList}

User request: "${request}"

Apply the change and return the FULL updated team as JSON array:
[{
  "id": "existing_id_or_new",
  "name": "Full Name",
  "role": "ceo|marketing_manager|content_creator|ads_specialist|analyst|sales_manager|support|developer|custom",
  "title": "Job Title",
  "emoji": "emoji",
  "color": "#hex",
  "supervisorId": "id of supervisor or null for CEO",
  "responsibilities": ["resp1", "resp2"]
}]

Rules:
- Keep CEO always
- Keep all existing agents unless user asks to remove
- Add/modify only what user requested
- Use realistic names
- HIERARCHY IS CRITICAL:
  - CEO has no supervisor (supervisorId: null)
  - Managers report to CEO (supervisorId = CEO's id)
  - Workers report to the MOST RELEVANT manager
  - Example: "Customer Support" → reports to Sales Lead
  - Example: "Content Writer" → reports to Marketing Strategist
  - Example: "Data Analyst" → reports to CEO
- If user says "reports to X" or "under X", use that specific supervisor
- If user doesn't specify, choose the most logical manager based on the role`,
    }], { maxTokens: 1500 });

    const agents = extractJSON(text);
    if (agents && Array.isArray(agents) && agents.length > 0) {
      const validRoles = new Set([
        'ceo', 'marketing_manager', 'content_creator', 'ads_specialist',
        'analyst', 'sales_manager', 'support', 'developer', 'custom',
      ]);
      const existing = await db.query.agents.findMany({
        where: eq(agentsTable.companyId, companyId),
      });
      const existingById = new Map(existing.map((agent) => [agent.id, agent]));
      const sourceToPersistedId = new Map<string, string>();
      const keptIds = new Set<string>();
      const candidates = (agents as any[]).map((candidate, index) => ({
        candidate,
        sourceId: String(candidate.id || `new-${index}`),
      }));

      // Persist identity first, then supervisors. AI may reference a newly added
      // teammate before that teammate has a database UUID.
      await db.transaction(async (tx) => {
        for (const { candidate, sourceId } of candidates) {
          const current = existingById.get(sourceId);
          const role = validRoles.has(candidate.role) ? candidate.role : 'custom';
          const responsibilities = Array.isArray(candidate.responsibilities)
            ? candidate.responsibilities.filter((item: unknown) => typeof item === 'string' && item.trim())
            : [];
          const values = {
            name: String(candidate.name || current?.name || 'AI Teammate').slice(0, 100),
            role: role as any,
            title: String(candidate.title || current?.title || role.replaceAll('_', ' ')).slice(0, 100),
            description: responsibilities.join('. ') || current?.description,
            capabilities: responsibilities.map((name: string) => ({
              name,
              level: 'advanced' as const,
              description: name,
            })),
            color: /^#[0-9a-f]{6}$/i.test(String(candidate.color))
              ? String(candidate.color)
              : current?.color || '#6366f1',
            status: 'ready' as const,
            level: role === 'ceo' ? 0 : role.includes('manager') ? 1 : 2,
            updatedAt: new Date(),
          };

          if (current) {
            await tx.update(agentsTable).set(values).where(eq(agentsTable.id, current.id));
            sourceToPersistedId.set(sourceId, current.id);
            keptIds.add(current.id);
          } else {
            const [created] = await tx.insert(agentsTable).values({
              companyId,
              ...values,
              supervisorId: null,
              budgetLimit: '100',
            } as any).returning();
            if (created) {
              sourceToPersistedId.set(sourceId, created.id);
              keptIds.add(created.id);
            }
          }
        }

        for (const { candidate, sourceId } of candidates) {
          const persistedId = sourceToPersistedId.get(sourceId);
          if (!persistedId) continue;
          const supervisorId = candidate.role === 'ceo'
            ? null
            : sourceToPersistedId.get(String(candidate.supervisorId || '')) || null;
          await tx.update(agentsTable).set({ supervisorId }).where(eq(agentsTable.id, persistedId));
        }

        for (const current of existing) {
          if (!keptIds.has(current.id)) {
            await tx.update(agentsTable).set({ status: 'archived', updatedAt: new Date() })
              .where(eq(agentsTable.id, current.id));
          }
        }
      });

      const persisted = await db.query.agents.findMany({
        where: and(eq(agentsTable.companyId, companyId), ne(agentsTable.status, 'archived')),
      });
      return c.json({
        agents: persisted.map((agent) => ({
          id: agent.id,
          name: agent.name,
          role: agent.role,
          title: agent.title || agent.role.replaceAll('_', ' '),
          emoji: '',
          color: agent.color || '#6366f1',
          supervisorId: agent.supervisorId,
          responsibilities: Array.isArray(agent.capabilities)
            ? agent.capabilities.map((capability) => capability.name)
            : [],
        })),
      });
    }
  } catch (err) {
    console.warn('[FTUX] Team customization failed:', err);
    return c.json({ message: 'Your AI team could not be updated' }, 500);
  }

  return c.json({ message: 'AI did not return a valid team structure' }, 422);
});

export default ftuxRouter;
