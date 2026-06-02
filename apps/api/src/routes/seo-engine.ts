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
import { companies, landingPages, banners, socialPosts } from '@1person/core/db';
import { CMSIntegration } from '../services/cms-integration';
import { encryptSecret, decryptMaybe } from '../lib/crypto';
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
      // SSRF protection: block private network addresses in production
      const parsedUrl = new URL(siteUrl);
      const isDev = process.env.NODE_ENV !== 'production';
      if (!isDev) {
        const blockedHosts = ['0.0.0.0', '::1'];
        const blockedPrefixes = ['10.', '172.16.', '172.17.', '172.18.', '172.19.', '172.20.', '172.21.', '172.22.', '172.23.', '172.24.', '172.25.', '172.26.', '172.27.', '172.28.', '172.29.', '172.30.', '172.31.', '192.168.'];
        if (blockedHosts.includes(parsedUrl.hostname) || blockedPrefixes.some(p => parsedUrl.hostname.startsWith(p))) {
          return c.json({ error: 'Cannot connect to private network addresses' }, 400);
        }
      }

      // Clean up URL — user might paste login URL or URL with trailing path
      const cleanSiteUrl = `${parsedUrl.protocol}//${parsedUrl.host}`;

      // Test the WordPress connection first
      const wpApiUrl = `${cleanSiteUrl}/wp-json/wp/v2/posts?per_page=1`;
      const authHeader = 'Basic ' + Buffer.from(`${username}:${appPassword}`).toString('base64');

      const testResponse = await fetch(wpApiUrl, {
        headers: { 'Authorization': authHeader },
        signal: AbortSignal.timeout(15000),
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
          siteUrl: cleanSiteUrl,
          username,
          // Encrypted at rest (AES-256-GCM). Never returned to the client.
          appPassword: encryptSecret(appPassword),
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
    const authHeader = 'Basic ' + Buffer.from(`${wp.username}:${decryptMaybe(wp.appPassword)}`).toString('base64');

    const testResponse = await fetch(wpApiUrl, {
      headers: { 'Authorization': authHeader },
      signal: AbortSignal.timeout(15000),
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
// WORDPRESS — GET CATEGORIES
// ===============================================================

seoEngineRouter.get('/company/:companyId/wordpress/categories', async (c) => {
  const companyId = c.req.param('companyId');

  try {
    const company = await db.query.companies.findFirst({
      where: eq(companies.id, companyId),
    });

    if (!company) {
      return c.json({ error: 'Company not found' }, 404);
    }

    const wpSettings = (company?.settings as any)?.wordpress;
    if (!wpSettings?.siteUrl) {
      return c.json({ categories: [] });
    }

    const cms = new CMSIntegration();
    const categories = await cms.getCategories(wpSettings.siteUrl, wpSettings.username, decryptMaybe(wpSettings.appPassword));
    return c.json({ categories });
  } catch {
    return c.json({ categories: [], error: 'Could not load categories' });
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
    categoryId: z.number().optional(),
    categoryName: z.string().optional(),
  })),
  async (c) => {
    const companyId = c.req.param('companyId');
    const body = c.req.valid('json');
    const { blogPostIds } = body;

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
      const blogPostsList: any[] = seoData.blogPosts || [];

      const cms = new CMSIntegration();
      const results: Array<{ id: string; title: string; success: boolean; wpUrl?: string; error?: string }> = [];

      // Resolve category once for all posts
      let categoryId = body.categoryId;
      if (!categoryId && body.categoryName) {
        try {
          categoryId = await cms.resolveOrCreateCategory(wp.siteUrl, wp.username, decryptMaybe(wp.appPassword), body.categoryName);
        } catch (catErr) {
          console.error('[SEO Engine] Category resolution failed:', catErr);
        }
      }

      for (const postId of blogPostIds) {
        const blogPost = blogPostsList.find((p: any) => p.id === postId);
        if (!blogPost) {
          results.push({ id: postId, title: 'Unknown', success: false, error: 'Post not found' });
          continue;
        }

        try {
          const result = await cms.publishPost(wp.siteUrl, wp.username, decryptMaybe(wp.appPassword), {
            title: blogPost.title,
            content: blogPost.content || blogPost.body || '',
            excerpt: blogPost.excerpt || '',
            status: body.status || 'draft',
            categories: categoryId ? [categoryId] : undefined,
            tags: (blogPost.tags || []) as string[],
          });

          results.push({
            id: postId,
            title: blogPost.title,
            success: true,
            wpUrl: result.url,
          });
        } catch (pubErr: any) {
          results.push({
            id: postId,
            title: blogPost.title,
            success: false,
            error: pubErr.message || 'Publishing failed',
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

// Cache suggestions per company — LLM runs once, user clicks Refresh to update
const suggestionsCache = new Map<string, { data: any; generatedAt: string }>();

seoEngineRouter.get('/company/:companyId/suggestions', async (c) => {
  const companyId = c.req.param('companyId');
  const forceRefresh = c.req.query('refresh') === 'true';

  // Return cached — never expires, only cleared on manual refresh
  const cached = suggestionsCache.get(companyId);
  if (cached && !forceRefresh) {
    return c.json(cached.data);
  }

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

    const result = {
      needsSetup: false,
      blogTopics: parsed?.blogTopics || [],
      keywordOpportunities: parsed?.keywordOpportunities || [],
      contentGaps: parsed?.contentGaps || [],
      generatedAt: new Date().toISOString(),
    };

    // Enrich with GSC data if available
    try {
      const { knowledgeBase } = await import('@1person/core/db');
      const gscIntegration = await db.query.knowledgeBase.findFirst({
        where: and(
          eq(knowledgeBase.companyId, companyId),
          eq(knowledgeBase.category, 'integration_google')
        ),
      });

      if (gscIntegration) {
        const gscData = JSON.parse(gscIntegration.content);

        // Get company's website URL
        const company = await db.query.companies.findFirst({ where: eq(companies.id, companyId) });
        const websiteUrl = (company as any)?.website || (company as any)?.url;

        if (websiteUrl && gscData.refreshToken) {
          try {
            const { GSCClient } = await import('../services/gsc-client');
            const gsc = new GSCClient(gscData.refreshToken);
            const queryData = await gsc.fetchQueryPerformance(websiteUrl, 28);

            // Enrich each keyword with real ranking data
            for (const kw of result.keywordOpportunities) {
              const match = (queryData || []).find((q: any) =>
                q.query?.toLowerCase().includes(kw.keyword.toLowerCase()) ||
                kw.keyword.toLowerCase().includes(q.query?.toLowerCase())
              );
              if (match) {
                (kw as any).currentPosition = Math.round(match.position || 0);
                (kw as any).clicks = match.clicks || 0;
                (kw as any).impressions = match.impressions || 0;
                (kw as any).status = 'ranking';
              } else {
                (kw as any).status = 'not_ranking';
              }
            }
          } catch (gscErr) {
            console.warn('[SEO] GSC enrichment failed:', gscErr);
            // Non-fatal — keywords still work without GSC data
          }
        }
      }
    } catch {
      // GSC enrichment is optional
    }

    suggestionsCache.set(companyId, { data: result, generatedAt: result.generatedAt });

    return c.json(result);
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
      searchIntent: z.string().optional(),
    })).optional(),
    keywords: z.array(z.object({
      keyword: z.string(),
      volume: z.string().optional(),
      competition: z.string().optional(),
    })).optional(),
    language: z.string().default('en'),
  })),
  async (c) => {
    const companyId = c.req.param('companyId');
    const body = c.req.valid('json');
    const language = body.language;

    try {
      const { BlogGenerator } = await import('../services/blog-generator');
      const { blogPosts: blogPostsTable } = await import('@1person/core/db');
      const { llmGenerate } = await import('../lib/llm');
      const { buildBusinessContext } = await import('../services/business-context');
      const generator = new BlogGenerator();

      // Merge suggestions + keywords into one list
      const allSuggestions: Array<{ title: string; keyword: string; searchIntent: string }> = [];

      if (body.suggestions?.length) {
        for (const s of body.suggestions) {
          allSuggestions.push({ title: s.title, keyword: s.keyword, searchIntent: s.searchIntent || 'informational' });
        }
      }

      if (body.keywords?.length) {
        const ctx = await buildBusinessContext(companyId);
        for (const kw of body.keywords) {
          try {
            const { text } = await llmGenerate([{
              role: 'user',
              content: `Generate a compelling blog post title for the keyword "${kw.keyword}" in the context of: ${ctx.companyName} - ${ctx.industry}. Return ONLY the title, nothing else.`,
            }], { maxTokens: 100 });

            const title = text.trim().replace(/^["']|["']$/g, '');
            allSuggestions.push({ title, keyword: kw.keyword, searchIntent: 'informational' });
          } catch (titleErr) {
            console.error(`[SEO Engine] Title generation failed for "${kw.keyword}":`, titleErr);
          }
        }
      }

      if (allSuggestions.length === 0) {
        return c.json({ error: 'Provide at least one suggestion or keyword.' }, 400);
      }

      const results: any[] = [];

      for (const suggestion of allSuggestions) {
        try {
          // --- Blog post ---
          const post = await generator.generateBlogPost(companyId, {
            keyword: suggestion.keyword,
            searchIntent: suggestion.searchIntent as any,
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

          results.push(saved);

          // --- Landing page ---
          try {
            const slug = suggestion.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').substring(0, 80);
            await db.insert(landingPages).values({
              companyId,
              name: suggestion.title,
              slug,
              description: `Landing page for ${suggestion.keyword}`,
              originalPrompt: suggestion.title,
              status: 'draft',
              content: {
                headline: suggestion.title,
                subheadline: post.excerpt || post.metaDescription,
                ctaText: 'Get Started',
              },
              seo: {
                title: suggestion.title,
                description: post.metaDescription,
                keywords: [suggestion.keyword, ...(post.tags || []).slice(0, 3)],
              },
            });
          } catch (lpErr) {
            console.error(`[SEO Engine] Landing page creation failed for "${suggestion.keyword}":`, lpErr);
          }

          // --- 3 banners (different angles) ---
          try {
            const angleThemes: Record<string, { primary: string; secondary: string; text: string; ctaBg: string; ctaText: string }> = {
              benefit: { primary: '#6366f1', secondary: '#8b5cf6', text: '#fff', ctaBg: '#fff', ctaText: '#6366f1' },
              urgency: { primary: '#dc2626', secondary: '#7c2d12', text: '#fff', ctaBg: '#fbbf24', ctaText: '#1e293b' },
              'social-proof': { primary: '#1e3a5f', secondary: '#3b82f6', text: '#fff', ctaBg: '#3b82f6', ctaText: '#fff' },
            };

            for (const [angle, theme] of Object.entries(angleThemes)) {
              const headline = suggestion.title.split(' ').slice(0, 8).join(' ');
              await db.insert(banners).values({
                companyId,
                name: `${headline} - ${angle}`,
                size: '1200x628',
                status: 'draft',
                copy: { headline, subheadline: post.excerpt?.substring(0, 60), cta: 'Learn More', brandColor: theme.primary },
                design: {
                  layout: angle === 'social-proof' ? 'testimonial' : angle === 'urgency' ? 'bold-cta' : 'center',
                  backgroundType: 'gradient',
                  backgroundValue: `linear-gradient(135deg, ${theme.primary}, ${theme.secondary})`,
                  colorTheme: theme,
                  typography: { headlineSize: 'lg', headlineWeight: 800, alignment: 'center' },
                  overlayOpacity: 0.6,
                },
                angle,
                strategyTag: angle,
              });
            }
          } catch (bannerErr) {
            console.error(`[SEO Engine] Banner creation failed for "${suggestion.keyword}":`, bannerErr);
          }

          // --- 2 social posts ---
          try {
            for (const platform of ['linkedin', 'facebook']) {
              await db.insert(socialPosts).values({
                companyId,
                platform,
                content: `${post.excerpt || suggestion.title}\n\n${(post.tags || []).slice(0, 5).map((t: string) => `#${t.replace(/\s+/g, '')}`).join(' ')}`,
                hashtags: (post.tags || []).slice(0, 5) as string[],
                status: 'draft',
              });
            }
          } catch (socialErr) {
            console.error(`[SEO Engine] Social post creation failed for "${suggestion.keyword}":`, socialErr);
          }

        } catch (genErr) {
          console.error(`[SEO Engine] Blog generation failed for "${suggestion.keyword}":`, genErr);
        }
      }

      return c.json({
        generated: results.length,
        posts: results,
        counts: {
          blogs: results.length,
          landingPages: results.length,
          banners: results.length * 3,
          socialPosts: results.length * 2,
        },
        message: `Created ${results.length} blog posts, ${results.length} landing pages, ${results.length * 3} banners, ${results.length * 2} social posts`,
      });
    } catch (err: any) {
      console.error('[SEO Engine] Generate from suggestion failed:', err);
      return c.json({ error: 'Could not generate content. Please try again.' }, 500);
    }
  }
);

// ===============================================================
// GET SINGLE BLOG POST
// ===============================================================

seoEngineRouter.get('/company/:companyId/blogs/:blogId', async (c) => {
  const companyId = c.req.param('companyId');
  const blogId = c.req.param('blogId');

  try {
    const { blogPosts: blogPostsTable } = await import('@1person/core/db');

    const post = await db.query.blogPosts.findFirst({
      where: and(eq(blogPostsTable.id, blogId), eq(blogPostsTable.companyId, companyId)),
    });

    if (!post) {
      return c.json({ error: 'Blog post not found' }, 404);
    }

    return c.json(post);
  } catch (err) {
    console.error('[SEO Engine] Get blog post failed:', err);
    return c.json({ error: 'Could not load blog post.' }, 500);
  }
});

// ===============================================================
// UPDATE BLOG POST
// ===============================================================

seoEngineRouter.patch(
  '/company/:companyId/blogs/:blogId',
  zValidator('json', z.object({
    title: z.string().min(1).optional(),
    keyword: z.string().optional(),
    metaDescription: z.string().optional(),
    content: z.string().optional(),
    excerpt: z.string().optional(),
    tags: z.array(z.string()).optional(),
    faq: z.array(z.object({ question: z.string(), answer: z.string() })).optional(),
  })),
  async (c) => {
    const companyId = c.req.param('companyId');
    const blogId = c.req.param('blogId');
    const body = c.req.valid('json');

    try {
      const { blogPosts: blogPostsTable } = await import('@1person/core/db');

      const [updated] = await db.update(blogPostsTable)
        .set({ ...body, updatedAt: new Date() })
        .where(and(eq(blogPostsTable.id, blogId), eq(blogPostsTable.companyId, companyId)))
        .returning();

      if (!updated) {
        return c.json({ error: 'Blog post not found' }, 404);
      }

      return c.json(updated);
    } catch (err) {
      console.error('[SEO Engine] Update blog post failed:', err);
      return c.json({ error: 'Could not update blog post.' }, 500);
    }
  }
);

// ===============================================================
// DELETE BLOG POST
// ===============================================================

seoEngineRouter.delete('/company/:companyId/blogs/:blogId', async (c) => {
  const companyId = c.req.param('companyId');
  const blogId = c.req.param('blogId');

  try {
    const { blogPosts: blogPostsTable } = await import('@1person/core/db');

    await db.delete(blogPostsTable)
      .where(and(eq(blogPostsTable.id, blogId), eq(blogPostsTable.companyId, companyId)));

    return c.json({ success: true });
  } catch (err) {
    console.error('[SEO Engine] Delete blog post failed:', err);
    return c.json({ error: 'Could not delete blog post.' }, 500);
  }
});

// ===============================================================
// KEYWORD DASHBOARD — Unified GSC + Content + AI Suggestions
// ===============================================================

const keywordDashboardCache = new Map<string, { data: any; generatedAt: string }>();

seoEngineRouter.get('/company/:companyId/keyword-dashboard', async (c) => {
  const companyId = c.req.param('companyId');
  const forceRefresh = c.req.query('refresh') === 'true';

  const cached = keywordDashboardCache.get(companyId);
  if (cached && !forceRefresh) return c.json(cached.data);

  try {
    const { knowledgeBase } = await import('@1person/core/db');
    const { sql } = await import('drizzle-orm');
    const { buildBusinessContext } = await import('../services/business-context');

    await buildBusinessContext(companyId);
    const company = await db.query.companies.findFirst({ where: eq(companies.id, companyId) });
    const websiteUrl = (company as any)?.website || (company as any)?.url || '';

    // 1. Fetch GSC data if connected
    let gscKeywords: Array<{ query: string; clicks: number; impressions: number; ctr: number; position: number }> = [];
    let gscConnected = false;

    try {
      const gscEntry = await db.query.knowledgeBase.findFirst({
        where: and(eq(knowledgeBase.companyId, companyId), eq(knowledgeBase.category, 'integration_google')),
      });

      if (gscEntry) {
        const gscData = JSON.parse(gscEntry.content);
        if (gscData.refreshToken && websiteUrl) {
          const { GSCClient } = await import('../services/gsc-client');
          const gsc = new GSCClient(gscData.refreshToken);
          gscKeywords = (await gsc.fetchQueryPerformance(websiteUrl, 28)) || [];
          gscConnected = true;
        }
      }
    } catch (err) {
      console.warn('[SEO Dashboard] GSC fetch failed:', err);
    }

    // 2. Fetch existing content (blogs + pages)
    let blogs: Array<{ id: string; title: string; keyword: string; status: string }> = [];
    let pages: Array<{ id: string; name: string; seo: any; status: string }> = [];

    try {
      const blogRows = await db.execute(sql`
        SELECT id, title, keyword, status FROM blog_posts WHERE company_id = ${companyId}
      `);
      blogs = (blogRows as any[]) || [];
    } catch {}

    try {
      const pageRows = await db.execute(sql`
        SELECT id, name, seo, status FROM landing_pages WHERE company_id = ${companyId}
      `);
      pages = (pageRows as any[]) || [];
    } catch {}

    // 3. Get AI suggestions for new opportunities
    let aiKeywords: string[] = [];
    const cachedSuggestions = suggestionsCache.get(companyId);
    if (cachedSuggestions?.data?.keywordOpportunities) {
      aiKeywords = cachedSuggestions.data.keywordOpportunities.map((k: any) => k.keyword);
    }

    // 4. Merge all sources into unified keyword list
    const keywordMap = new Map<string, any>();

    // Add GSC keywords
    for (const gsc of gscKeywords) {
      const kw = gsc.query.toLowerCase();
      keywordMap.set(kw, {
        keyword: gsc.query,
        position: Math.round(gsc.position),
        clicks: gsc.clicks,
        impressions: gsc.impressions,
        ctr: +(gsc.ctr).toFixed(1),
        trend: 'stable',
        source: 'gsc',
        content: { hasBlog: false, hasPage: false },
      });
    }

    // Add AI suggestion keywords not in GSC
    for (const aiKw of aiKeywords) {
      const kw = aiKw.toLowerCase();
      if (!keywordMap.has(kw)) {
        keywordMap.set(kw, {
          keyword: aiKw,
          position: null,
          clicks: 0,
          impressions: 0,
          ctr: 0,
          trend: 'new',
          source: 'ai_suggestion',
          content: { hasBlog: false, hasPage: false },
        });
      }
    }

    // Add keywords from existing content that aren't in GSC or AI
    for (const blog of blogs) {
      if (blog.keyword) {
        const kw = blog.keyword.toLowerCase();
        if (!keywordMap.has(kw)) {
          keywordMap.set(kw, {
            keyword: blog.keyword,
            position: null,
            clicks: 0,
            impressions: 0,
            ctr: 0,
            trend: 'new',
            source: 'content',
            content: { hasBlog: false, hasPage: false },
          });
        }
      }
    }

    // 5. Map content to keywords
    for (const [kw, data] of keywordMap) {
      // Check blogs
      const matchingBlog = blogs.find(b => b.keyword?.toLowerCase() === kw);
      if (matchingBlog) {
        data.content.hasBlog = true;
        data.content.blogId = matchingBlog.id;
        data.content.blogTitle = matchingBlog.title;
      }

      // Check pages (seo.keywords array)
      const matchingPage = pages.find(p => {
        const pageKws = (p.seo as any)?.keywords || [];
        return pageKws.some((pk: string) => pk.toLowerCase().includes(kw) || kw.includes(pk.toLowerCase()));
      });
      if (matchingPage) {
        data.content.hasPage = true;
        data.content.pageId = matchingPage.id;
        data.content.pageName = matchingPage.name;
      }

      // 6. Calculate recommended action
      const hasContent = data.content.hasBlog || data.content.hasPage;
      const pos = data.position;

      if (!hasContent) {
        data.recommendedAction = 'create';
        data.actionReason = 'No content yet — create a blog post or landing page';
        data.opportunity = 'high';
      } else if (pos && pos <= 10) {
        data.recommendedAction = 'scale';
        data.actionReason = 'Ranking well — create more related content to dominate';
        data.opportunity = 'medium';
      } else if (pos && pos <= 30) {
        data.recommendedAction = 'optimize';
        data.actionReason = data.ctr < 2 ? 'Low CTR — optimize title and meta description' : 'Close to top 10 — strengthen content';
        data.opportunity = 'high';
      } else if (pos && pos <= 50) {
        data.recommendedAction = 'improve';
        data.actionReason = 'Needs improvement — expand content, add more detail';
        data.opportunity = 'high';
      } else if (pos && pos > 50) {
        data.recommendedAction = 'improve';
        data.actionReason = 'Low ranking — consider rewriting or targeting a more specific keyword';
        data.opportunity = 'medium';
      } else {
        // Has content but no GSC data (not indexed yet?)
        data.recommendedAction = 'monitor';
        data.actionReason = 'Content created — waiting for Google to index';
        data.opportunity = 'low';
      }
    }

    // 7. Sort: high opportunity first, then by clicks
    const keywords = Array.from(keywordMap.values()).sort((a, b) => {
      const oppOrder = { high: 0, medium: 1, low: 2 };
      const oppDiff = (oppOrder[a.opportunity as keyof typeof oppOrder] || 2) - (oppOrder[b.opportunity as keyof typeof oppOrder] || 2);
      if (oppDiff !== 0) return oppDiff;
      return (b.clicks || 0) - (a.clicks || 0);
    });

    // 8. Summary
    const summary = {
      totalKeywords: keywords.length,
      rankingTop10: keywords.filter(k => k.position && k.position <= 10).length,
      rankingTop50: keywords.filter(k => k.position && k.position <= 50).length,
      noContent: keywords.filter(k => !k.content.hasBlog && !k.content.hasPage).length,
      needsOptimization: keywords.filter(k => k.recommendedAction === 'optimize' || k.recommendedAction === 'improve').length,
    };

    const result = {
      keywords,
      summary,
      gscConnected,
      lastUpdated: new Date().toISOString(),
    };

    keywordDashboardCache.set(companyId, { data: result, generatedAt: result.lastUpdated });
    return c.json(result);

  } catch (err) {
    console.error('[SEO Dashboard] Failed:', err);
    return c.json({
      keywords: [],
      summary: { totalKeywords: 0, rankingTop10: 0, rankingTop50: 0, noContent: 0, needsOptimization: 0 },
      gscConnected: false,
      lastUpdated: new Date().toISOString(),
      error: 'Could not load keyword data',
    });
  }
});

export default seoEngineRouter;
