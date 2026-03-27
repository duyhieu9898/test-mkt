/**
 * Intelligence Engine — Real data-driven strategic thinking
 *
 * NOT simulated reasoning. Every decision uses REAL data from tools.
 *
 * Pipeline: Gather Data → Plan → Research → Strategy → Create Tasks → Reflect
 *
 * Key difference from before:
 * - Research uses REAL page performance, GSC data, keyword data
 * - Strategy references REAL numbers, not LLM hallucination
 * - Reflection compares decisions with REAL performance metrics
 * - All tool calls are logged for traceability
 */

import { llmGenerate, extractJSON } from '../lib/llm';
import { buildBusinessContext } from '../services/business-context';
import { IntelligenceTools, type ToolCall } from './tools';
import { memorySystem } from '../agents';
import { db } from '../lib/db';
import { eq } from 'drizzle-orm';
import { queueTaskExecution } from '../lib/queue';
import { tasks, agents } from '@1person/core/db';

export interface IntelligencePlan {
  goal: string;
  reasoning: string;
  research: { findings: string[]; opportunities: string[]; gaps: string[]; dataUsed: string[] };
  strategy: { approach: string; actions: string[]; expectedOutcome: string; risks: string[] };
  tasks: Array<{ type: string; title: string; priority: string; reason: string; input: Record<string, unknown> }>;
  reflection: string;
  toolCalls: ToolCall[];
}

export class IntelligenceEngine {
  async think(companyId: string, goal: string): Promise<IntelligencePlan> {
    console.log(`[Intelligence] Thinking about: "${goal}"`);
    const tools = new IntelligenceTools();

    // ===============================================
    // GATHER REAL DATA (before any LLM reasoning)
    // ===============================================
    console.log('[Intelligence] Gathering real data from tools...');

    const [ctx, pagePerf, gscData, keywordData, taskHistory, competitors, patterns] = await Promise.all([
      buildBusinessContext(companyId),
      tools.getPagePerformance(companyId),
      tools.getGSCData(companyId),
      tools.getKeywordData(companyId),
      tools.getTaskHistory(companyId),
      tools.getCompetitorData(companyId),
      tools.getPatterns(companyId),
    ]);

    console.log(`[Intelligence] Data: ${pagePerf.totalPages} pages, ${gscData.pages.length} GSC, ${keywordData.targetKeywords.length} keywords, ${taskHistory.completed} tasks done`);

    const dataSummary = this.buildDataSummary(pagePerf, gscData, keywordData, taskHistory, competitors, patterns);

    // Step 1: PLAN
    console.log('[Intelligence] Step 1: Planning...');
    const plan = await this.planWithData(goal, ctx, dataSummary);

    // Step 2: RESEARCH
    console.log('[Intelligence] Step 2: Researching...');
    const research = await this.researchWithData(goal, ctx, dataSummary, keywordData, competitors);

    // Step 3: STRATEGIZE
    console.log('[Intelligence] Step 3: Strategizing...');
    const strategy = await this.strategizeWithData(goal, dataSummary, research);

    // Step 4: CREATE TASKS
    console.log('[Intelligence] Step 4: Creating tasks...');
    const plannedTasks = await this.createTasksWithData(goal, strategy, pagePerf, keywordData);

    // Step 5: REFLECT
    console.log('[Intelligence] Step 5: Reflecting...');
    const reflection = await this.reflectWithData(goal, plannedTasks, pagePerf, gscData, taskHistory);

    // Store + enqueue
    await this.storeReasoning(companyId, goal, research, strategy, reflection, tools.getCallLog());
    await this.enqueueTasks(companyId, plannedTasks);

    console.log(`[Intelligence] Done: ${plannedTasks.length} tasks, ${tools.getCallLog().length} tool calls`);

    return { goal, reasoning: plan, research, strategy, tasks: plannedTasks, reflection, toolCalls: tools.getCallLog() };
  }

  private buildDataSummary(pagePerf: any, gscData: any, keywordData: any, taskHistory: any, competitors: any, patterns: any): string {
    const parts = [`REAL DATA (from database + APIs):`,
      `Pages: ${pagePerf.totalPages} total, ${pagePerf.published} published, ${pagePerf.totalVisitors} visitors`];

    if (gscData.available && gscData.pages.length > 0) {
      parts.push(`GSC (REAL): ${gscData.pages.slice(0, 3).map((p: any) => `${p.page.substring(0, 40)}: ${p.clicks}clicks pos${p.position}`).join('; ')}`);
    }
    if (gscData.available && gscData.queries.length > 0) {
      parts.push(`Top queries (REAL): ${gscData.queries.slice(0, 3).map((q: any) => `"${q.query}": ${q.clicks}clicks pos${q.position}`).join('; ')}`);
    }

    parts.push(`Keywords: ${keywordData.targetKeywords.length} targeting, gaps: ${keywordData.keywordGaps.slice(0, 5).join(', ') || 'none'}`);
    parts.push(`Tasks: ${taskHistory.completed} done, ${taskHistory.failed} failed, ${taskHistory.pending} pending`);
    if (competitors.competitors.length > 0) parts.push(`Competitors: ${competitors.competitors.map((c: any) => c.name).join(', ')}`);
    if (patterns.winning.length > 0) parts.push(`Winning: ${patterns.winning.join('; ')}`);
    if (patterns.failing.length > 0) parts.push(`Failed: ${patterns.failing.join('; ')}`);

    const pagesDetail = pagePerf.pages.slice(0, 6).map((p: any) => `"${p.name}" [${p.status}] kw="${p.keyword}" v=${p.visitors}`).join('\n  ');
    if (pagesDetail) parts.push(`Pages:\n  ${pagesDetail}`);

    return parts.join('\n');
  }

  private async planWithData(goal: string, ctx: any, data: string): Promise<string> {
    const { text } = await llmGenerate([
      { role: 'system', content: 'Use ONLY the real data provided. Reference specific numbers. No hallucination.' },
      { role: 'user', content: `Goal: ${goal}\nBusiness: ${ctx.companyName} (${ctx.industry})\n\n${data}\n\nBased on THIS DATA, create a plan referencing specific numbers. 3-5 sentences.` },
    ], { maxTokens: 400 });
    return text;
  }

  private async researchWithData(goal: string, ctx: any, data: string, keywords: any, competitors: any): Promise<IntelligencePlan['research']> {
    const { text } = await llmGenerate([
      { role: 'system', content: 'All findings MUST reference specific numbers from the data. No generic insights.' },
      { role: 'user', content: `Research: ${goal}\n\n${data}\nGaps: ${keywords.keywordGaps.slice(0, 5).join(', ')}\nCompetitors: ${JSON.stringify(competitors.competitors.slice(0, 3))}\n\nReturn JSON:\n{"findings":["Finding with number"],"opportunities":["Opportunity from data"],"gaps":["Gap in data"],"dataUsed":["data source"]}` },
    ], { maxTokens: 600 });
    const p = extractJSON(text) || {};
    return { findings: p.findings || [], opportunities: p.opportunities || [], gaps: p.gaps || [], dataUsed: p.dataUsed || [] };
  }

  private async strategizeWithData(goal: string, data: string, research: any): Promise<IntelligencePlan['strategy']> {
    const { text } = await llmGenerate([
      { role: 'system', content: 'Strategy MUST reference specific data points. No generic advice.' },
      { role: 'user', content: `Strategy: ${goal}\nResearch: ${JSON.stringify(research)}\n\n${data}\n\nReturn JSON:\n{"approach":"Strategy with numbers","actions":["Data-backed action"],"expectedOutcome":"Measurable","risks":["Data risk"]}` },
    ], { maxTokens: 500 });
    const p = extractJSON(text) || {};
    return { approach: p.approach || '', actions: p.actions || [], expectedOutcome: p.expectedOutcome || '', risks: p.risks || [] };
  }

  private async createTasksWithData(goal: string, strategy: any, pagePerf: any, keywords: any): Promise<IntelligencePlan['tasks']> {
    const drafts = pagePerf.pages.filter((p: any) => p.status === 'draft').map((p: any) => p.name);
    const noTraffic = pagePerf.pages.filter((p: any) => p.visitors === 0 && p.status === 'published').map((p: any) => p.name);
    const gaps = keywords.keywordGaps.slice(0, 5);

    const { text } = await llmGenerate([
      { role: 'system', content: 'Each task MUST reference a specific page, keyword, or data point.' },
      { role: 'user', content: `Strategy: ${strategy.approach}\nActions: ${strategy.actions.join('; ')}\nDraft pages: ${drafts.join(', ') || 'none'}\nZero-traffic: ${noTraffic.join(', ') || 'none'}\nKeyword gaps: ${gaps.join(', ') || 'none'}\n\nTypes: create_landing_page, generate_page_content, optimize_page_seo, optimize_content, create_social_post, create_campaign, find_keywords, analyze_business\n\nReturn JSON array:\n[{"type":"...","title":"Specific action for specific page/keyword","priority":"critical|high|medium|low","reason":"Why — cite data","input":{"key":"value"}}]\n\n3-6 tasks.` },
    ], { maxTokens: 700 });

    const p = extractJSON(text);
    return (Array.isArray(p) ? p : []).map((t: any) => ({
      type: t.type || 'analyze_business', title: t.title || 'Task',
      priority: t.priority || 'medium', reason: t.reason || '', input: t.input || {},
    }));
  }

  private async reflectWithData(goal: string, tasks: any[], pagePerf: any, gscData: any, taskHistory: any): Promise<string> {
    const failRate = taskHistory.completed + taskHistory.failed > 0
      ? Math.round(taskHistory.failed / (taskHistory.completed + taskHistory.failed) * 100) : 0;

    const { text } = await llmGenerate([
      { role: 'system', content: 'Compare plan with REAL performance data. Be specific about what data supports or contradicts.' },
      { role: 'user', content: `Plan: ${goal}\nTasks: ${tasks.map((t) => t.title).join(', ')}\n\nReal metrics:\n- ${pagePerf.totalPages} pages, ${pagePerf.published} published, ${pagePerf.totalVisitors} visitors\n- ${gscData.available ? `GSC: ${gscData.pages.length} tracked` : 'GSC not connected'}\n- Task failure rate: ${failRate}%\n- ${taskHistory.pending} tasks still pending\n\n1. What data supports this plan?\n2. What contradicts it?\n3. What metrics to track?\n4. Confidence level (0-100)?` },
    ], { maxTokens: 400 });
    return text;
  }

  private async storeReasoning(companyId: string, goal: string, research: any, strategy: any, reflection: string, toolCalls: ToolCall[]): Promise<void> {
    try {
      const ceo = await db.query.agents.findFirst({ where: eq(agents.companyId, companyId) });
      if (!ceo) return;
      await memorySystem.store({
        companyId, agentId: ceo.id, type: 'strategy',
        title: `Intelligence: ${goal}`,
        content: JSON.stringify({
          research, strategy, reflection,
          toolCallCount: toolCalls.length,
          dataSources: Array.from(new Set(toolCalls.map((t) => t.dataSource))),
          tools: toolCalls.map((t) => ({ tool: t.tool, source: t.dataSource })),
        }),
        metadata: { tags: ['intelligence', 'data-driven'] },
      });
    } catch {}
  }

  private async enqueueTasks(companyId: string, plannedTasks: any[]): Promise<void> {
    const ceo = await db.query.agents.findFirst({ where: eq(agents.companyId, companyId) });
    for (const task of plannedTasks) {
      try {
        const [t] = await db.insert(tasks).values({
          companyId, title: task.title,
          description: `${task.reason}\n\n[Intelligence Engine — data-driven]`,
          type: task.type, priority: task.priority, status: 'pending',
          assignedAgentId: ceo?.id, input: task.input as any,
        }).returning();
        await queueTaskExecution({
          taskId: t.id, agentId: ceo?.id || '', companyId,
          taskType: task.type, title: task.title, description: task.reason,
          input: task.input, priority: task.priority,
        });
      } catch {}
    }
  }
}

export const intelligenceEngine = new IntelligenceEngine();
