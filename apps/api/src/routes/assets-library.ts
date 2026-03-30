import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { HTTPException } from 'hono/http-exception';
import { authMiddleware, getUserCompanies } from '../middleware/auth';
import { db } from '../lib/db';
import { assetLibrary } from '@1person/core/db';
import { eq, and, desc, ilike, sql } from 'drizzle-orm';
import { randomUUID } from 'crypto';
import { writeFile, mkdir, unlink } from 'fs/promises';
import { join } from 'path';

const assetsLibrary = new Hono();

// Apply auth middleware
assetsLibrary.use('*', authMiddleware);

// Helper to verify company access
async function verifyCompanyAccess(userId: string, companyId: string): Promise<boolean> {
  const userCompanies = await getUserCompanies(userId);
  return userCompanies.some((co: { id: string }) => co.id === companyId);
}

// Infer mime type to asset type
function mimeToAssetType(mimeType: string): 'image' | 'video' | 'icon' | 'logo' {
  if (mimeType.startsWith('video/')) return 'video';
  if (mimeType === 'image/svg+xml') return 'icon';
  return 'image';
}

// ============================================
// LIST ASSETS
// ============================================

assetsLibrary.get('/company/:companyId', async (c) => {
  const companyId = c.req.param('companyId');
  const { userId } = c.get('user');

  if (!(await verifyCompanyAccess(userId, companyId))) {
    throw new HTTPException(403, { message: 'Access denied' });
  }

  const type = c.req.query('type') as 'image' | 'video' | 'icon' | 'logo' | undefined;
  const source = c.req.query('source') as 'upload' | 'stock' | 'ai_generated' | undefined;
  const campaignId = c.req.query('campaignId');
  const search = c.req.query('search');
  const tag = c.req.query('tag');
  const limit = Math.min(parseInt(c.req.query('limit') || '50'), 100);
  const offset = parseInt(c.req.query('offset') || '0');

  const conditions = [eq(assetLibrary.companyId, companyId)];

  if (type) {
    conditions.push(eq(assetLibrary.type, type));
  }
  if (source) {
    conditions.push(eq(assetLibrary.source, source));
  }
  if (campaignId) {
    conditions.push(eq(assetLibrary.campaignId, campaignId));
  }
  if (search) {
    conditions.push(ilike(assetLibrary.name, `%${search}%`));
  }
  if (tag) {
    conditions.push(sql`${assetLibrary.tags} @> ${JSON.stringify([tag])}::jsonb`);
  }

  const assets = await db
    .select()
    .from(assetLibrary)
    .where(and(...conditions))
    .orderBy(desc(assetLibrary.createdAt))
    .limit(limit)
    .offset(offset);

  return c.json({
    data: assets,
    pagination: {
      limit,
      offset,
      hasMore: assets.length === limit,
    },
  });
});

// ============================================
// UPLOAD FILE
// ============================================

assetsLibrary.post('/company/:companyId/upload', async (c) => {
  const companyId = c.req.param('companyId');
  const { userId } = c.get('user');

  if (!(await verifyCompanyAccess(userId, companyId))) {
    throw new HTTPException(403, { message: 'Access denied' });
  }

  const body = await c.req.parseBody();
  const file = body['file'];

  if (!file || !(file instanceof File)) {
    throw new HTTPException(400, { message: 'Please select a file to upload.' });
  }

  // Validate file size (max 50MB)
  const maxSize = 50 * 1024 * 1024;
  if (file.size > maxSize) {
    throw new HTTPException(400, { message: 'File is too large. Maximum size is 50MB.' });
  }

  // Validate file type
  const allowedTypes = [
    'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml',
    'video/mp4', 'video/webm', 'video/quicktime',
    'image/x-icon', 'image/vnd.microsoft.icon',
  ];

  if (!allowedTypes.includes(file.type)) {
    throw new HTTPException(400, { message: 'This file type is not supported. Please use JPG, PNG, GIF, WebP, SVG, or MP4.' });
  }

  // Validate file extension (defense in depth — don't rely on mime type alone)
  const allowedExts = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'mp4', 'webm', 'mov', 'ico'];
  const ext = file.name.split('.').pop()?.toLowerCase() || '';
  if (!allowedExts.includes(ext)) {
    throw new HTTPException(400, { message: 'This file type is not supported.' });
  }

  // Save file to disk
  const fileId = randomUUID();
  const filename = `${fileId}.${ext}`;
  const uploadDir = join(process.cwd(), '..', '..', 'deploy', 'assets', companyId);

  await mkdir(uploadDir, { recursive: true });

  const buffer = Buffer.from(await file.arrayBuffer());
  const filePath = join(uploadDir, filename);
  await writeFile(filePath, buffer);

  const apiUrl = process.env.NEXT_PUBLIC_API_URL?.replace('/api/v1', '') || 'http://localhost:8004';
  const url = `${apiUrl}/uploads/${companyId}/${filename}`;
  const name = (body['name'] as string) || file.name.replace(/\.[^/.]+$/, '');
  const tags = (body['tags'] as string) ? JSON.parse(body['tags'] as string) : [];
  const campaignId = (body['campaignId'] as string) || null;

  const assetType = mimeToAssetType(file.type);

  const [asset] = await db
    .insert(assetLibrary)
    .values({
      companyId,
      name,
      type: assetType,
      source: 'upload',
      url,
      mimeType: file.type,
      fileSize: file.size,
      tags,
      campaignId,
      metadata: {
        originalFilename: file.name,
      },
    })
    .returning();

  return c.json({
    success: true,
    data: asset,
    message: 'File uploaded successfully',
  });
});

// ============================================
// IMPORT FROM URL (Stock image)
// ============================================

const importFromUrlSchema = z.object({
  url: z.string().url(),
  name: z.string().max(255),
  source: z.enum(['stock', 'ai_generated']).default('stock'),
  type: z.enum(['image', 'video', 'icon', 'logo']).default('image'),
  tags: z.array(z.string()).optional(),
  campaignId: z.string().uuid().optional(),
  metadata: z.record(z.unknown()).optional(),
  width: z.number().optional(),
  height: z.number().optional(),
});

assetsLibrary.post(
  '/company/:companyId/from-url',
  zValidator('json', importFromUrlSchema),
  async (c) => {
    const companyId = c.req.param('companyId');
    const { userId } = c.get('user');
    const body = c.req.valid('json');

    if (!(await verifyCompanyAccess(userId, companyId))) {
      throw new HTTPException(403, { message: 'Access denied' });
    }

    // Determine mime type from URL or default to jpeg
    let mimeType = 'image/jpeg';
    const urlLower = body.url.toLowerCase();
    if (urlLower.includes('.png')) mimeType = 'image/png';
    else if (urlLower.includes('.gif')) mimeType = 'image/gif';
    else if (urlLower.includes('.webp')) mimeType = 'image/webp';
    else if (urlLower.includes('.svg')) mimeType = 'image/svg+xml';
    else if (urlLower.includes('.mp4')) mimeType = 'video/mp4';

    const [asset] = await db
      .insert(assetLibrary)
      .values({
        companyId,
        name: body.name,
        type: body.type,
        source: body.source,
        url: body.url,
        thumbnailUrl: body.url, // For stock images, URL and thumbnail are the same
        mimeType,
        width: body.width,
        height: body.height,
        tags: body.tags || [],
        campaignId: body.campaignId || null,
        metadata: body.metadata || {},
      })
      .returning();

    return c.json({
      success: true,
      data: asset,
      message: 'Image imported to your library',
    });
  }
);

// ============================================
// SEARCH STOCK PHOTOS (Unsplash)
// ============================================

const stockSearchSchema = z.object({
  query: z.string().min(1).max(200),
  page: z.number().min(1).max(50).optional(),
  perPage: z.number().min(1).max(30).optional(),
});

assetsLibrary.post(
  '/company/:companyId/search-stock',
  zValidator('json', stockSearchSchema),
  async (c) => {
    const companyId = c.req.param('companyId');
    const { userId } = c.get('user');
    const body = c.req.valid('json');

    if (!(await verifyCompanyAccess(userId, companyId))) {
      throw new HTTPException(403, { message: 'Access denied' });
    }

    const accessKey = process.env.UNSPLASH_ACCESS_KEY;

    if (!accessKey) {
      // Gracefully return empty results if Unsplash is not configured
      return c.json({
        data: [],
        total: 0,
        message: 'Stock photo search is not configured yet. Contact your administrator.',
      });
    }

    const page = body.page || 1;
    const perPage = body.perPage || 20;

    try {
      const response = await fetch(
        `https://api.unsplash.com/search/photos?query=${encodeURIComponent(body.query)}&page=${page}&per_page=${perPage}&client_id=${accessKey}`
      );

      if (!response.ok) {
        throw new Error('Stock photo service is temporarily unavailable');
      }

      const data = await response.json();

      // Map to a clean format for the frontend
      const results = data.results.map((photo: any) => ({
        id: photo.id,
        url: photo.urls.regular,
        thumbnailUrl: photo.urls.small,
        width: photo.width,
        height: photo.height,
        description: photo.description || photo.alt_description || 'Untitled',
        photographer: photo.user.name,
        photographerUrl: photo.user.links.html,
        provider: 'unsplash',
      }));

      return c.json({
        data: results,
        total: data.total,
        totalPages: data.total_pages,
      });
    } catch (error) {
      console.error('[Assets Library] Stock search error:', error);
      throw new HTTPException(500, {
        message: 'Could not search stock photos right now. Please try again later.',
      });
    }
  }
);

// ============================================
// UPDATE ASSET
// ============================================

const updateAssetSchema = z.object({
  name: z.string().max(255).optional(),
  tags: z.array(z.string()).optional(),
});

assetsLibrary.patch(
  '/:assetId',
  zValidator('json', updateAssetSchema),
  async (c) => {
    const assetId = c.req.param('assetId');
    const { userId } = c.get('user');
    const body = c.req.valid('json');

    const [asset] = await db
      .select()
      .from(assetLibrary)
      .where(eq(assetLibrary.id, assetId))
      .limit(1);

    if (!asset) {
      throw new HTTPException(404, { message: 'Asset not found' });
    }

    if (!(await verifyCompanyAccess(userId, asset.companyId))) {
      throw new HTTPException(403, { message: 'Access denied' });
    }

    const updateData: Record<string, unknown> = { updatedAt: new Date() };
    if (body.name !== undefined) updateData.name = body.name;
    if (body.tags !== undefined) updateData.tags = body.tags;

    const [updated] = await db
      .update(assetLibrary)
      .set(updateData)
      .where(eq(assetLibrary.id, assetId))
      .returning();

    return c.json({
      success: true,
      data: updated,
      message: 'Asset updated',
    });
  }
);

// ============================================
// DELETE ASSET
// ============================================

assetsLibrary.delete('/:assetId', async (c) => {
  const assetId = c.req.param('assetId');
  const { userId } = c.get('user');

  const [asset] = await db
    .select()
    .from(assetLibrary)
    .where(eq(assetLibrary.id, assetId))
    .limit(1);

  if (!asset) {
    throw new HTTPException(404, { message: 'Asset not found' });
  }

  if (!(await verifyCompanyAccess(userId, asset.companyId))) {
    throw new HTTPException(403, { message: 'Access denied' });
  }

  // Try to delete the file from disk if it's a local upload
  if (asset.source === 'upload' && asset.url.includes('/uploads/')) {
    try {
      const relativePath = asset.url.split('/uploads/').pop() || '';
      const filePath = join(process.cwd(), '..', '..', 'deploy', 'assets', relativePath);
      await unlink(filePath);
    } catch {
      // File might already be gone; proceed with DB deletion
    }
  }

  await db.delete(assetLibrary).where(eq(assetLibrary.id, assetId));

  return c.json({
    success: true,
    message: 'Asset deleted',
  });
});

export default assetsLibrary;
