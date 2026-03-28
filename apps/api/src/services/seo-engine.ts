/**
 * SEO Engine — 1-Click SEO Pipeline Orchestrator
 *
 * Runs a 7-step pipeline that takes a company from zero to
 * full SEO presence: scan → understand → keywords → plan → generate → deploy → distribute.
 *
 * Each step updates a job object so the frontend can show real-time progress.
 *
 * Used by: SEO dashboard API routes
 */

import { db } from '../lib/db';
import { eq } from 'drizzle-orm';
import {
  landingPages,
  landingPageSections,
  socialPosts,
  blogPosts,
} from '@1person/core/db';
import { llmGenerate, extractJSON } from '../lib/llm';
import { buildBusinessContext, type BusinessContext } from './business-context';
import { WebsiteAnalyzerService, type WebsiteAnalysisResult } from './website-analyzer';
import { blogGenerator } from './blog-generator';
import { randomUUID } from 'crypto';

// =============================================================================
// TYPES
// =============================================================================

export interface SEOJob {
  id: string;
  companyId: string;
  status:
    | 'scanning'
    | 'understanding'
    | 'keywords'
    | 'planning'
    | 'generating'
    | 'deploying'
    | 'distributing'
    | 'completed'
    | 'failed';
  progress: {
    currentStep: number;
    totalSteps: 7;
    stepName: string;
    details: string;
  };
  results: {
    pagesFound?: number;
    businessType?: string;
    keywordClusters?: number;
    totalKeywords?: number;
    landingPages?: Array<{ id: string; title: string; url?: string }>;
    blogPosts?: Array<{ id: string; title: string; keyword: string }>;
    socialPosts?: number;
    utmLinks?: Array<{ url: string; campaign: string }>;
  };
  error?: string;
  startedAt: Date;
  completedAt?: Date;
}

interface KeywordCluster {
  mainKeyword: string;
  relatedKeywords: string[];
  searchIntent: 'informational' | 'commercial' | 'transactional';
  contentType: 'landing_page' | 'blog_post' | 'both';
  product?: string;
}

interface ContentPlanItem {
  type: 'landing_page' | 'blog_post';
  keyword: string;
  searchIntent: 'informational' | 'commercial' | 'transactional';
  title: string;
  priority: number;
  cluster: string;
}

interface PipelineOptions {
  websiteUrl?: string;
  products?: Array<{ name: string; description: string; url?: string }>;
  language?: string;
}

// =============================================================================
// ENGINE
// =============================================================================

export class SEOEngine {
  private jobs = new Map<string, SEOJob>();
  private websiteAnalyzer = new WebsiteAnalyzerService();

  /**
   * Start the full SEO pipeline. Runs async — returns job ID immediately.
   */
  async startPipeline(companyId: string, options: PipelineOptions): Promise<string> {
    const jobId = randomUUID().replace(/-/g, '').substring(0, 16);

    const job: SEOJob = {
      id: jobId,
      companyId,
      status: 'scanning',
      progress: {
        currentStep: 1,
        totalSteps: 7,
        stepName: 'Scanning website',
        details: 'Starting SEO pipeline...',
      },
      results: {},
      startedAt: new Date(),
    };

    this.jobs.set(jobId, job);

    // Run pipeline in background — don't await
    this.runPipeline(job, options).catch((err) => {
      job.status = 'failed';
      job.error = err.message || 'An unexpected error occurred during the SEO pipeline.';
      job.completedAt = new Date();
    });

    return jobId;
  }

  /**
   * Get current job status.
   */
  getJobStatus(jobId: string): SEOJob | undefined {
    return this.jobs.get(jobId);
  }

  /**
   * List all jobs for a company.
   */
  getJobsByCompany(companyId: string): SEOJob[] {
    return Array.from(this.jobs.values()).filter((j) => j.companyId === companyId);
  }

  // ===========================================================================
  // PIPELINE
  // ===========================================================================

  private async runPipeline(job: SEOJob, options: PipelineOptions): Promise<void> {
    const language = options.language || 'en';

    try {
      // Step 1: Scan
      const scanResult = await this.step1_scan(job, options);

      // Step 2: Understand business
      const businessCtx = await this.step2_understand(job);

      // Step 3: Keywords
      const clusters = await this.step3_keywords(job, businessCtx, scanResult, language);

      // Step 4: Plan
      const plan = await this.step4_plan(job, clusters, businessCtx, language);

      // Step 5: Generate
      await this.step5_generate(job, plan, language);

      // Step 6: Deploy
      await this.step6_deploy(job);

      // Step 7: Distribute
      await this.step7_distribute(job, businessCtx, language);

      // Done
      job.status = 'completed';
      job.progress = {
        currentStep: 7,
        totalSteps: 7,
        stepName: 'Completed',
        details: 'SEO pipeline finished successfully.',
      };
      job.completedAt = new Date();
    } catch (err: any) {
      job.status = 'failed';
      job.error = err.message || 'Pipeline failed unexpectedly.';
      job.completedAt = new Date();
    }
  }

  // ===========================================================================
  // STEP 1: SCAN
  // ===========================================================================

  private async step1_scan(
    job: SEOJob,
    options: PipelineOptions
  ): Promise<WebsiteAnalysisResult | null> {
    job.status = 'scanning';
    job.progress = {
      currentStep: 1,
      totalSteps: 7,
      stepName: 'Scanning website',
      details: options.websiteUrl
        ? `Analyzing ${options.websiteUrl}...`
        : 'Using product catalog data...',
    };

    // If products provided directly, skip crawling
    if (options.products && options.products.length > 0) {
      job.results.pagesFound = options.products.length;
      job.progress.details = `Found ${options.products.length} products to optimize.`;
      return null;
    }

    // If URL provided, run website analysis
    if (options.websiteUrl) {
      try {
        const analysis = await this.websiteAnalyzer.analyze(options.websiteUrl);
        job.results.pagesFound = analysis.keywordOpportunities?.length || 0;
        job.progress.details = `Scanned website. Found ${job.results.pagesFound} keyword opportunities.`;
        return analysis;
      } catch (err: any) {
        job.progress.details = `Website scan had issues (${err.message}). Continuing with business data...`;
        return null;
      }
    }

    job.progress.details = 'No website URL or products provided. Using business profile data.';
    return null;
  }

  // ===========================================================================
  // STEP 2: UNDERSTAND BUSINESS
  // ===========================================================================

  private async step2_understand(job: SEOJob): Promise<BusinessContext> {
    job.status = 'understanding';
    job.progress = {
      currentStep: 2,
      totalSteps: 7,
      stepName: 'Understanding business',
      details: 'Loading business context and knowledge base...',
    };

    const ctx = await buildBusinessContext(job.companyId);
    job.results.businessType = ctx.businessType || ctx.industry || 'Unknown';
    job.progress.details = `Understood: ${ctx.companyName} — ${job.results.businessType}`;

    return ctx;
  }

  // ===========================================================================
  // STEP 3: KEYWORD RESEARCH
  // ===========================================================================

  private async step3_keywords(
    job: SEOJob,
    ctx: BusinessContext,
    scanResult: WebsiteAnalysisResult | null,
    language: string
  ): Promise<KeywordCluster[]> {
    job.status = 'keywords';
    job.progress = {
      currentStep: 3,
      totalSteps: 7,
      stepName: 'Keyword research',
      details: 'Generating keyword clusters with AI...',
    };

    const existingKeywords = scanResult?.keywordOpportunities?.map((k) => k.keyword) || [];

    const resp = await llmGenerate(
      [
        {
          role: 'system',
          content: `You are an expert SEO keyword researcher. Generate keyword clusters for a business.
All keywords MUST be in language: ${language}.
Respond ONLY with a JSON object.`,
        },
        {
          role: 'user',
          content: `Generate SEO keyword clusters for this business:

Company: ${ctx.companyName}
Industry: ${ctx.industry}
Description: ${ctx.description}
Products/Services: ${ctx.products.join(', ') || 'Not specified'}
Target audience: ${ctx.targetAudience.join(', ') || 'General'}

${existingKeywords.length > 0 ? `Existing keyword opportunities from website scan: ${existingKeywords.join(', ')}` : ''}

Generate 5-8 keyword clusters. Each cluster should target a different topic/product.

Return JSON:
{
  "clusters": [
    {
      "mainKeyword": "primary target keyword",
      "relatedKeywords": ["variation 1", "variation 2", "long tail 1"],
      "searchIntent": "informational|commercial|transactional",
      "contentType": "landing_page|blog_post|both",
      "product": "related product/service name or null"
    }
  ]
}

Rules:
- Mix of informational (blog), commercial (comparison), and transactional (landing page) intents
- Include long-tail keywords (3-5 words) in relatedKeywords
- Each cluster should have 3-6 related keywords
- All keywords in ${language}`,
        },
      ],
      { maxTokens: 3000, json: true }
    );

    const parsed = extractJSON(resp.text);
    const clusters: KeywordCluster[] = parsed?.clusters || [];

    if (clusters.length === 0) {
      throw new Error('Keyword research failed — AI could not generate keyword clusters for this business.');
    }

    job.results.keywordClusters = clusters.length;
    job.results.totalKeywords = clusters.reduce(
      (sum, c) => sum + 1 + c.relatedKeywords.length,
      0
    );
    job.progress.details = `Found ${job.results.keywordClusters} clusters with ${job.results.totalKeywords} total keywords.`;

    return clusters;
  }

  // ===========================================================================
  // STEP 4: CONTENT PLAN
  // ===========================================================================

  private async step4_plan(
    job: SEOJob,
    clusters: KeywordCluster[],
    ctx: BusinessContext,
    language: string
  ): Promise<ContentPlanItem[]> {
    job.status = 'planning';
    job.progress = {
      currentStep: 4,
      totalSteps: 7,
      stepName: 'Planning content',
      details: 'Creating content calendar from keyword clusters...',
    };

    const resp = await llmGenerate(
      [
        {
          role: 'system',
          content: `You are a content strategist. Create a content plan from keyword clusters.
All titles MUST be in language: ${language}.
Respond ONLY with a JSON object.`,
        },
        {
          role: 'user',
          content: `Create a content plan for ${ctx.companyName}.

Keyword clusters:
${JSON.stringify(clusters, null, 2)}

For each cluster, plan:
- 1 landing page (for transactional/commercial keywords)
- 2-3 blog posts (for informational keywords and supporting content)

If a cluster has contentType "blog_post" only, skip the landing page.
If contentType is "landing_page" only, skip blog posts.
If "both", create both.

Return JSON:
{
  "plan": [
    {
      "type": "landing_page|blog_post",
      "keyword": "target keyword",
      "searchIntent": "informational|commercial|transactional",
      "title": "Page or post title",
      "priority": 1,
      "cluster": "main keyword of the cluster"
    }
  ]
}

Rules:
- Prioritize transactional keywords (priority 1) > commercial (2) > informational (3)
- Landing page titles should be action-oriented
- Blog post titles should be question-based or how-to
- Total: 3-6 landing pages, 8-15 blog posts
- All titles in ${language}`,
        },
      ],
      { maxTokens: 3000, json: true }
    );

    const parsed = extractJSON(resp.text);
    const plan: ContentPlanItem[] = parsed?.plan || [];

    if (plan.length === 0) {
      throw new Error('Content planning failed — AI could not create a content plan.');
    }

    // Sort by priority
    plan.sort((a, b) => a.priority - b.priority);

    const lpCount = plan.filter((p) => p.type === 'landing_page').length;
    const bpCount = plan.filter((p) => p.type === 'blog_post').length;
    job.progress.details = `Planned ${lpCount} landing pages and ${bpCount} blog posts.`;

    return plan;
  }

  // ===========================================================================
  // STEP 5: GENERATE CONTENT
  // ===========================================================================

  private async step5_generate(
    job: SEOJob,
    plan: ContentPlanItem[],
    language: string
  ): Promise<void> {
    job.status = 'generating';
    job.progress = {
      currentStep: 5,
      totalSteps: 7,
      stepName: 'Generating content',
      details: 'Creating landing pages and blog posts...',
    };

    job.results.landingPages = [];
    job.results.blogPosts = [];

    const landingPageItems = plan.filter((p) => p.type === 'landing_page');
    const blogPostItems = plan.filter((p) => p.type === 'blog_post');

    // Generate landing pages
    for (const [i, item] of landingPageItems.entries()) {
      job.progress.details = `Generating landing page ${i + 1}/${landingPageItems.length}: ${item.title}`;

      try {
        const pageId = await this.generateLandingPage(job.companyId, item, language, job.id);
        job.results.landingPages!.push({ id: pageId, title: item.title });
      } catch (err: any) {
        // Non-fatal: log and continue
        console.error(`[SEO Engine] Landing page generation failed for "${item.keyword}":`, err.message);
      }
    }

    // Generate blog posts
    for (const [i, item] of blogPostItems.entries()) {
      job.progress.details = `Generating blog post ${i + 1}/${blogPostItems.length}: ${item.title}`;

      try {
        const postId = await this.generateBlogPost(job.companyId, item, language, job.id);
        job.results.blogPosts!.push({ id: postId, title: item.title, keyword: item.keyword });
      } catch (err: any) {
        console.error(`[SEO Engine] Blog post generation failed for "${item.keyword}":`, err.message);
      }
    }

    job.progress.details = `Generated ${job.results.landingPages!.length} landing pages and ${job.results.blogPosts!.length} blog posts.`;
  }

  private async generateLandingPage(
    companyId: string,
    item: ContentPlanItem,
    language: string,
    seoJobId: string
  ): Promise<string> {
    const ctx = await buildBusinessContext(companyId);
    const slug = this.slugify(item.title);

    // Generate page sections via LLM
    const resp = await llmGenerate(
      [
        {
          role: 'system',
          content: `You are an expert landing page copywriter. Create conversion-optimized page sections.
All content MUST be in language: ${language}.
Respond ONLY with a JSON object.`,
        },
        {
          role: 'user',
          content: `Create landing page sections for:
Title: ${item.title}
Keyword: ${item.keyword}
Business: ${ctx.companyName} — ${ctx.description}
Target audience: ${ctx.targetAudience.join(', ') || 'General'}

Return JSON:
{
  "seo": {
    "title": "SEO title (50-60 chars) with keyword",
    "description": "Meta description (150-160 chars)",
    "keywords": ["keyword1", "keyword2"]
  },
  "sections": [
    {
      "type": "hero",
      "content": {
        "headline": "Main headline with keyword",
        "subheadline": "Supporting text",
        "ctaText": "Call to action button text",
        "alignment": "center"
      }
    },
    {
      "type": "problem",
      "content": { "title": "Section title", "description": "Problem description" }
    },
    {
      "type": "solution",
      "content": { "title": "Section title", "description": "How we solve it" }
    },
    {
      "type": "features",
      "content": {
        "features": [
          { "title": "Feature 1", "description": "Description" },
          { "title": "Feature 2", "description": "Description" },
          { "title": "Feature 3", "description": "Description" }
        ]
      }
    },
    {
      "type": "faq",
      "content": {
        "faqs": [
          { "question": "Q1?", "answer": "A1" },
          { "question": "Q2?", "answer": "A2" }
        ]
      }
    },
    {
      "type": "cta",
      "content": { "title": "Final CTA headline", "description": "Urgency text", "ctaText": "Button text" }
    }
  ]
}

All text in ${language}.`,
        },
      ],
      { maxTokens: 3000, json: true }
    );

    const parsed = extractJSON(resp.text);
    if (!parsed || !parsed.sections) {
      throw new Error('Failed to generate landing page sections');
    }

    // Insert landing page into DB
    const rows = await db
      .insert(landingPages)
      .values({
        companyId,
        name: item.title,
        slug,
        description: `SEO landing page for "${item.keyword}"`,
        originalPrompt: `SEO pipeline: ${item.keyword}`,
        seo: parsed.seo || { title: item.title, description: '', keywords: [item.keyword] },
        status: 'draft',
      })
      .returning({ id: landingPages.id });

    const page = rows[0];
    if (!page) throw new Error('Failed to insert landing page into database');

    // Insert sections
    for (const [i, section] of (parsed.sections as any[]).entries()) {
      await db.insert(landingPageSections).values({
        pageId: page.id,
        type: section.type || 'custom',
        name: section.type || `Section ${i + 1}`,
        order: i,
        content: section.content,
      });
    }

    return page.id;
  }

  private async generateBlogPost(
    companyId: string,
    item: ContentPlanItem,
    language: string,
    seoJobId: string
  ): Promise<string> {
    const post = await blogGenerator.generateBlogPost(companyId, {
      keyword: item.keyword,
      searchIntent: item.searchIntent,
      language,
    });

    // Store in blog_posts table
    const insertedRows = await db
      .insert(blogPosts)
      .values({
        companyId,
        title: post.title,
        slug: post.slug,
        metaDescription: post.metaDescription,
        content: post.content,
        excerpt: post.excerpt,
        keyword: item.keyword,
        searchIntent: item.searchIntent,
        tags: post.tags,
        faq: post.faq,
        schemaMarkup: post.schemaMarkup,
        wordCount: post.wordCount,
        language,
        status: 'draft',
        seoJobId,
      })
      .returning({ id: blogPosts.id });

    const inserted = insertedRows[0];
    if (!inserted) throw new Error('Failed to insert blog post into database');

    return inserted.id;
  }

  // ===========================================================================
  // STEP 6: DEPLOY
  // ===========================================================================

  private async step6_deploy(job: SEOJob): Promise<void> {
    job.status = 'deploying';
    job.progress = {
      currentStep: 6,
      totalSteps: 7,
      stepName: 'Deploying content',
      details: 'Landing pages are ready for deployment. Blog posts saved as drafts.',
    };

    // Landing pages: the existing deployment system handles this.
    // Blog posts: stay in DB with status='draft', ready for WordPress push via CMS integration.
    // For MVP, we just mark them as ready.

    job.progress.details = `${job.results.landingPages?.length || 0} landing pages ready for deployment. ${job.results.blogPosts?.length || 0} blog posts saved as drafts.`;
  }

  // ===========================================================================
  // STEP 7: DISTRIBUTE
  // ===========================================================================

  private async step7_distribute(
    job: SEOJob,
    ctx: BusinessContext,
    language: string
  ): Promise<void> {
    job.status = 'distributing';
    job.progress = {
      currentStep: 7,
      totalSteps: 7,
      stepName: 'Creating social distribution',
      details: 'Generating social media posts for content promotion...',
    };

    const contentPieces: Array<{ title: string; type: string; keyword: string }> = [];

    for (const lp of job.results.landingPages || []) {
      contentPieces.push({ title: lp.title, type: 'landing_page', keyword: '' });
    }
    for (const bp of job.results.blogPosts || []) {
      contentPieces.push({ title: bp.title, type: 'blog_post', keyword: bp.keyword });
    }

    if (contentPieces.length === 0) {
      job.progress.details = 'No content to distribute.';
      job.results.socialPosts = 0;
      return;
    }

    // Generate 2 social posts per content piece
    const resp = await llmGenerate(
      [
        {
          role: 'system',
          content: `You are a social media marketer. Create promotional posts for new content.
All posts MUST be in language: ${language}.
Respond ONLY with a JSON object.`,
        },
        {
          role: 'user',
          content: `Create 2 social media posts for each of these content pieces:

Company: ${ctx.companyName}
Industry: ${ctx.industry}

Content pieces:
${contentPieces.map((c, i) => `${i + 1}. [${c.type}] ${c.title} (keyword: ${c.keyword || 'N/A'})`).join('\n')}

Return JSON:
{
  "posts": [
    {
      "contentTitle": "title of the content piece",
      "platform": "linkedin|facebook",
      "content": "Post text (150-280 chars). Include a hook, value prop, and CTA.",
      "hashtags": ["hashtag1", "hashtag2", "hashtag3"]
    }
  ]
}

Rules:
- 1 LinkedIn post + 1 Facebook post per content piece
- LinkedIn: professional tone, value-driven
- Facebook: conversational, engagement-focused
- Include 3-5 relevant hashtags per post
- All text in ${language}`,
        },
      ],
      { maxTokens: 4000, json: true }
    );

    const parsed = extractJSON(resp.text);
    const generatedPosts = parsed?.posts || [];

    let insertedCount = 0;
    for (const post of generatedPosts) {
      try {
        await db.insert(socialPosts).values({
          companyId: job.companyId,
          platform: post.platform || 'linkedin',
          status: 'draft',
          content: post.content,
          hashtags: post.hashtags || [],
        });
        insertedCount++;
      } catch (err: any) {
        console.error('[SEO Engine] Social post insert failed:', err.message);
      }
    }

    job.results.socialPosts = insertedCount;

    // Generate UTM links
    job.results.utmLinks = contentPieces.map((c) => ({
      url: `?utm_source=social&utm_medium=${c.type === 'blog_post' ? 'blog' : 'landing'}&utm_campaign=seo-${job.id}`,
      campaign: `seo-${job.id}`,
    }));

    job.progress.details = `Created ${insertedCount} social posts for content promotion.`;
  }

  // ===========================================================================
  // HELPERS
  // ===========================================================================

  private slugify(text: string): string {
    return text
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .substring(0, 100);
  }
}

export const seoEngine = new SEOEngine();
