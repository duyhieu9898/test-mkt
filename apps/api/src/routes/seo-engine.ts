/**
 * SEO Engine API — 1-Click SEO Pipeline
 *
 * Start pipeline → Poll progress → View results → Publish to WordPress
 */

import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { eq, and, desc } from 'drizzle-orm';
import { db } from '../lib/db';
import { companies } from '@1person/core/db';
import { authMiddleware } from '../middleware/auth';

const seoEngineRouter = new Hono();
seoEngineRouter.use('*', authMiddleware);

// ===============================================================
// START SEO PIPELINE
// ===============================================================

seoEngineRouter.post(
  '/company/:companyId/start',
  zValidator('json', z.object({
    websiteUrl: z.string().url().optional(),
    products: z.array(z.object({
      name: z.string().min(1),
      description: z.string().min(1),
      url: z.string().url().optional(),
    })).optional(),
    language: z.string().default('en'),
  })),
  async (c) => {
    const companyId = c.req.param('companyId');
    const body = c.req.valid('json');

    try {
      // Dynamic import — seo-engine.ts is built by another agent and may not exist yet
      const { seoEngine } = await import('../services/seo-engine');
      const jobId = await seoEngine.startPipeline(companyId, body);

      return c.json({
        jobId,
        message: 'SEO Engine started — generating your content system',
      });
    } catch (err: any) {
      console.error('[SEO Engine] Start failed:', err);

      if (err.code === 'MODULE_NOT_FOUND') {
        return c.json({ error: 'SEO Engine is being set up. Please try again in a moment.' }, 503);
      }

      return c.json({ error: 'Could not start the SEO Engine. Please try again.' }, 500);
    }
  }
);

// ===============================================================
// CHECK PROGRESS
// ===============================================================

seoEngineRouter.get('/company/:companyId/status/:jobId', async (c) => {
  const companyId = c.req.param('companyId');
  const jobId = c.req.param('jobId');

  try {
    const { seoEngine } = await import('../services/seo-engine');
    const job = await seoEngine.getJobStatus(jobId);

    if (!job) {
      return c.json({ error: 'Job not found' }, 404);
    }

    return c.json(job);
  } catch (err: any) {
    console.error('[SEO Engine] Status check failed:', err);

    if (err.code === 'MODULE_NOT_FOUND') {
      return c.json({ error: 'SEO Engine is being set up.' }, 503);
    }

    return c.json({ error: 'Could not check status.' }, 500);
  }
});

// ===============================================================
// ADD PRODUCTS
// ===============================================================

seoEngineRouter.post(
  '/company/:companyId/products',
  zValidator('json', z.object({
    products: z.array(z.object({
      name: z.string().min(1),
      description: z.string().min(1),
      url: z.string().url().optional(),
    })).min(1),
  })),
  async (c) => {
    const companyId = c.req.param('companyId');
    const { products } = c.req.valid('json');

    try {
      // Store products in company settings (jsonb) under seo.products
      const company = await db.query.companies.findFirst({
        where: eq(companies.id, companyId),
      });

      if (!company) {
        return c.json({ error: 'Company not found' }, 404);
      }

      const currentSettings = (company.settings || {}) as Record<string, any>;
      const seoSettings = currentSettings.seo || {};
      const existingProducts = seoSettings.products || [];

      const updatedSettings = {
        ...currentSettings,
        seo: {
          ...seoSettings,
          products: [...existingProducts, ...products.map((p: any) => ({
            ...p,
            addedAt: new Date().toISOString(),
          }))],
        },
      };

      await db.update(companies)
        .set({ settings: updatedSettings as any, updatedAt: new Date() })
        .where(eq(companies.id, companyId));

      return c.json({
        message: `${products.length} product(s) added`,
        total: existingProducts.length + products.length,
      });
    } catch (err) {
      console.error('[SEO Engine] Add products failed:', err);
      return c.json({ error: 'Could not save products.' }, 500);
    }
  }
);

// ===============================================================
// GET RESULTS
// ===============================================================

seoEngineRouter.get('/company/:companyId/results', async (c) => {
  const companyId = c.req.param('companyId');

  try {
    // Get company settings for SEO data
    const company = await db.query.companies.findFirst({
      where: eq(companies.id, companyId),
    });

    if (!company) {
      return c.json({ error: 'Company not found' }, 404);
    }

    const settings = (company.settings || {}) as Record<string, any>;
    const seoData = settings.seo || {};

    return c.json({
      blogPosts: seoData.blogPosts || [],
      landingPages: seoData.landingPages || [],
      socialPosts: seoData.socialPosts || [],
      keywords: seoData.keywords || [],
      products: seoData.products || [],
      lastRunAt: seoData.lastRunAt || null,
      jobId: seoData.lastJobId || null,
    });
  } catch (err) {
    console.error('[SEO Engine] Get results failed:', err);
    return c.json({ error: 'Could not load results.' }, 500);
  }
});

// ===============================================================
// WORDPRESS — CONNECT
// ===============================================================

seoEngineRouter.post(
  '/company/:companyId/wordpress/connect',
  zValidator('json', z.object({
    siteUrl: z.string().url(),
    username: z.string().min(1),
    appPassword: z.string().min(1),
  })),
  async (c) => {
    const companyId = c.req.param('companyId');
    const { siteUrl, username, appPassword } = c.req.valid('json');

    try {
      // Test the WordPress connection first
      const wpApiUrl = `${siteUrl.replace(/\/$/, '')}/wp-json/wp/v2/posts?per_page=1`;
      const authHeader = 'Basic ' + Buffer.from(`${username}:${appPassword}`).toString('base64');

      const testResponse = await fetch(wpApiUrl, {
        headers: { 'Authorization': authHeader },
      });

      if (!testResponse.ok) {
        const status = testResponse.status;
        if (status === 401 || status === 403) {
          return c.json({ error: 'Invalid credentials. Check your username and application password.' }, 400);
        }
        return c.json({ error: `Could not connect to WordPress (HTTP ${status}). Check the site URL.` }, 400);
      }

      // Save credentials in company settings
      const company = await db.query.companies.findFirst({
        where: eq(companies.id, companyId),
      });

      if (!company) {
        return c.json({ error: 'Company not found' }, 404);
      }

      const currentSettings = (company.settings || {}) as Record<string, any>;

      const updatedSettings = {
        ...currentSettings,
        wordpress: {
          siteUrl: siteUrl.replace(/\/$/, ''),
          username,
          appPassword,
          connectedAt: new Date().toISOString(),
        },
      };

      await db.update(companies)
        .set({ settings: updatedSettings as any, updatedAt: new Date() })
        .where(eq(companies.id, companyId));

      return c.json({
        message: 'WordPress connected successfully',
        siteUrl: siteUrl.replace(/\/$/, ''),
      });
    } catch (err: any) {
      console.error('[SEO Engine] WordPress connect failed:', err);
      if (err.cause?.code === 'ENOTFOUND') {
        return c.json({ error: 'Could not reach the website. Check the URL.' }, 400);
      }
      return c.json({ error: 'Could not connect to WordPress.' }, 500);
    }
  }
);

// ===============================================================
// WORDPRESS — TEST CONNECTION
// ===============================================================

seoEngineRouter.post('/company/:companyId/wordpress/test', async (c) => {
  const companyId = c.req.param('companyId');

  try {
    const company = await db.query.companies.findFirst({
      where: eq(companies.id, companyId),
    });

    if (!company) {
      return c.json({ error: 'Company not found' }, 404);
    }

    const settings = (company.settings || {}) as Record<string, any>;
    const wp = settings.wordpress;

    if (!wp) {
      return c.json({ error: 'WordPress is not connected.' }, 400);
    }

    const wpApiUrl = `${wp.siteUrl}/wp-json/wp/v2/posts?per_page=1`;
    const authHeader = 'Basic ' + Buffer.from(`${wp.username}:${wp.appPassword}`).toString('base64');

    const testResponse = await fetch(wpApiUrl, {
      headers: { 'Authorization': authHeader },
    });

    if (!testResponse.ok) {
      return c.json({
        connected: false,
        error: 'Connection failed. Please reconnect.',
      });
    }

    return c.json({
      connected: true,
      siteUrl: wp.siteUrl,
      connectedAt: wp.connectedAt,
    });
  } catch (err) {
    console.error('[SEO Engine] WordPress test failed:', err);
    return c.json({ connected: false, error: 'Could not reach WordPress.' });
  }
});

// ===============================================================
// WORDPRESS — PUBLISH BLOG POSTS
// ===============================================================

seoEngineRouter.post(
  '/company/:companyId/publish-blogs',
  zValidator('json', z.object({
    blogPostIds: z.array(z.string()).min(1),
    status: z.enum(['draft', 'publish']).default('draft'),
  })),
  async (c) => {
    const companyId = c.req.param('companyId');
    const { blogPostIds, status } = c.req.valid('json');

    try {
      const company = await db.query.companies.findFirst({
        where: eq(companies.id, companyId),
      });

      if (!company) {
        return c.json({ error: 'Company not found' }, 404);
      }

      const settings = (company.settings || {}) as Record<string, any>;
      const wp = settings.wordpress;

      if (!wp) {
        return c.json({ error: 'WordPress is not connected. Connect first.' }, 400);
      }

      const seoData = settings.seo || {};
      const blogPosts: any[] = seoData.blogPosts || [];

      const authHeader = 'Basic ' + Buffer.from(`${wp.username}:${wp.appPassword}`).toString('base64');
      const results: Array<{ id: string; title: string; success: boolean; wpUrl?: string; error?: string }> = [];

      for (const postId of blogPostIds) {
        const post = blogPosts.find((p: any) => p.id === postId);
        if (!post) {
          results.push({ id: postId, title: 'Unknown', success: false, error: 'Post not found' });
          continue;
        }

        try {
          const wpResponse = await fetch(`${wp.siteUrl}/wp-json/wp/v2/posts`, {
            method: 'POST',
            headers: {
              'Authorization': authHeader,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              title: post.title,
              content: post.content || post.body || '',
              status,
              meta: {
                _yoast_wpseo_focuskw: post.keyword || '',
                _yoast_wpseo_metadesc: post.metaDescription || '',
              },
            }),
          });

          if (wpResponse.ok) {
            const wpPost = await wpResponse.json();
            results.push({
              id: postId,
              title: post.title,
              success: true,
              wpUrl: wpPost.link,
            });
          } else {
            const errBody = await wpResponse.text();
            results.push({
              id: postId,
              title: post.title,
              success: false,
              error: `WordPress returned ${wpResponse.status}`,
            });
          }
        } catch (pubErr: any) {
          results.push({
            id: postId,
            title: post.title,
            success: false,
            error: pubErr.message,
          });
        }
      }

      const successCount = results.filter(r => r.success).length;

      return c.json({
        message: `${successCount} of ${blogPostIds.length} posts published to WordPress`,
        results,
      });
    } catch (err) {
      console.error('[SEO Engine] Publish blogs failed:', err);
      return c.json({ error: 'Could not publish to WordPress.' }, 500);
    }
  }
);

// ===============================================================
// AI CONTENT SUGGESTIONS
// ===============================================================

seoEngineRouter.get('/company/:companyId/suggestions', async (c) => {
  const companyId = c.req.param('companyId');

  try {
    const { buildBusinessContext } = await import('../services/business-context');
    const ctx = await buildBusinessContext(companyId);

    // If no business context is set up, return empty with a flag
    if (!ctx.companyName || ctx.companyName === 'Unknown') {
      return c.json({
        needsSetup: true,
        blogTopics: [],
        keywordOpportunities: [],
        contentGaps: [],
      });
    }

    const { llmGenerate, extractJSON } = await import('../lib/llm');

    const { text } = await llmGenerate([
      {
        role: 'system',
        content: `You are an expert SEO content strategist. Given a business profile, suggest high-impact blog topics, keyword opportunities, and content gaps.
Respond ONLY with a JSON object. No markdown, no code fences.`,
      },
      {
        role: 'user',
        content: `Analyze this business and suggest content ideas.

BUSINESS:
- Name: ${ctx.companyName}
- Industry: ${ctx.industry}
- Description: ${ctx.description}
- Products: ${ctx.products.join(', ') || 'N/A'}
- Target audience: ${ctx.targetAudience.join(', ') || 'General'}

Return JSON:
{
  "blogTopics": [
    {
      "id": "unique-slug",
      "title": "Blog post title",
      "keyword": "target keyword",
      "impact": "high" | "medium" | "low",
      "reason": "Why this topic matters (1 sentence)",
      "searchIntent": "informational" | "commercial" | "transactional"
    }
  ],
  "keywordOpportunities": [
    {
      "keyword": "keyword phrase",
      "volume": "high" | "medium" | "low",
      "difficulty": "easy" | "medium" | "hard",
      "intent": "informational" | "commercial" | "transactional"
    }
  ],
  "contentGaps": [
    "Description of a content gap or missing topic"
  ]
}

Generate 5-8 blog topics, 6-10 keyword opportunities, and 3-5 content gaps.
Focus on topics that would drive traffic and leads for this specific business.`,
      },
    ], { maxTokens: 2000 });

    const parsed = extractJSON(text);

    return c.json({
      needsSetup: false,
      blogTopics: parsed?.blogTopics || [],
      keywordOpportunities: parsed?.keywordOpportunities || [],
      contentGaps: parsed?.contentGaps || [],
    });
  } catch (err: any) {
    console.error('[SEO Engine] Suggestions failed:', err);

    if (err.code === 'MODULE_NOT_FOUND') {
      return c.json({ error: 'Service is being set up.' }, 503);
    }

    return c.json({
      needsSetup: false,
      blogTopics: [],
      keywordOpportunities: [],
      contentGaps: [],
      error: 'Could not generate suggestions right now.',
    });
  }
});

// ===============================================================
// GENERATE BLOG FROM SUGGESTION
// ===============================================================

seoEngineRouter.post(
  '/company/:companyId/generate-from-suggestion',
  zValidator('json', z.object({
    suggestions: z.array(z.object({
      title: z.string(),
      keyword: z.string(),
      searchIntent: z.enum(['informational', 'commercial', 'transactional']).default('informational'),
    })).min(1),
    language: z.string().default('en'),
  })),
  async (c) => {
    const companyId = c.req.param('companyId');
    const { suggestions, language } = c.req.valid('json');

    try {
      const { BlogGenerator } = await import('../services/blog-generator');
      const { blogPosts: blogPostsTable } = await import('@1person/core/db');
      const generator = new BlogGenerator();

      const created: any[] = [];

      for (const suggestion of suggestions) {
        try {
          const post = await generator.generateBlogPost(companyId, {
            keyword: suggestion.keyword,
            searchIntent: suggestion.searchIntent,
            language,
            targetWordCount: 1500,
          });

          const [saved] = await db.insert(blogPostsTable).values({
            companyId,
            title: post.title,
            slug: post.slug,
            metaDescription: post.metaDescription,
            content: post.content,
            excerpt: post.excerpt,
            keyword: suggestion.keyword,
            searchIntent: suggestion.searchIntent,
            tags: post.tags as any,
            faq: post.faq as any,
            schemaMarkup: post.schemaMarkup as any,
            wordCount: post.wordCount,
            language,
            status: 'draft',
          }).returning();

          created.push(saved);
        } catch (genErr) {
          console.error(`[SEO Engine] Blog generation failed for "${suggestion.keyword}":`, genErr);
        }
      }

      return c.json({
        message: `${created.length} blog post(s) generated`,
        blogPosts: created,
      });
    } catch (err: any) {
      console.error('[SEO Engine] Generate from suggestion failed:', err);
      return c.json({ error: 'Could not generate blog posts.' }, 500);
    }
  }
);

export default seoEngineRouter;
