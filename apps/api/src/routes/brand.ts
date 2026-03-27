import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { HTTPException } from 'hono/http-exception';
import { authMiddleware, getUserCompanies } from '../middleware/auth';
import { brandIdentityService } from '../services/brand-identity-service';

const brand = new Hono();

// Apply auth middleware
brand.use('*', authMiddleware);

// Schema definitions
const colorsSchema = z.object({
  primary: z.string(),
  secondary: z.string().optional(),
  accent: z.string().optional(),
  background: z.string().optional(),
  text: z.string().optional(),
});

const typographySchema = z.object({
  headingFont: z.string().optional(),
  bodyFont: z.string().optional(),
  fontSize: z.object({
    base: z.number(),
    scale: z.number(),
  }).optional(),
});

const voiceSchema = z.object({
  tone: z.array(z.string()),
  personality: z.array(z.string()).default([]),
  keywords: z.array(z.string()).default([]),
  avoidWords: z.array(z.string()).default([]),
});

const brandIdentitySchema = z.object({
  logoUrl: z.string().url().optional(),
  logoLightUrl: z.string().url().optional(),
  faviconUrl: z.string().url().optional(),
  colors: colorsSchema.optional(),
  typography: typographySchema.optional(),
  voice: voiceSchema.optional(),
  styleKeywords: z.array(z.string()).optional(),
  visualStyle: z.enum(['modern', 'classic', 'playful', 'minimalist', 'bold', 'elegant']).optional(),
});

// Get brand identity for company
brand.get('/company/:companyId', async (c) => {
  const companyId = c.req.param('companyId');
  const { userId } = c.get('user');

  // Verify access
  const userCompanies = await getUserCompanies(userId);
  if (!userCompanies.some((co: { id: string }) => co.id === companyId)) {
    throw new HTTPException(403, { message: 'Access denied' });
  }

  const identity = await brandIdentityService.getBrandIdentity(companyId);

  if (!identity) {
    return c.json({
      data: null,
      message: 'Brand identity not set up yet',
    });
  }

  return c.json({ data: identity });
});

// Create or update brand identity
brand.put(
  '/company/:companyId',
  zValidator('json', brandIdentitySchema),
  async (c) => {
    const companyId = c.req.param('companyId');
    const { userId } = c.get('user');
    const body = c.req.valid('json');

    // Verify access
    const userCompanies = await getUserCompanies(userId);
    if (!userCompanies.some((co: { id: string }) => co.id === companyId)) {
      throw new HTTPException(403, { message: 'Access denied' });
    }

    const id = await brandIdentityService.upsertBrandIdentity(companyId, body);

    return c.json({
      success: true,
      data: { id },
      message: 'Brand identity updated',
    });
  }
);

// Update brand colors only
brand.patch(
  '/company/:companyId/colors',
  zValidator('json', colorsSchema),
  async (c) => {
    const companyId = c.req.param('companyId');
    const { userId } = c.get('user');
    const colors = c.req.valid('json');

    const userCompanies = await getUserCompanies(userId);
    if (!userCompanies.some((co: { id: string }) => co.id === companyId)) {
      throw new HTTPException(403, { message: 'Access denied' });
    }

    const id = await brandIdentityService.updateColors(companyId, colors);

    return c.json({
      success: true,
      data: { id },
      message: 'Brand colors updated',
    });
  }
);

// Update brand voice only
brand.patch(
  '/company/:companyId/voice',
  zValidator('json', voiceSchema),
  async (c) => {
    const companyId = c.req.param('companyId');
    const { userId } = c.get('user');
    const voice = c.req.valid('json');

    const userCompanies = await getUserCompanies(userId);
    if (!userCompanies.some((co: { id: string }) => co.id === companyId)) {
      throw new HTTPException(403, { message: 'Access denied' });
    }

    const id = await brandIdentityService.updateVoice(companyId, {
      ...voice,
      personality: voice.personality || [],
      keywords: voice.keywords || [],
      avoidWords: voice.avoidWords || [],
    });

    return c.json({
      success: true,
      data: { id },
      message: 'Brand voice updated',
    });
  }
);

// Update logos
const logosSchema = z.object({
  logoUrl: z.string().url().optional(),
  logoLightUrl: z.string().url().optional(),
  faviconUrl: z.string().url().optional(),
});

brand.patch(
  '/company/:companyId/logos',
  zValidator('json', logosSchema),
  async (c) => {
    const companyId = c.req.param('companyId');
    const { userId } = c.get('user');
    const logos = c.req.valid('json');

    const userCompanies = await getUserCompanies(userId);
    if (!userCompanies.some((co: { id: string }) => co.id === companyId)) {
      throw new HTTPException(403, { message: 'Access denied' });
    }

    const id = await brandIdentityService.updateLogos(companyId, logos);

    return c.json({
      success: true,
      data: { id },
      message: 'Logos updated',
    });
  }
);

// Extract brand from website URL
const extractSchema = z.object({
  url: z.string().url(),
  saveToCompany: z.boolean().optional().default(false),
});

brand.post(
  '/extract',
  zValidator('json', extractSchema),
  async (c) => {
    const { url, saveToCompany } = c.req.valid('json');
    const companyId = c.req.query('companyId');

    console.log(`[Brand] Extracting brand from: ${url}`);

    const extracted = await brandIdentityService.extractFromWebsite(url);

    // Optionally save to company
    if (saveToCompany && companyId) {
      const { userId } = c.get('user');
      const userCompanies = await getUserCompanies(userId);

      if (userCompanies.some((co: { id: string }) => co.id === companyId)) {
        await brandIdentityService.saveExtractedBrand(companyId, extracted, url);
      }
    }

    return c.json({
      success: true,
      data: extracted,
      message: 'Brand extracted successfully',
    });
  }
);

// Extract and save brand for company
brand.post('/company/:companyId/extract', zValidator('json', z.object({
  url: z.string().url(),
})), async (c) => {
  const companyId = c.req.param('companyId');
  const { userId } = c.get('user');
  const { url } = c.req.valid('json');

  const userCompanies = await getUserCompanies(userId);
  if (!userCompanies.some((co: { id: string }) => co.id === companyId)) {
    throw new HTTPException(403, { message: 'Access denied' });
  }

  console.log(`[Brand] Extracting brand for company ${companyId} from: ${url}`);

  const extracted = await brandIdentityService.extractFromWebsite(url);
  const id = await brandIdentityService.saveExtractedBrand(companyId, extracted, url);

  return c.json({
    success: true,
    data: {
      id,
      ...extracted,
    },
    message: 'Brand extracted and saved',
  });
});

// Generate brand from AI (for Settings page - new businesses)
const generateBrandSchema = z.object({
  description: z.string().min(10).max(1000).optional(),
  industry: z.string().optional(),
});

brand.post(
  '/company/:companyId/generate',
  zValidator('json', generateBrandSchema),
  async (c) => {
    const companyId = c.req.param('companyId');
    const { userId } = c.get('user');
    const body = c.req.valid('json');

    const userCompanies = await getUserCompanies(userId);
    if (!userCompanies.some((co: { id: string }) => co.id === companyId)) {
      throw new HTTPException(403, { message: 'Access denied' });
    }

    // Get company info for context
    const company = userCompanies.find((co: { id: string }) => co.id === companyId);
    const description = body.description || company?.description || 'A modern business';
    const industry = body.industry || company?.industry || 'General';

    console.log(`[Brand] Generating AI brand for company ${companyId}`);

    const brandId = await brandIdentityService.generateBrandFromDescription(
      companyId,
      description,
      industry
    );

    const brand = await brandIdentityService.getBrandIdentity(companyId);

    return c.json({
      success: true,
      data: {
        id: brandId,
        brand,
      },
      message: 'Brand generated successfully',
    });
  }
);

// Create default brand (for skip option in Settings)
brand.post('/company/:companyId/default', async (c) => {
  const companyId = c.req.param('companyId');
  const { userId } = c.get('user');

  const userCompanies = await getUserCompanies(userId);
  if (!userCompanies.some((co: { id: string }) => co.id === companyId)) {
    throw new HTTPException(403, { message: 'Access denied' });
  }

  const company = userCompanies.find((co: { id: string }) => co.id === companyId);
  const industry = company?.industry || 'General';

  console.log(`[Brand] Creating default brand for company ${companyId}`);

  const brandId = await brandIdentityService.createDefaultBrand(companyId, industry);
  const brand = await brandIdentityService.getBrandIdentity(companyId);

  return c.json({
    success: true,
    data: {
      id: brandId,
      brand,
    },
    message: 'Default brand created',
  });
});

// Generate brand guidelines document
brand.get('/company/:companyId/guidelines', async (c) => {
  const companyId = c.req.param('companyId');
  const { userId } = c.get('user');

  const userCompanies = await getUserCompanies(userId);
  if (!userCompanies.some((co: { id: string }) => co.id === companyId)) {
    throw new HTTPException(403, { message: 'Access denied' });
  }

  const guidelines = await brandIdentityService.generateBrandGuidelines(companyId);

  // Return as markdown or HTML based on Accept header
  const accept = c.req.header('Accept') || '';

  if (accept.includes('text/html')) {
    // Simple HTML conversion
    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Brand Guidelines</title>
        <style>
          body { font-family: system-ui, sans-serif; max-width: 800px; margin: 0 auto; padding: 2rem; }
          h1, h2, h3 { color: #1a1a1a; }
          table { border-collapse: collapse; width: 100%; }
          th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
          code { background: #f5f5f5; padding: 2px 6px; border-radius: 3px; }
        </style>
      </head>
      <body>
        ${guidelines.replace(/\n/g, '<br>').replace(/## /g, '<h2>').replace(/# /g, '<h1>')}
      </body>
      </html>
    `;
    return c.html(html);
  }

  return c.text(guidelines);
});

export default brand;
