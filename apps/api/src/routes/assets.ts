import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { HTTPException } from 'hono/http-exception';
import { authMiddleware, getUserCompanies } from '../middleware/auth';
import { assetGenerationService } from '../services/asset-generation-service';

const assets = new Hono();

// Apply auth middleware
assets.use('*', authMiddleware);

// Schema definitions
const imageGenerationSchema = z.object({
  prompt: z.string().min(1).max(2000),
  width: z.number().min(256).max(2048).optional(),
  height: z.number().min(256).max(2048).optional(),
  style: z.enum(['photorealistic', 'illustration', 'abstract', 'logo', 'banner']).optional(),
  useBrandColors: z.boolean().optional(),
  negativePrompt: z.string().max(1000).optional(),
  numImages: z.number().min(1).max(4).optional(),
});

const videoGenerationSchema = z.object({
  prompt: z.string().min(1).max(2000),
  duration: z.number().min(1).max(60).optional(),
  aspectRatio: z.enum(['16:9', '9:16', '1:1', '4:3']).optional(),
  style: z.enum(['realistic', 'animated', 'cinematic']).optional(),
  useBrandColors: z.boolean().optional(),
});

const bannerGenerationSchema = z.object({
  headline: z.string().min(1).max(200),
  subheadline: z.string().max(300).optional(),
  ctaText: z.string().max(50).optional(),
  style: z.enum(['modern', 'minimal', 'bold', 'elegant']).optional(),
  size: z.enum(['facebook', 'instagram', 'twitter', 'linkedin', 'custom']).optional(),
  customWidth: z.number().min(256).max(4096).optional(),
  customHeight: z.number().min(256).max(4096).optional(),
});

const productImagesSchema = z.object({
  productName: z.string().min(1).max(200),
  productDescription: z.string().min(1).max(500),
  style: z.enum(['studio', 'lifestyle', 'flat-lay', 'close-up']).optional(),
  background: z.enum(['white', 'gradient', 'contextual']).optional(),
  numImages: z.number().min(1).max(6).optional(),
});

const socialContentSchema = z.object({
  platform: z.enum(['instagram', 'facebook', 'twitter', 'linkedin', 'tiktok']),
  contentType: z.enum(['post', 'story', 'reel']),
  topic: z.string().min(1).max(500),
  style: z.enum(['informative', 'promotional', 'engaging', 'inspirational']).optional(),
});

// Helper to verify company access
async function verifyCompanyAccess(userId: string, companyId: string): Promise<boolean> {
  const userCompanies = await getUserCompanies(userId);
  return userCompanies.some((co: { id: string }) => co.id === companyId);
}

// Generate images
assets.post(
  '/company/:companyId/generate/image',
  zValidator('json', imageGenerationSchema),
  async (c) => {
    const companyId = c.req.param('companyId');
    const { userId } = c.get('user');
    const body = c.req.valid('json');

    if (!(await verifyCompanyAccess(userId, companyId))) {
      throw new HTTPException(403, { message: 'Access denied' });
    }

    console.log(`[Assets] Generating image for company ${companyId}`);

    const assets = await assetGenerationService.generateImages({
      companyId,
      ...body,
    });

    return c.json({
      success: true,
      data: assets,
      message: `Generated ${assets.length} image(s)`,
    });
  }
);

// Generate video
assets.post(
  '/company/:companyId/generate/video',
  zValidator('json', videoGenerationSchema),
  async (c) => {
    const companyId = c.req.param('companyId');
    const { userId } = c.get('user');
    const body = c.req.valid('json');

    if (!(await verifyCompanyAccess(userId, companyId))) {
      throw new HTTPException(403, { message: 'Access denied' });
    }

    console.log(`[Assets] Generating video for company ${companyId}`);

    const assets = await assetGenerationService.generateVideo({
      companyId,
      ...body,
    });

    return c.json({
      success: true,
      data: assets,
      message: `Generated ${assets.length} video(s)`,
    });
  }
);

// Generate marketing banner
assets.post(
  '/company/:companyId/generate/banner',
  zValidator('json', bannerGenerationSchema),
  async (c) => {
    const companyId = c.req.param('companyId');
    const { userId } = c.get('user');
    const body = c.req.valid('json');

    if (!(await verifyCompanyAccess(userId, companyId))) {
      throw new HTTPException(403, { message: 'Access denied' });
    }

    console.log(`[Assets] Generating banner for company ${companyId}`);

    const assets = await assetGenerationService.generateBanner(companyId, body);

    return c.json({
      success: true,
      data: assets,
      message: `Generated banner image`,
    });
  }
);

// Generate product images
assets.post(
  '/company/:companyId/generate/product',
  zValidator('json', productImagesSchema),
  async (c) => {
    const companyId = c.req.param('companyId');
    const { userId } = c.get('user');
    const body = c.req.valid('json');

    if (!(await verifyCompanyAccess(userId, companyId))) {
      throw new HTTPException(403, { message: 'Access denied' });
    }

    console.log(`[Assets] Generating product images for company ${companyId}`);

    const assets = await assetGenerationService.generateProductImages(companyId, body);

    return c.json({
      success: true,
      data: assets,
      message: `Generated ${assets.length} product image(s)`,
    });
  }
);

// Generate social media content
assets.post(
  '/company/:companyId/generate/social',
  zValidator('json', socialContentSchema),
  async (c) => {
    const companyId = c.req.param('companyId');
    const { userId } = c.get('user');
    const body = c.req.valid('json');

    if (!(await verifyCompanyAccess(userId, companyId))) {
      throw new HTTPException(403, { message: 'Access denied' });
    }

    console.log(`[Assets] Generating social content for company ${companyId}`);

    const assets = await assetGenerationService.generateSocialContent(companyId, body);

    return c.json({
      success: true,
      data: assets,
      message: `Generated social media content`,
    });
  }
);

// Get all assets for company
assets.get('/company/:companyId', async (c) => {
  const companyId = c.req.param('companyId');
  const { userId } = c.get('user');

  if (!(await verifyCompanyAccess(userId, companyId))) {
    throw new HTTPException(403, { message: 'Access denied' });
  }

  const type = c.req.query('type') as 'image' | 'video' | 'audio' | 'document' | undefined;
  const agentId = c.req.query('agentId');
  const limit = parseInt(c.req.query('limit') || '50');
  const offset = parseInt(c.req.query('offset') || '0');

  const assetList = await assetGenerationService.getAssets(companyId, {
    type,
    agentId,
    limit,
    offset,
  });

  return c.json({
    data: assetList,
    pagination: {
      limit,
      offset,
      hasMore: assetList.length === limit,
    },
  });
});

// Get single asset
assets.get('/:assetId', async (c) => {
  const assetId = c.req.param('assetId');
  const { userId } = c.get('user');

  const asset = await assetGenerationService.getAsset(assetId);

  if (!asset) {
    throw new HTTPException(404, { message: 'Asset not found' });
  }

  // Verify access
  if (!(await verifyCompanyAccess(userId, asset.companyId))) {
    throw new HTTPException(403, { message: 'Access denied' });
  }

  return c.json({ data: asset });
});

// Update asset
const updateAssetSchema = z.object({
  name: z.string().max(255).optional(),
  tags: z.array(z.string()).optional(),
  isPublic: z.boolean().optional(),
  isArchived: z.boolean().optional(),
});

assets.patch(
  '/:assetId',
  zValidator('json', updateAssetSchema),
  async (c) => {
    const assetId = c.req.param('assetId');
    const { userId } = c.get('user');
    const body = c.req.valid('json');

    const asset = await assetGenerationService.getAsset(assetId);

    if (!asset) {
      throw new HTTPException(404, { message: 'Asset not found' });
    }

    if (!(await verifyCompanyAccess(userId, asset.companyId))) {
      throw new HTTPException(403, { message: 'Access denied' });
    }

    await assetGenerationService.updateAsset(assetId, body);

    return c.json({
      success: true,
      message: 'Asset updated',
    });
  }
);

// Delete asset
assets.delete('/:assetId', async (c) => {
  const assetId = c.req.param('assetId');
  const { userId } = c.get('user');

  const asset = await assetGenerationService.getAsset(assetId);

  if (!asset) {
    throw new HTTPException(404, { message: 'Asset not found' });
  }

  if (!(await verifyCompanyAccess(userId, asset.companyId))) {
    throw new HTTPException(403, { message: 'Access denied' });
  }

  await assetGenerationService.deleteAsset(assetId);

  return c.json({
    success: true,
    message: 'Asset deleted',
  });
});

export default assets;
