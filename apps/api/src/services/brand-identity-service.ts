import { eq } from 'drizzle-orm';
import { db } from '../lib/db';
import {
  brandIdentities,
  companies,
} from '@1person/core/db';
import type {
  BrandColors,
  BrandTypography,
  BrandVoice,
} from '@1person/core/db';
import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic();

export interface BrandIdentityData {
  logoUrl?: string;
  logoLightUrl?: string;
  faviconUrl?: string;
  colors: BrandColors;
  typography?: BrandTypography;
  voice?: BrandVoice;
  styleKeywords?: string[];
  visualStyle?: string;
}

export interface ExtractedBrandData {
  companyName?: string;
  tagline?: string;
  colors: BrandColors;
  typography: BrandTypography;
  voice: BrandVoice;
  styleKeywords: string[];
  visualStyle: string;
  logoUrl?: string;
  faviconUrl?: string;
  services?: string[];
  targetAudience?: string;
}

export class BrandIdentityService {
  /**
   * Get brand identity for a company
   */
  async getBrandIdentity(companyId: string) {
    return db.query.brandIdentities.findFirst({
      where: eq(brandIdentities.companyId, companyId),
    });
  }

  /**
   * Create or update brand identity
   */
  async upsertBrandIdentity(companyId: string, data: Partial<BrandIdentityData>) {
    const existing = await this.getBrandIdentity(companyId);

    if (existing) {
      await db
        .update(brandIdentities)
        .set({
          ...data,
          updatedAt: new Date(),
        })
        .where(eq(brandIdentities.id, existing.id));

      return existing.id;
    }

    const results = await db
      .insert(brandIdentities)
      .values({
        companyId,
        colors: data.colors || { primary: '#3B82F6' },
        typography: data.typography || {},
        voice: data.voice || { tone: ['professional'], personality: [], keywords: [], avoidWords: [] },
        styleKeywords: data.styleKeywords || [],
        visualStyle: data.visualStyle || 'modern',
        logoUrl: data.logoUrl,
        logoLightUrl: data.logoLightUrl,
        faviconUrl: data.faviconUrl,
      })
      .returning({ id: brandIdentities.id });

    if (!results[0]) throw new Error('Failed to create brand identity');
    return results[0].id;
  }

  /**
   * Update brand colors
   */
  async updateColors(companyId: string, colors: BrandColors) {
    const existing = await this.getBrandIdentity(companyId);
    if (!existing) {
      return this.upsertBrandIdentity(companyId, { colors });
    }

    await db
      .update(brandIdentities)
      .set({
        colors,
        updatedAt: new Date(),
      })
      .where(eq(brandIdentities.id, existing.id));

    return existing.id;
  }

  /**
   * Update brand voice
   */
  async updateVoice(companyId: string, voice: BrandVoice) {
    const existing = await this.getBrandIdentity(companyId);
    if (!existing) {
      return this.upsertBrandIdentity(companyId, { voice });
    }

    await db
      .update(brandIdentities)
      .set({
        voice,
        updatedAt: new Date(),
      })
      .where(eq(brandIdentities.id, existing.id));

    return existing.id;
  }

  /**
   * Update logo URLs
   */
  async updateLogos(companyId: string, logos: {
    logoUrl?: string;
    logoLightUrl?: string;
    faviconUrl?: string;
  }) {
    const existing = await this.getBrandIdentity(companyId);
    if (!existing) {
      return this.upsertBrandIdentity(companyId, logos);
    }

    await db
      .update(brandIdentities)
      .set({
        ...logos,
        updatedAt: new Date(),
      })
      .where(eq(brandIdentities.id, existing.id));

    return existing.id;
  }

  /**
   * Extract brand identity from website URL
   */
  async extractFromWebsite(url: string): Promise<ExtractedBrandData> {
    console.log(`[BrandIdentity] Extracting brand from: ${url}`);

    try {
      // Fetch website content
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; 1PersonBot/1.0)',
        },
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch website: ${response.status}`);
      }

      const html = await response.text();

      // Extract basic metadata from HTML
      const metadata = this.extractMetadata(html, url);

      // Use Claude to analyze the brand
      const brandAnalysis = await this.analyzeBrandWithAI(html, url, metadata);

      // Merge results with defaults
      const result: ExtractedBrandData = {
        companyName: metadata.companyName || brandAnalysis.companyName,
        tagline: metadata.tagline || brandAnalysis.tagline,
        colors: brandAnalysis.colors || metadata.colors || { primary: '#3B82F6' },
        typography: brandAnalysis.typography || metadata.typography || {},
        voice: brandAnalysis.voice || { tone: ['professional'], personality: [], keywords: [], avoidWords: [] },
        styleKeywords: brandAnalysis.styleKeywords || [],
        visualStyle: brandAnalysis.visualStyle || 'modern',
        logoUrl: metadata.logoUrl,
        faviconUrl: metadata.faviconUrl,
        services: brandAnalysis.services,
        targetAudience: brandAnalysis.targetAudience,
      };

      return result;
    } catch (error) {
      console.error('[BrandIdentity] Extraction failed:', error);
      throw error;
    }
  }

  /**
   * Extract metadata from HTML
   */
  private extractMetadata(html: string, baseUrl: string): Partial<ExtractedBrandData> {
    const result: Partial<ExtractedBrandData> = {};

    // Extract title
    const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    if (titleMatch && titleMatch[1]) {
      result.companyName = titleMatch[1].split(/[|\-–—]/)[0]?.trim();
    }

    // Extract meta description
    const descMatch = html.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']+)["']/i);
    if (descMatch) {
      result.tagline = descMatch[1];
    }

    // Extract favicon
    const faviconMatch = html.match(/<link[^>]*rel=["'](?:shortcut )?icon["'][^>]*href=["']([^"']+)["']/i);
    if (faviconMatch && faviconMatch[1]) {
      result.faviconUrl = this.resolveUrl(faviconMatch[1], baseUrl);
    }

    // Extract logo (common patterns)
    const logoPatterns = [
      /<img[^>]*class=["'][^"']*logo[^"']*["'][^>]*src=["']([^"']+)["']/i,
      /<img[^>]*src=["']([^"']+logo[^"']+)["']/i,
      /<img[^>]*alt=["'][^"']*logo[^"']*["'][^>]*src=["']([^"']+)["']/i,
    ];

    for (const pattern of logoPatterns) {
      const match = html.match(pattern);
      if (match && match[1]) {
        result.logoUrl = this.resolveUrl(match[1], baseUrl);
        break;
      }
    }

    // Extract colors from inline styles and CSS
    const extractedColors = this.extractColorsFromHTML(html);
    if (extractedColors.length > 0) {
      result.colors = {
        primary: extractedColors[0] || '#3B82F6',
        secondary: extractedColors[1],
        accent: extractedColors[2],
      };
    }

    return result;
  }

  /**
   * Extract colors from HTML/CSS
   */
  private extractColorsFromHTML(html: string): string[] {
    const colorSet = new Set<string>();

    // Hex colors
    const hexMatches = html.match(/#[0-9A-Fa-f]{6}\b/g) || [];
    hexMatches.forEach(c => colorSet.add(c.toUpperCase()));

    // RGB colors (simplified)
    const rgbMatches = html.match(/rgb\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*\)/g) || [];
    rgbMatches.forEach(rgb => {
      const hex = this.rgbToHex(rgb);
      if (hex) colorSet.add(hex);
    });

    // Filter out common colors (white, black, gray)
    const filtered = Array.from(colorSet).filter(c => {
      const lower = c.toLowerCase();
      return !['#ffffff', '#000000', '#f5f5f5', '#eeeeee', '#dddddd', '#cccccc'].includes(lower);
    });

    return filtered.slice(0, 5);
  }

  /**
   * Convert RGB to Hex
   */
  private rgbToHex(rgb: string): string | null {
    const match = rgb.match(/rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)/);
    if (!match || !match[1] || !match[2] || !match[3]) return null;

    const r = parseInt(match[1], 10).toString(16).padStart(2, '0');
    const g = parseInt(match[2], 10).toString(16).padStart(2, '0');
    const b = parseInt(match[3], 10).toString(16).padStart(2, '0');

    return `#${r}${g}${b}`.toUpperCase();
  }

  /**
   * Resolve relative URL to absolute
   */
  private resolveUrl(url: string, baseUrl: string): string {
    if (url.startsWith('http://') || url.startsWith('https://')) {
      return url;
    }
    if (url.startsWith('//')) {
      return 'https:' + url;
    }
    const base = new URL(baseUrl);
    if (url.startsWith('/')) {
      return `${base.origin}${url}`;
    }
    return `${base.origin}/${url}`;
  }

  /**
   * Analyze brand with AI
   */
  private async analyzeBrandWithAI(
    html: string,
    url: string,
    metadata: Partial<ExtractedBrandData>
  ): Promise<Partial<ExtractedBrandData>> {
    // Truncate HTML to avoid token limits
    const truncatedHtml = html.slice(0, 15000);

    const prompt = `Analyze this website and extract brand identity information.

Website URL: ${url}
Company Name (extracted): ${metadata.companyName || 'Unknown'}
Tagline (extracted): ${metadata.tagline || 'None'}

HTML Content (truncated):
${truncatedHtml}

Extract and return a JSON object with:
1. colors: { primary: "#hex", secondary: "#hex", accent: "#hex" } - brand colors based on the design
2. typography: { headingFont: "font name", bodyFont: "font name" } - fonts used
3. voice: { tone: ["adjective1", "adjective2"], personality: ["trait1", "trait2"], keywords: ["word1", "word2"] } - brand voice characteristics
4. styleKeywords: ["style1", "style2"] - visual style descriptors
5. visualStyle: "modern" | "classic" | "playful" | "minimalist" | "bold" | "elegant"
6. services: ["service1", "service2"] - main services/products offered
7. targetAudience: "description of target audience"

Return ONLY valid JSON, no markdown or explanation.`;

    try {
      const response = await anthropic.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 2000,
        messages: [{ role: 'user', content: prompt }],
      });

      const content = response.content[0];
      if (!content || content.type !== 'text') {
        throw new Error('Unexpected response type');
      }

      // Parse JSON from response
      const jsonMatch = content.text.match(/\{[\s\S]*\}/);
      if (!jsonMatch || !jsonMatch[0]) {
        throw new Error('No JSON found in response');
      }

      const analysis = JSON.parse(jsonMatch[0]);

      return {
        colors: analysis.colors || metadata.colors,
        typography: analysis.typography || {},
        voice: {
          tone: analysis.voice?.tone || ['professional'],
          personality: analysis.voice?.personality || [],
          keywords: analysis.voice?.keywords || [],
          avoidWords: [],
        },
        styleKeywords: analysis.styleKeywords || [],
        visualStyle: analysis.visualStyle || 'modern',
        services: analysis.services || [],
        targetAudience: analysis.targetAudience || '',
      };
    } catch (error) {
      console.error('[BrandIdentity] AI analysis failed:', error);

      // Return defaults if AI fails
      return {
        colors: metadata.colors || { primary: '#3B82F6' },
        typography: {},
        voice: { tone: ['professional'], personality: [], keywords: [], avoidWords: [] },
        styleKeywords: ['modern'],
        visualStyle: 'modern',
      };
    }
  }

  /**
   * Save extracted brand to company
   */
  async saveExtractedBrand(companyId: string, extracted: ExtractedBrandData, sourceUrl: string) {
    const existing = await this.getBrandIdentity(companyId);

    const data = {
      colors: extracted.colors,
      typography: extracted.typography,
      voice: extracted.voice,
      styleKeywords: extracted.styleKeywords,
      visualStyle: extracted.visualStyle,
      logoUrl: extracted.logoUrl,
      faviconUrl: extracted.faviconUrl,
      extractedFromUrl: sourceUrl,
      extractedAt: new Date(),
    };

    if (existing) {
      await db
        .update(brandIdentities)
        .set({
          ...data,
          updatedAt: new Date(),
        })
        .where(eq(brandIdentities.id, existing.id));

      return existing.id;
    }

    const results = await db
      .insert(brandIdentities)
      .values({
        companyId,
        ...data,
      })
      .returning({ id: brandIdentities.id });

    if (!results[0]) throw new Error('Failed to save brand identity');
    return results[0].id;
  }

  /**
   * Generate brand guidelines document
   */
  async generateBrandGuidelines(companyId: string): Promise<string> {
    const brand = await this.getBrandIdentity(companyId);
    if (!brand) {
      throw new Error('Brand identity not found');
    }

    const company = await db.query.companies.findFirst({
      where: eq(companies.id, companyId),
      columns: { name: true, description: true },
    });

    const colors = brand.colors as BrandColors;
    const typography = brand.typography as BrandTypography;
    const voice = brand.voice as BrandVoice;

    const guidelines = `
# ${company?.name || 'Company'} Brand Guidelines

## Brand Colors

| Color | Hex Code | Usage |
|-------|----------|-------|
| Primary | ${colors.primary} | Main brand color, CTAs, key elements |
| Secondary | ${colors.secondary || 'N/A'} | Supporting elements, backgrounds |
| Accent | ${colors.accent || 'N/A'} | Highlights, notifications |

## Typography

- **Heading Font:** ${typography.headingFont || 'System default'}
- **Body Font:** ${typography.bodyFont || 'System default'}

## Brand Voice

### Tone
${(voice.tone || []).map(t => `- ${t}`).join('\n') || '- Professional'}

### Personality Traits
${(voice.personality || []).map(p => `- ${p}`).join('\n') || '- Reliable'}

### Keywords to Use
${(voice.keywords || []).map(k => `- ${k}`).join('\n') || '- N/A'}

### Words to Avoid
${(voice.avoidWords || []).map(w => `- ${w}`).join('\n') || '- N/A'}

## Visual Style

**Style:** ${brand.visualStyle || 'Modern'}

**Keywords:** ${(brand.styleKeywords as string[] || []).join(', ') || 'Clean, professional'}

## Logo Usage

- Primary Logo: ${brand.logoUrl || 'Not uploaded'}
- Light Version: ${brand.logoLightUrl || 'Not uploaded'}
- Favicon: ${brand.faviconUrl || 'Not uploaded'}

---
*Generated by 1Person AI*
    `.trim();

    return guidelines;
  }

  /**
   * Generate brand identity from business description (for new businesses)
   */
  async generateBrandFromDescription(
    companyId: string,
    description: string,
    industry?: string
  ): Promise<string> {
    console.log(`[BrandIdentity] Generating brand for new business: ${companyId}`);

    const prompt = `You are a brand strategist. Create a brand identity for a new business.

Business Description: ${description}
Industry: ${industry || 'General'}

Generate a complete brand identity that would work well for this type of business.

Return ONLY valid JSON:
{
  "colors": {
    "primary": "#hex",
    "secondary": "#hex",
    "accent": "#hex",
    "background": "#hex",
    "text": "#hex"
  },
  "typography": {
    "headingFont": "font name (Google Fonts)",
    "bodyFont": "font name (Google Fonts)"
  },
  "voice": {
    "tone": ["adjective1", "adjective2", "adjective3"],
    "personality": ["trait1", "trait2"],
    "keywords": ["word1", "word2", "word3"],
    "avoidWords": ["word1", "word2"]
  },
  "styleKeywords": ["style1", "style2", "style3"],
  "visualStyle": "modern" | "classic" | "playful" | "minimalist" | "bold" | "elegant"
}

Choose colors that:
- Are appropriate for the industry
- Work well together (good contrast)
- Feel professional yet distinctive

Choose voice/tone that:
- Matches the target audience
- Reflects the business values
- Is consistent and memorable`;

    try {
      const response = await anthropic.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1500,
        messages: [{ role: 'user', content: prompt }],
      });

      const content = response.content[0];
      if (!content || content.type !== 'text') {
        throw new Error('Unexpected response type');
      }

      const jsonMatch = content.text.match(/\{[\s\S]*\}/);
      if (!jsonMatch || !jsonMatch[0]) {
        throw new Error('No JSON found in response');
      }

      const generated = JSON.parse(jsonMatch[0]);

      // Save to database
      const brandId = await this.upsertBrandIdentity(companyId, {
        colors: generated.colors,
        typography: generated.typography,
        voice: {
          tone: generated.voice?.tone || ['professional'],
          personality: generated.voice?.personality || [],
          keywords: generated.voice?.keywords || [],
          avoidWords: generated.voice?.avoidWords || [],
        },
        styleKeywords: generated.styleKeywords || [],
        visualStyle: generated.visualStyle || 'modern',
      });

      console.log(`[BrandIdentity] Generated brand for ${companyId}: ${brandId}`);
      return brandId;
    } catch (error) {
      console.error('[BrandIdentity] Generation failed, using defaults:', error);
      // Fallback to default brand
      return this.createDefaultBrand(companyId, industry);
    }
  }

  /**
   * Create default brand identity (for skip option)
   */
  async createDefaultBrand(companyId: string, industry?: string): Promise<string> {
    console.log(`[BrandIdentity] Creating default brand for: ${companyId}`);

    // Industry-specific default colors
    const industryColors: Record<string, { primary: string; secondary: string; accent: string }> = {
      'technology': { primary: '#3B82F6', secondary: '#1E40AF', accent: '#06B6D4' },
      'healthcare': { primary: '#10B981', secondary: '#059669', accent: '#14B8A6' },
      'finance': { primary: '#1E3A5F', secondary: '#2563EB', accent: '#F59E0B' },
      'food': { primary: '#EF4444', secondary: '#F97316', accent: '#FCD34D' },
      'fashion': { primary: '#EC4899', secondary: '#8B5CF6', accent: '#F472B6' },
      'education': { primary: '#6366F1', secondary: '#4F46E5', accent: '#A78BFA' },
      'real_estate': { primary: '#059669', secondary: '#047857', accent: '#34D399' },
      'default': { primary: '#3B82F6', secondary: '#6366F1', accent: '#10B981' },
    };

    const normalizedIndustry = industry?.toLowerCase().replace(/[^a-z]/g, '_') || 'default';
    const colors = industryColors[normalizedIndustry] || industryColors['default'];

    const brandId = await this.upsertBrandIdentity(companyId, {
      colors: {
        ...colors,
        background: '#FFFFFF',
        text: '#1F2937',
      },
      typography: {
        headingFont: 'Inter',
        bodyFont: 'Inter',
      },
      voice: {
        tone: ['professional', 'friendly'],
        personality: ['reliable', 'innovative'],
        keywords: [],
        avoidWords: [],
      },
      styleKeywords: ['clean', 'modern', 'professional'],
      visualStyle: 'modern',
    });

    console.log(`[BrandIdentity] Created default brand for ${companyId}: ${brandId}`);
    return brandId;
  }
}

// Export singleton
export const brandIdentityService = new BrandIdentityService();
