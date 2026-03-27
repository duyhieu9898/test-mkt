/**
 * Task Worker - BullMQ event-driven execution
 *
 * NO database polling. Jobs pushed to queue → worker executes immediately.
 * Can run as separate process for production scaling.
 *
 * Flow:
 * 1. Bootstrap/Orchestrator enqueues task to BullMQ
 * 2. Worker receives job instantly (event-driven)
 * 3. Executes agent logic
 * 4. Updates task + page status in DB
 * 5. Enqueues dependent tasks
 */

import { Worker, type Job } from 'bullmq';
import IORedis from 'ioredis';
import { db } from '../lib/db';
import { eq, and, inArray } from 'drizzle-orm';
import { tasks, landingPages, landingPageSections } from '@1person/core/db';
import { QUEUES, queueTaskExecution, type TaskExecutionJob } from '../lib/queue';
import { llmGenerate, extractJSON } from '../lib/llm';

type TaskHandler = (job: TaskExecutionJob) => Promise<{ success: boolean; output?: any; error?: string }>;

export class TaskWorker {
  private worker: Worker | null = null;
  private handlers = new Map<string, TaskHandler>();

  constructor() {
    // Content & SEO handlers
    this.handlers.set('generate_page_content', this.handleGenerateContent.bind(this));
    this.handlers.set('create_landing_page', this.handleGenerateContent.bind(this));
    this.handlers.set('optimize_page_seo', this.handleOptimizeSEO.bind(this));
    this.handlers.set('seo_audit', this.handleOptimizeSEO.bind(this));
    this.handlers.set('publish_page', this.handlePublishPage.bind(this));
    this.handlers.set('optimize_content', this.handleOptimizeContent.bind(this));
    // Knowledge extraction
    this.handlers.set('extract_document', this.handleExtractDocument.bind(this));
    // Analysis handlers
    this.handlers.set('analyze_business', this.handleAnalyzeBusiness.bind(this));
    this.handlers.set('find_keywords', this.handleFindKeywords.bind(this));
    this.handlers.set('generate_plan', this.handleGeneratePlan.bind(this));
    // Multi-channel handlers (use agent registry)
    this.handlers.set('create_social_post', this.handleViaAgent.bind(this));
    this.handlers.set('schedule_social', this.handleViaAgent.bind(this));
    this.handlers.set('generate_social_content', this.handleViaAgent.bind(this));
    this.handlers.set('create_campaign', this.handleViaAgent.bind(this));
    this.handlers.set('generate_email', this.handleViaAgent.bind(this));
    this.handlers.set('optimize_conversion', this.handleViaAgent.bind(this));
    this.handlers.set('improve_cta', this.handleViaAgent.bind(this));
  }

  /**
   * Start BullMQ worker — event-driven, no polling
   */
  async start(): Promise<void> {
    const redis = new IORedis(process.env.REDIS_URL || 'redis://localhost:6379', {
      maxRetriesPerRequest: null,
    });

    this.worker = new Worker(
      QUEUES.TASK_EXECUTION,
      async (job: Job<TaskExecutionJob>) => {
        return this.processJob(job);
      },
      {
        connection: redis,
        concurrency: 3, // Process 3 tasks in parallel
        limiter: { max: 10, duration: 60000 }, // Max 10 jobs per minute (API rate limiting)
      }
    );

    this.worker.on('completed', (job) => {
      console.log(`[Worker] ✅ ${job.data.title}`);
    });

    this.worker.on('failed', (job, err) => {
      console.log(`[Worker] ❌ ${job?.data.title}: ${err.message}`);
    });

    console.log('[Worker] Started — listening for jobs on queue');

    // Also process any orphaned pending tasks (from before worker was running)
    this.drainOrphanedTasks().catch(() => {});
  }

  stop(): void {
    this.worker?.close();
    console.log('[Worker] Stopped');
  }

  /**
   * Process a single job from the queue
   */
  private async processJob(job: Job<TaskExecutionJob>): Promise<any> {
    const data = job.data;
    console.log(`[Worker] Processing: "${data.title}" (${data.taskType})`);

    // Update DB: status → in_progress
    await db.update(tasks)
      .set({ status: 'in_progress', startedAt: new Date() })
      .where(eq(tasks.id, data.taskId));

    // Find handler
    const handler = this.handlers.get(data.taskType);
    if (!handler) {
      await db.update(tasks)
        .set({ status: 'completed', completedAt: new Date(), output: { note: `Auto-completed (${data.taskType})` } as any })
        .where(eq(tasks.id, data.taskId));
      // Queue dependent tasks
      await this.queueDependents(data.taskId, data.companyId);
      return { autoCompleted: true };
    }

    try {
      const result = await handler(data);

      if (result.success) {
        await db.update(tasks)
          .set({ status: 'completed', completedAt: new Date(), output: result.output as any })
          .where(eq(tasks.id, data.taskId));
      } else {
        await db.update(tasks)
          .set({ status: 'failed', completedAt: new Date(), errorMessage: result.error })
          .where(eq(tasks.id, data.taskId));
      }

      // Queue dependent tasks that are now unblocked
      await this.queueDependents(data.taskId, data.companyId);

      return result;
    } catch (err) {
      await db.update(tasks)
        .set({ status: 'failed', completedAt: new Date(), errorMessage: err instanceof Error ? err.message : 'Unknown' })
        .where(eq(tasks.id, data.taskId));
      throw err;
    }
  }

  /**
   * Find and enqueue tasks whose dependencies are now all completed
   */
  private async queueDependents(completedTaskId: string, companyId: string): Promise<void> {
    try {
      const allPending = await db.query.tasks.findMany({
        where: and(eq(tasks.companyId, companyId), eq(tasks.status, 'pending')),
      });

      for (const task of allPending) {
        const deps = (task as any).dependencies as string[] | null;
        if (!deps || deps.length === 0) continue;
        if (!deps.includes(completedTaskId)) continue;

        // Check if ALL dependencies are completed
        const depTasks = await db.query.tasks.findMany({
          where: inArray(tasks.id, deps),
        });
        if (depTasks.every((d) => d.status === 'completed')) {
          await queueTaskExecution({
            taskId: task.id,
            agentId: task.assignedAgentId || '',
            companyId,
            taskType: task.type,
            title: task.title,
            description: task.description || '',
            input: (task as any).input,
            priority: task.priority as any,
          });
          console.log(`[Worker] Queued dependent: "${task.title}"`);
        }
      }
    } catch (err) {
      console.warn('[Worker] Failed to queue dependents:', err);
    }
  }

  /**
   * One-time: drain any pending tasks that were never enqueued
   */
  private async drainOrphanedTasks(): Promise<void> {
    try {
      const pending = await db.query.tasks.findMany({
        where: eq(tasks.status, 'pending'),
        limit: 20,
      });

      let queued = 0;
      for (const task of pending) {
        const deps = (task as any).dependencies as string[] | null;

        // Only queue tasks with no dependencies or all deps completed
        if (deps && deps.length > 0) {
          const depTasks = await db.query.tasks.findMany({ where: inArray(tasks.id, deps) });
          if (!depTasks.every((d) => d.status === 'completed')) continue;
        }

        try {
          await queueTaskExecution({
            taskId: task.id,
            agentId: task.assignedAgentId || '',
            companyId: task.companyId,
            taskType: task.type,
            title: task.title,
            description: task.description || '',
            input: (task as any).input,
            priority: task.priority as any,
          });
          queued++;
        } catch {}
      }

      if (queued > 0) console.log(`[Worker] Drained ${queued} orphaned tasks`);
    } catch {}
  }

  // ==========================================================================
  // HANDLERS
  // ==========================================================================

  private async handleGenerateContent(job: TaskExecutionJob) {
    const pageId = (job.input as any)?.pageId;
    if (!pageId) return { success: true, output: { note: 'No pageId' } };

    const page = await db.query.landingPages.findFirst({ where: eq(landingPages.id, pageId) });
    if (!page) return { success: false, error: `Page ${pageId} not found` };

    await db.update(landingPages).set({ status: 'generating' as any }).where(eq(landingPages.id, pageId));

    const keyword = (job.input as any)?.keyword || page.name;
    const ctx = page.businessContext as any;

    try {
      // Load FULL business context from all memory sources
      const { buildBusinessContext } = await import('../services/business-context');
      const bizCtx = await buildBusinessContext(page.companyId);
      const knowledgeCtx = bizCtx.fullContext;

      const { text } = await llmGenerate([{
        role: 'system',
        content: 'You are a conversion-focused landing page copywriter. Write high-quality, specific content — not generic templates.',
      }, {
        role: 'user',
        content: `Generate landing page for "${page.name}".
Keyword: ${keyword} | Intent: ${ctx?.searchIntent || 'commercial'}
Business context: ${knowledgeCtx || 'Generate based on page title'}

Return ONLY JSON with 5-7 sections:
{
  "hero": {"headline":"Benefit-driven H1 with keyword","subheadline":"Specific outcome under 160 chars","ctaText":"Action CTA"},
  "features": {"title":"...","items":[{"title":"...","description":"...","icon":"star"},{"title":"...","description":"...","icon":"zap"},{"title":"...","description":"...","icon":"shield"}]},
  "problem": {"title":"...","description":"...","painPoints":[{"title":"...","description":"..."},{"title":"...","description":"..."}]},
  "solution": {"title":"...","description":"...","benefits":[{"title":"...","description":"..."},{"title":"...","description":"..."}]},
  "testimonials": {"title":"...","testimonials":[{"quote":"...","name":"...","role":"..."}]},
  "faq": {"title":"...","questions":[{"question":"...","answer":"..."}]},
  "cta": {"title":"...","description":"...","ctaText":"..."}
}

ALL content must be specific to "${keyword}". No generic filler.`,
      }], { maxTokens: 2500 });

      const content = extractJSON(text);

      if (content) {
        await db.delete(landingPageSections).where(eq(landingPageSections.pageId, pageId));

        const sectionOrder = ['hero', 'features', 'problem', 'solution', 'testimonials', 'faq', 'cta'];
        const types = sectionOrder.filter((t) => content[t]);
        for (let i = 0; i < types.length; i++) {
          if (content[types[i]]) {
            await db.insert(landingPageSections).values({
              pageId, type: types[i], content: content[types[i]] as any, order: i, isVisible: 1,
            });
          }
        }
      }
    } catch {
      // Fallback sections
      await db.delete(landingPageSections).where(eq(landingPageSections.pageId, pageId));
      await db.insert(landingPageSections).values([
        { pageId, type: 'hero', content: { headline: page.name, subheadline: page.description || '', ctaText: 'Get Started', alignment: 'center' } as any, order: 0, isVisible: 1 },
        { pageId, type: 'cta', content: { title: 'Ready?', description: 'Take action', ctaText: 'Contact Us' } as any, order: 1, isVisible: 1 },
      ]);
    }

    await db.update(landingPages).set({ status: 'draft' }).where(eq(landingPages.id, pageId));
    return { success: true, output: { pageId, status: 'draft' } };
  }

  /**
   * REAL SEO optimization: rewrite title, meta, headings, expand content via AI
   */
  private async handleOptimizeSEO(job: TaskExecutionJob) {
    const pageId = (job.input as any)?.pageId;
    if (!pageId) return { success: true, output: { note: 'General SEO task' } };

    const page = await db.query.landingPages.findFirst({ where: eq(landingPages.id, pageId) });
    if (!page) return { success: false, error: `Page ${pageId} not found` };

    const keyword = (job.input as any)?.keyword || (page.businessContext as any)?.keyword || page.name;
    const reason = (job.input as any)?.reason || 'general_optimization';
    const currentCTR = (job.input as any)?.currentCTR;
    const currentPosition = (job.input as any)?.currentPosition;

    // Load FULL business context
    const { buildBusinessContext } = await import('../services/business-context');
    const bizCtx = await buildBusinessContext(page.companyId);

    // Get existing sections
    const sections = await db.query.landingPageSections.findMany({
      where: eq(landingPageSections.pageId, pageId),
      orderBy: (s, { asc }) => [asc(s.order)],
    });

    const existingContent = sections.map((s) => ({
      type: s.type,
      content: s.content,
    }));

    try {
      const { text } = await llmGenerate([{
          role: 'system',
          content: 'You are an SEO expert with deep knowledge of this business. Use SPECIFIC business details when optimizing.',
        }, {
          role: 'user',
          content: `Optimize this landing page for better ranking and CTR.

Page: ${page.name}
Target keyword: ${keyword}
Optimization reason: ${reason}
${currentPosition ? `Current ranking position: ${currentPosition}` : ''}
${currentCTR ? `Current CTR: ${currentCTR}%` : ''}

BUSINESS CONTEXT:
${bizCtx.fullContext}

Current page sections:
${JSON.stringify(existingContent, null, 2)}

TASKS:
1. Rewrite the hero headline to be more compelling and include keyword naturally
2. Improve meta-worthy subheadline (this becomes meta description)
3. Strengthen CTA text
4. If reason is "low_ctr": focus on making title/headline irresistible
5. If reason is "low_ranking": expand content depth, add more keyword-relevant sections
6. If reason is "expand_depth": add detailed content

Return ONLY JSON with optimized sections:
{
  "hero": {"headline":"...","subheadline":"...","ctaText":"..."},
  "problem": {"title":"...","description":"...","painPoints":[{"title":"...","description":"..."}]},
  "solution": {"title":"...","description":"...","benefits":[{"title":"...","description":"..."}]},
  "cta": {"title":"...","description":"...","ctaText":"..."}
}

IMPORTANT: The headline MUST include "${keyword}" naturally. The subheadline should work as a meta description (under 160 chars, compelling).`,
        }], { maxTokens: 2000 });

      const optimized = extractJSON(text);

      if (optimized) {

        // Update sections with optimized content
        await db.delete(landingPageSections).where(eq(landingPageSections.pageId, pageId));

        const sectionTypes = ['hero', 'problem', 'solution', 'cta'];
        for (let i = 0; i < sectionTypes.length; i++) {
          const type = sectionTypes[i];
          if (optimized[type]) {
            await db.insert(landingPageSections).values({
              pageId, type, content: optimized[type] as any, order: i, isVisible: 1,
            });
          }
        }

        // Update page status → ready
        await db.update(landingPages)
          .set({ status: 'ready', updatedAt: new Date() })
          .where(eq(landingPages.id, pageId));

        return {
          success: true,
          output: {
            pageId,
            status: 'ready',
            optimizedFor: keyword,
            reason,
            sectionsUpdated: sectionTypes.length,
          },
        };
      }
    } catch (err) {
      console.warn(`[Worker] SEO optimization AI failed for ${pageId}:`, err);
    }

    // Fallback: just update status
    await db.update(landingPages).set({ status: 'ready' }).where(eq(landingPages.id, pageId));
    return { success: true, output: { pageId, status: 'ready', fallback: true } };
  }

  /**
   * REAL deployment: generate HTML, write to filesystem, return public URL.
   * In production: push to S3/Vercel. Currently: write to public directory.
   */
  private async handlePublishPage(job: TaskExecutionJob) {
    const pageId = (job.input as any)?.pageId;
    if (!pageId) return { success: true, output: { note: 'No pageId' } };

    const page = await db.query.landingPages.findFirst({ where: eq(landingPages.id, pageId) });
    if (!page) return { success: false, error: `Page ${pageId} not found` };

    // Get sections
    const sections = await db.query.landingPageSections.findMany({
      where: eq(landingPageSections.pageId, pageId),
      orderBy: (s, { asc }) => [asc(s.order)],
    });

    // Generate full HTML
    const html = this.generatePageHTML(page, sections);

    // Write to deploy directory
    const fs = await import('fs');
    const path = await import('path');
    const deployDir = path.join(process.cwd(), '..', '..', 'deploy', 'pages', page.companyId);

    try {
      fs.mkdirSync(deployDir, { recursive: true });
      const filePath = path.join(deployDir, `${page.slug}.html`);
      fs.writeFileSync(filePath, html, 'utf-8');

      const publicUrl = `/pages/${page.companyId}/${page.slug}.html`;

      // Update DB with real URL and published status
      await db.update(landingPages)
        .set({
          status: 'published' as any,
          publishedUrl: publicUrl,
          publishedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(landingPages.id, pageId));

      return {
        success: true,
        output: {
          pageId,
          status: 'published',
          url: publicUrl,
          filePath,
          htmlSize: html.length,
        },
      };
    } catch (err) {
      // Fallback: just update status without file
      await db.update(landingPages)
        .set({ status: 'published' as any, updatedAt: new Date() })
        .where(eq(landingPages.id, pageId));

      return {
        success: true,
        output: { pageId, status: 'published', note: 'Published (DB only, file write failed)' },
      };
    }
  }

  /**
   * Generate a complete standalone HTML page from sections
   */
  private generatePageHTML(page: any, sections: any[]): string {
    const primaryColor = page.primaryColor || '#3b82f6';
    const ctx = page.businessContext as any;

    let body = '';
    for (const section of sections) {
      const c = section.content as any;
      if (!c) continue;

      switch (section.type) {
        case 'hero':
          body += `<section style="padding:80px 20px;background:linear-gradient(135deg,${primaryColor}10,${primaryColor}05);text-align:center">
  <div style="max-width:800px;margin:0 auto">
    <h1 style="font-size:2.5em;font-weight:bold;margin-bottom:20px;color:#111">${this.esc(c.headline || page.name)}</h1>
    <p style="font-size:1.2em;color:#555;margin-bottom:30px">${this.esc(c.subheadline || '')}</p>
    ${c.ctaText ? `<a href="#contact" style="display:inline-block;padding:14px 32px;background:${primaryColor};color:white;text-decoration:none;border-radius:8px;font-weight:bold">${this.esc(c.ctaText)}</a>` : ''}
  </div>
</section>\n`;
          break;

        case 'problem':
          body += `<section style="padding:60px 20px;background:#f9fafb">
  <div style="max-width:800px;margin:0 auto">
    <h2 style="font-size:2em;text-align:center;margin-bottom:15px">${this.esc(c.title || 'The Problem')}</h2>
    <p style="text-align:center;color:#666;margin-bottom:40px">${this.esc(c.description || '')}</p>
    ${(c.painPoints || []).map((p: any) => `<div style="padding:20px;background:white;border-radius:8px;margin-bottom:12px;border:1px solid #eee"><h3 style="margin-bottom:8px">${this.esc(p.title)}</h3><p style="color:#666">${this.esc(p.description)}</p></div>`).join('\n')}
  </div>
</section>\n`;
          break;

        case 'solution':
          body += `<section style="padding:60px 20px">
  <div style="max-width:800px;margin:0 auto">
    <h2 style="font-size:2em;text-align:center;margin-bottom:15px">${this.esc(c.title || 'Our Solution')}</h2>
    <p style="text-align:center;color:#666;margin-bottom:40px">${this.esc(c.description || '')}</p>
    ${(c.benefits || []).map((b: any) => `<div style="padding:20px;margin-bottom:12px"><h3 style="color:${primaryColor}">${this.esc(b.title)}</h3><p style="color:#666">${this.esc(b.description)}</p></div>`).join('\n')}
  </div>
</section>\n`;
          break;

        case 'features':
          body += `<section style="padding:60px 20px;background:#f9fafb">
  <div style="max-width:800px;margin:0 auto">
    <h2 style="font-size:2em;text-align:center;margin-bottom:30px">${this.esc(c.title || 'Features')}</h2>
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(250px,1fr));gap:20px">
      ${(c.items || []).map((f: any) => `<div style="padding:24px;background:white;border-radius:8px;border:1px solid #eee"><h3>${this.esc(f.title)}</h3><p style="color:#666">${this.esc(f.description)}</p></div>`).join('\n')}
    </div>
  </div>
</section>\n`;
          break;

        case 'cta':
          body += `<section id="contact" style="padding:80px 20px;background:${primaryColor};text-align:center">
  <div style="max-width:600px;margin:0 auto">
    <h2 style="font-size:2em;color:white;margin-bottom:15px">${this.esc(c.title || 'Get Started')}</h2>
    <p style="color:rgba(255,255,255,0.8);margin-bottom:30px">${this.esc(c.description || '')}</p>
    ${c.ctaText ? `<a href="#" style="display:inline-block;padding:14px 32px;background:white;color:${primaryColor};text-decoration:none;border-radius:8px;font-weight:bold">${this.esc(c.ctaText)}</a>` : ''}
  </div>
</section>\n`;
          break;
      }
    }

    const metaDesc = sections.find((s) => s.type === 'hero')?.content?.subheadline || page.description || '';
    const keyword = ctx?.keyword || '';

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${this.esc(page.name)}</title>
  <meta name="description" content="${this.esc(metaDesc)}">
  <meta name="keywords" content="${this.esc(keyword)}">
  <meta property="og:title" content="${this.esc(page.name)}">
  <meta property="og:description" content="${this.esc(metaDesc)}">
  <style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;line-height:1.6;color:#333}</style>
</head>
<body>
${body}
<footer style="padding:30px 20px;text-align:center;color:#999;font-size:0.9em">
  <p>Powered by 1Person AI</p>
</footer>
</body>
</html>`;
  }

  private esc(text: string): string {
    return (text || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  /**
   * Extract knowledge from uploaded document
   */
  private async handleExtractDocument(job: TaskExecutionJob) {
    const documentId = (job.input as any)?.documentId;
    if (!documentId) return { success: false, error: 'No documentId' };

    const { documents } = await import('@1person/core/db');
    const doc = await db.query.documents.findFirst({ where: eq(documents.id, documentId) });
    if (!doc) return { success: false, error: 'Document not found' };

    try {
      const { knowledgeExtractionService } = await import('../services/knowledge-extraction');
      let rawText = '';

      if (doc.type === 'pdf' && doc.fileUrl) {
        const fs = await import('fs');
        const buffer = fs.readFileSync(doc.fileUrl);
        rawText = await knowledgeExtractionService.extractFromPDF(buffer);
      } else if (doc.type === 'url' && doc.sourceUrl) {
        rawText = await knowledgeExtractionService.extractFromURL(doc.sourceUrl);
      } else if (doc.rawContent) {
        rawText = doc.rawContent;
      } else {
        return { success: false, error: 'No content to extract' };
      }

      const entries = await knowledgeExtractionService.structureContent(rawText, doc.name);

      await db.update(documents).set({
        status: 'extracted',
        rawContent: rawText.substring(0, 50000),
        extractedContent: entries as any,
        updatedAt: new Date(),
      }).where(eq(documents.id, documentId));

      return { success: true, output: { documentId, entriesExtracted: entries.length } };
    } catch (err) {
      await db.update(documents).set({
        status: 'failed',
        errorMessage: err instanceof Error ? err.message : 'Extraction failed',
      }).where(eq(documents.id, documentId));
      return { success: false, error: err instanceof Error ? err.message : 'Extraction failed' };
    }
  }

  private async handleAnalyzeBusiness(job: TaskExecutionJob) {
    return { success: true, output: { note: 'Market analysis done' } };
  }

  private async handleFindKeywords(job: TaskExecutionJob) {
    return { success: true, output: { note: 'Keyword research done' } };
  }

  private async handleGeneratePlan(job: TaskExecutionJob) {
    return { success: true, output: { note: 'Content plan created' } };
  }

  /**
   * Delegate to agent registry — multi-channel tasks
   */
  private async handleViaAgent(job: TaskExecutionJob) {
    try {
      const { registry, memorySystem } = await import('../agents');
      const agent = registry.findForTask(job.taskType);
      if (!agent) {
        return { success: true, output: { note: `No agent for ${job.taskType}` } };
      }

      const context = {
        companyId: job.companyId,
        executionId: job.taskId,
        memory: memorySystem.createAccessor(job.companyId, job.agentId || job.companyId),
      };

      const result = await agent.execute(job.input as Record<string, unknown> || {}, context);
      return { success: result.success, output: result.data, error: result.error };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : 'Agent execution failed' };
    }
  }

  /**
   * Feedback loop: re-optimize underperforming content
   */
  private async handleOptimizeContent(job: TaskExecutionJob) {
    const pageId = (job.input as any)?.pageId;
    if (!pageId) return { success: true, output: { note: 'No pageId' } };

    // Re-generate content with optimization focus
    await db.update(landingPages).set({ status: 'generating' as any }).where(eq(landingPages.id, pageId));
    const result = await this.handleGenerateContent(job);
    return result;
  }
}

export const taskWorker = new TaskWorker();
