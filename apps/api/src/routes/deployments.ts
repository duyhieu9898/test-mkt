/**
 * Deployment API Routes
 *
 * Endpoints for deploying and managing landing page deployments
 */

import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { eq, and } from 'drizzle-orm';
import { db } from '../lib/db';
import { companies, landingPages } from '@1person/core/db';
import { authMiddleware } from '../middleware/auth';
import { HTTPException } from 'hono/http-exception';
import { deploymentService } from '../services/deployment-service';
import { pageRendererService } from '../services/page-renderer-service';

const deploymentsRouter = new Hono();

// Apply auth to all routes
deploymentsRouter.use('*', authMiddleware);

// =============================================================================
// SCHEMAS
// =============================================================================

const deploySchema = z.object({
  provider: z.enum(['vercel', 'cloudflare', 'custom']),
  subdomain: z.string().min(3).max(50).optional(),
  customDomain: z.string().max(255).optional(),
});

const configureDomainSchema = z.object({
  domain: z.string().min(4).max(255),
});

const rollbackSchema = z.object({
  versionId: z.string().uuid(),
});

// =============================================================================
// HELPERS
// =============================================================================

const checkPageOwnership = async (pageId: string, userId: string) => {
  const page = await db.query.landingPages.findFirst({
    where: eq(landingPages.id, pageId),
    with: { company: true },
  });

  if (!page) {
    throw new HTTPException(404, { message: 'Landing page not found' });
  }

  if (page.company.ownerId !== userId) {
    throw new HTTPException(403, { message: 'Access denied' });
  }

  return page;
};

// =============================================================================
// ROUTES
// =============================================================================

/**
 * POST /deployments/:pageId/deploy
 * Deploy a landing page to a hosting provider
 */
deploymentsRouter.post(
  '/:pageId/deploy',
  zValidator('json', deploySchema),
  async (c) => {
    const { userId } = c.get('user');
    const pageId = c.req.param('pageId');
    const data = c.req.valid('json');

    await checkPageOwnership(pageId, userId);

    const result = await deploymentService.deploy(pageId, {
      provider: data.provider,
      subdomain: data.subdomain,
      customDomain: data.customDomain,
    });

    if (!result.success) {
      throw new HTTPException(500, { message: result.message || 'Deployment failed' });
    }

    return c.json({
      success: true,
      data: result,
      message: 'Deployment initiated',
    });
  }
);

/**
 * GET /deployments/:pageId
 * Get all deployments for a landing page
 */
deploymentsRouter.get('/:pageId', async (c) => {
  const { userId } = c.get('user');
  const pageId = c.req.param('pageId');

  await checkPageOwnership(pageId, userId);

  const deployments = await deploymentService.getDeployments(pageId);

  return c.json({
    success: true,
    data: deployments,
    count: deployments.length,
  });
});

/**
 * GET /deployments/:pageId/versions
 * Get all versions for a landing page
 */
deploymentsRouter.get('/:pageId/versions', async (c) => {
  const { userId } = c.get('user');
  const pageId = c.req.param('pageId');

  await checkPageOwnership(pageId, userId);

  const versions = await deploymentService.getVersions(pageId);

  return c.json({
    success: true,
    data: versions,
    count: versions.length,
  });
});

/**
 * POST /deployments/:pageId/rollback
 * Rollback to a previous version
 */
deploymentsRouter.post(
  '/:pageId/rollback',
  zValidator('json', rollbackSchema),
  async (c) => {
    const { userId } = c.get('user');
    const pageId = c.req.param('pageId');
    const { versionId } = c.req.valid('json');

    await checkPageOwnership(pageId, userId);

    await deploymentService.rollback(pageId, versionId);

    return c.json({
      success: true,
      message: 'Page rolled back to previous version',
    });
  }
);

/**
 * POST /deployments/:pageId/domain
 * Configure a custom domain for a landing page
 */
deploymentsRouter.post(
  '/:pageId/domain',
  zValidator('json', configureDomainSchema),
  async (c) => {
    const { userId } = c.get('user');
    const pageId = c.req.param('pageId');
    const { domain } = c.req.valid('json');

    await checkPageOwnership(pageId, userId);

    const config = await deploymentService.configureDomain(pageId, domain);

    return c.json({
      success: true,
      data: config,
      message: 'Custom domain configured',
    });
  }
);

/**
 * GET /deployments/:pageId/preview
 * Get HTML preview of a landing page
 */
deploymentsRouter.get('/:pageId/preview', async (c) => {
  const { userId } = c.get('user');
  const pageId = c.req.param('pageId');

  await checkPageOwnership(pageId, userId);

  const rendered = await pageRendererService.renderToHtml(pageId);

  return c.html(rendered.html);
});

export { deploymentsRouter };
