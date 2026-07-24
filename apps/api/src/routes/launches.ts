/**
 * Block 8 — Campaign Launcher routes.
 *
 *   POST /launches/{cid}      — start a new launch
 *   GET  /launches/{cid}      — list past launches
 *   GET  /launches/{cid}/{id} — poll one launch (UI re-fetches every 2s)
 */
import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { eq, desc } from 'drizzle-orm';
import { db } from '../lib/db';
import { companies, campaignLaunches } from '@1person/core/db';
import { authMiddleware } from '../middleware/auth';
import { HTTPException } from 'hono/http-exception';
import { startLaunch, getLaunch } from '../services/launch-orchestrator';
import { buildEffectiveSourceContext } from '../services/source-content-import';
import { ensureTenantForCompany } from '../lib/tenant-ai';
import { generateLaunchSuggestions } from '../services/launch-suggestions';
import { chargeFixedCredits, ensureSufficientCredits } from '../lib/credits';
import { FIXED_CREDIT_COSTS, getLaunchCampaignCost } from '../lib/credit-costs';

const launchesRouter = new Hono();

launchesRouter.use('*', authMiddleware);

async function verifyOwnership(companyId: string, userId: string) {
  const company = await db.query.companies.findFirst({
    where: eq(companies.id, companyId),
    columns: { id: true, name: true, ownerId: true },
  });
  if (!company) throw new HTTPException(404, { message: 'Company not found' });
  if (company.ownerId !== userId) throw new HTTPException(403, { message: 'Access denied' });
  return company;
}

launchesRouter.post(
  '/:companyId',
  zValidator(
    'json',
    z.object({
      keyword: z.string().trim().min(3).max(1200),
      brief: z.string().max(2000).optional(),
      googleDriveFileId: z.string().min(5).max(200).optional(),
      googleDriveFileName: z.string().max(255).optional(),
      googleDriveUrl: z.string().url().max(1000).optional(),
      oneDriveFileId: z.string().min(5).max(200).optional(),
      oneDriveFileName: z.string().max(255).optional(),
      imageMode: z.enum(['ai', 'uploaded']).default('ai').optional(),
      assetIds: z.array(z.string().uuid()).max(3).optional(),
      videoReferenceImage: z.object({
        type: z.enum(['asset', 'google_drive', 'onedrive']),
        assetId: z.string().uuid().optional(),
        fileId: z.string().min(5).max(300).optional(),
        fileName: z.string().max(255).optional(),
      }).optional(),
      language: z.string().optional(),
      targets: z.object({
        wordpress: z.boolean().default(false),
        facebook: z.boolean().default(false),
        linkedin: z.boolean().default(false),
        instagram: z.boolean().default(false),
        video: z.boolean().optional().default(false),
      }),
    }),
  ),
  async (c) => {
    const { userId } = c.get('user');
    const companyId = c.req.param('companyId');
    await verifyOwnership(companyId, userId);
    const body = c.req.valid('json');
    const creditCost = getLaunchCampaignCost({
      // Video credits are charged by the render worker only after the
      // generated video is completed and stored successfully.
      includeVideo: false,
      imageMode: body.imageMode,
    });
    const requiredCredits = body.targets.video ? creditCost + FIXED_CREDIT_COSTS.campaignVideo : creditCost;
    await ensureSufficientCredits(companyId, requiredCredits);
    const effectiveBrief = await buildEffectiveSourceContext({
      companyId,
      userId,
      input: body,
    });

    const result = await startLaunch({
      companyId,
      userId,
      keyword: body.keyword,
      brief: effectiveBrief,
      imageMode: body.imageMode,
      assetIds: body.assetIds,
      videoReferenceImage: body.videoReferenceImage?.type === 'asset' && body.videoReferenceImage.assetId
        ? { type: 'asset', assetId: body.videoReferenceImage.assetId }
        : body.videoReferenceImage?.type === 'google_drive' && body.videoReferenceImage.fileId
          ? { type: 'google_drive', fileId: body.videoReferenceImage.fileId, fileName: body.videoReferenceImage.fileName }
          : body.videoReferenceImage?.type === 'onedrive' && body.videoReferenceImage.fileId
            ? { type: 'onedrive', fileId: body.videoReferenceImage.fileId, fileName: body.videoReferenceImage.fileName }
            : undefined,
      language: body.language,
      targets: body.targets,
    });
    await chargeFixedCredits(companyId, creditCost, {
      featureKey: 'campaign_launcher',
      tier: body.targets.video ? 'premium' : 'balanced',
      refKind: 'campaign_launch',
      refId: result.launchId,
      actor: `user:${userId}`,
      note: body.targets.video
        ? 'Campaign Launcher with AI video'
        : 'Campaign Launcher',
    });
    return c.json({ data: result });
  },
);

launchesRouter.get('/:companyId', async (c) => {
  const { userId } = c.get('user');
  const companyId = c.req.param('companyId');
  await verifyOwnership(companyId, userId);
  const rows = await db
    .select()
    .from(campaignLaunches)
    .where(eq(campaignLaunches.companyId, companyId))
    .orderBy(desc(campaignLaunches.createdAt))
    .limit(50);
  return c.json({ data: rows });
});

launchesRouter.get('/:companyId/suggestions', async (c) => {
  const { userId } = c.get('user');
  const companyId = c.req.param('companyId');
  const company = await verifyOwnership(companyId, userId);
  const tenantId = await ensureTenantForCompany(company.id, company.name);
  const suggestions = await generateLaunchSuggestions({
    companyId,
    tenantId,
    language: c.req.query('language')?.trim(),
  });
  return c.json({ data: suggestions });
});

launchesRouter.get('/:companyId/:id', async (c) => {
  const { userId } = c.get('user');
  const companyId = c.req.param('companyId');
  const id = c.req.param('id');
  await verifyOwnership(companyId, userId);
  const row = await getLaunch(companyId, id);
  if (!row) throw new HTTPException(404, { message: 'Launch not found' });
  return c.json({ data: row });
});

export default launchesRouter;
