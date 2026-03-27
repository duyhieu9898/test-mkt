/**
 * Bootstrap Service - Creates initial system state after FTUX
 *
 * RULES:
 * - NEVER marks tasks as completed (only workers can)
 * - All tasks start as 'pending'
 * - Does NOT generate content (workers do that)
 * - Only creates: page records (minimal) + tasks + activates agents
 * - Enqueues tasks to BullMQ for real async execution
 */

import { db } from '../lib/db';
import { eq } from 'drizzle-orm';
import { landingPages, tasks, agents } from '@1person/core/db';
import { queueTaskExecution, type TaskExecutionJob } from '../lib/queue';
import { llmGenerate, extractJSON } from '../lib/llm';

interface BootstrapInput {
  companyId: string;
  companyName: string;
  businessType?: string;
  targetAudience?: string;
  offerings?: string[];
  industry?: string;
  websiteUrl?: string;
  prompt: string;
}

interface BootstrapResult {
  pagesCreated: number;
  tasksCreated: number;
  tasksQueued: number;
}

export class BootstrapService {
  async bootstrapCompany(input: BootstrapInput): Promise<BootstrapResult> {
    console.log(`[Bootstrap] Starting for company ${input.companyId}`);

    const ceoAgentId = await this.getCeoAgent(input.companyId);

    // 1. Generate page ideas (AI with fallback)
    const pageIdeas = await this.generatePageIdeas(input);

    // 2. Create minimal landing page records (NO content yet — workers generate it)
    const pageIds: string[] = [];
    for (const idea of pageIdeas) {
      try {
        const slug = idea.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '').substring(0, 60);
        const [page] = await db.insert(landingPages).values({
          companyId: input.companyId,
          name: idea.title,
          slug,
          description: idea.description,
          primaryColor: '#3b82f6',
          status: 'draft', // Will become 'generating' when worker picks it up
          businessContext: {
            keyword: idea.keyword,
            searchIntent: idea.intent,
            pageType: idea.pageType,
            valueProposition: idea.description,
          } as any,
        }).returning();
        pageIds.push(page.id);
      } catch (err) {
        console.warn(`[Bootstrap] Failed to create page "${idea.title}":`, err);
      }
    }

    // 3. Create tasks — ALL start as 'pending', NO fake completions
    let tasksCreated = 0;
    let tasksQueued = 0;

    // Market analysis task
    const analysisTaskId = await this.createTask(input.companyId, ceoAgentId, {
      title: 'Market Analysis & Competitor Research',
      description: `Analyze market for ${input.businessType || input.companyName}`,
      type: 'analyze_business',
      priority: 'high',
    });
    if (analysisTaskId) tasksCreated++;

    // Keyword research task
    const keywordTaskId = await this.createTask(input.companyId, ceoAgentId, {
      title: 'Keyword Research & SEO Strategy',
      description: `Discover keyword opportunities for ${input.industry || 'the business'}`,
      type: 'find_keywords',
      priority: 'high',
    });
    if (keywordTaskId) tasksCreated++;

    // Tasks for each landing page
    for (const pageId of pageIds) {
      const page = await db.query.landingPages.findFirst({ where: eq(landingPages.id, pageId) });
      if (!page) continue;

      // Generate content task
      const contentTaskId = await this.createTask(input.companyId, ceoAgentId, {
        title: `Generate content: "${page.name}"`,
        description: `AI generates SEO-optimized content for this page`,
        type: 'generate_page_content',
        priority: 'high',
        input: { pageId, pageName: page.name, keyword: (page.businessContext as any)?.keyword },
      });
      if (contentTaskId) tasksCreated++;

      // SEO optimization task
      const seoTaskId = await this.createTask(input.companyId, ceoAgentId, {
        title: `Optimize SEO: "${page.name}"`,
        description: `Review meta tags, headings, keyword placement`,
        type: 'optimize_page_seo',
        priority: 'medium',
        input: { pageId },
        dependencies: contentTaskId ? [contentTaskId] : [],
      });
      if (seoTaskId) tasksCreated++;

      // No auto-publish — user decides when to publish each page
    }

    // Content calendar task
    await this.createTask(input.companyId, ceoAgentId, {
      title: 'Create Content Calendar',
      description: 'Generate weekly content plan based on keyword research',
      type: 'generate_plan',
      priority: 'medium',
      dependencies: keywordTaskId ? [keywordTaskId] : [],
    });
    tasksCreated++;

    // 4. Enqueue high-priority tasks to BullMQ for immediate execution
    try {
      const pendingTasks = await db.query.tasks.findMany({
        where: eq(tasks.companyId, input.companyId),
      });

      // Only queue tasks with no dependencies (they can run now)
      const readyTasks = pendingTasks.filter((t) => {
        const deps = (t as any).dependencies;
        return t.status === 'pending' && (!deps || (Array.isArray(deps) && deps.length === 0));
      });

      for (const task of readyTasks.slice(0, 5)) {
        try {
          await queueTaskExecution({
            taskId: task.id,
            agentId: task.assignedAgentId || ceoAgentId || '',
            companyId: input.companyId,
            taskType: task.type,
            title: task.title,
            description: task.description || '',
            input: (task as any).input,
            priority: task.priority as any,
          });
          tasksQueued++;
        } catch {
          // Queue may not be available (Redis down) — tasks stay pending for polling
        }
      }
    } catch {
      // Non-critical — tasks stay pending
    }

    // 5. Activate agents
    try {
      // Agents stay 'ready' — they activate when tasks are assigned to them
      // Don't fake 'running' status
    } catch {}

    console.log(`[Bootstrap] Done: ${pageIds.length} pages, ${tasksCreated} tasks, ${tasksQueued} queued`);
    return { pagesCreated: pageIds.length, tasksCreated, tasksQueued };
  }

  private async createTask(
    companyId: string,
    agentId: string | undefined,
    data: { title: string; description: string; type: string; priority: string; input?: any; dependencies?: string[] }
  ): Promise<string | null> {
    try {
      const [task] = await db.insert(tasks).values({
        companyId,
        title: data.title,
        description: data.description,
        type: data.type,
        priority: data.priority as any,
        status: 'pending', // ALWAYS pending — only workers change this
        assignedAgentId: agentId,
        input: data.input as any,
        dependencies: data.dependencies as any,
      }).returning();
      return task.id;
    } catch (err) {
      console.warn(`[Bootstrap] Failed to create task "${data.title}":`, err);
      return null;
    }
  }

  private async generatePageIdeas(input: BootstrapInput) {
    try {
      const { text } = await llmGenerate([{
          role: 'user',
          content: `Generate 5 landing page ideas for:
Business: ${input.businessType || input.companyName}
Industry: ${input.industry || 'Unknown'}
Offerings: ${(input.offerings || []).join(', ') || input.prompt}

Return ONLY JSON array:
[{"title":"Page Title","description":"Purpose","keyword":"target keyword","intent":"informational|commercial|transactional","pageType":"money_page|service_page|blog"}]

Be specific to this business. 5 pages, different keywords.`,
        }], { maxTokens: 1500 });
      const parsed = extractJSON(text);
      if (parsed && Array.isArray(parsed)) return parsed.slice(0, 6);
    } catch {}

    // Fallback
    const biz = input.businessType || input.companyName;
    return [
      { title: `${biz} - Home`, description: `Main page`, keyword: biz.toLowerCase(), intent: 'transactional', pageType: 'money_page' },
      { title: `About ${biz}`, description: `About page`, keyword: `about ${biz.toLowerCase()}`, intent: 'informational', pageType: 'service_page' },
      { title: `${biz} Services`, description: `Services`, keyword: `${biz.toLowerCase()} services`, intent: 'commercial', pageType: 'service_page' },
      { title: `Why ${biz}`, description: `Benefits`, keyword: `why ${biz.toLowerCase()}`, intent: 'commercial', pageType: 'comparison' },
      { title: `Contact ${biz}`, description: `Contact`, keyword: `contact ${biz.toLowerCase()}`, intent: 'transactional', pageType: 'money_page' },
    ];
  }

  private async getCeoAgent(companyId: string): Promise<string | undefined> {
    const ceo = await db.query.agents.findFirst({ where: eq(agents.companyId, companyId) });
    return ceo?.id;
  }
}

export const bootstrapService = new BootstrapService();
