/**
 * Feedback Loop - Continuous self-improvement system
 *
 * Periodically:
 * 1. Collects performance data from memory
 * 2. Detects underperforming content/pages
 * 3. Triggers re-optimization via Orchestrator
 * 4. Stores feedback for future improvement
 *
 * This creates the infinite growth loop.
 */

import type { Orchestrator } from './orchestrator';
import type { MemorySystem } from './memory';

interface FeedbackResult {
  companyId: string;
  evaluatedAt: Date;
  issues: FeedbackIssue[];
  actionsTriggered: string[];
}

interface FeedbackIssue {
  type: 'underperforming_content' | 'seo_regression' | 'missed_opportunity' | 'stale_content';
  severity: 'critical' | 'high' | 'medium' | 'low';
  description: string;
  suggestedAction: string;
}

export class FeedbackLoop {
  constructor(
    private orchestrator: Orchestrator,
    private memory: MemorySystem,
  ) {}

  /**
   * Evaluate a company's performance and trigger improvements
   */
  async evaluate(companyId: string): Promise<FeedbackResult> {
    const issues: FeedbackIssue[] = [];
    const actionsTriggered: string[] = [];

    // 1. Check for SEO regressions
    const seoHistory = await this.memory.recall(companyId, { type: 'customer_insight' });
    const seoEntries = seoHistory.filter((m) =>
      (m.metadata as any)?.tags?.includes('seo')
    );

    if (seoEntries.length >= 2) {
      const latest = seoEntries[0];
      const previous = seoEntries[1];
      try {
        const latestScore = JSON.parse(latest.content)?.score;
        const previousScore = JSON.parse(previous.content)?.score;
        if (latestScore && previousScore && latestScore < previousScore - 5) {
          issues.push({
            type: 'seo_regression',
            severity: 'high',
            description: `SEO score dropped from ${previousScore} to ${latestScore}`,
            suggestedAction: 'Re-run SEO audit and fix new issues',
          });
        }
      } catch {}
    }

    // 2. Check for stale content (no new content entries in memory)
    const contentHistory = await this.memory.recall(companyId, { type: 'task_result' });
    const contentEntries = contentHistory.filter((m) =>
      (m.metadata as any)?.tags?.includes('content')
    );

    if (contentEntries.length === 0) {
      issues.push({
        type: 'stale_content',
        severity: 'medium',
        description: 'No content has been created yet',
        suggestedAction: 'Generate initial content based on keyword opportunities',
      });
    }

    // 3. Check execution history for failures
    const executionHistory = await this.memory.recallKnowledge(companyId, 'execution_history');
    for (const exec of executionHistory) {
      try {
        const data = JSON.parse(exec.content);
        if (data.successCount < data.taskCount * 0.5) {
          issues.push({
            type: 'missed_opportunity',
            severity: 'high',
            description: `Previous execution "${data.goal}" had low success rate`,
            suggestedAction: 'Re-run with adjusted strategy',
          });
        }
      } catch {}
    }

    // 4. Trigger optimization if critical/high issues found
    const criticalIssues = issues.filter((i) => i.severity === 'critical' || i.severity === 'high');

    if (criticalIssues.length > 0) {
      const goal = `Optimize: ${criticalIssues.map((i) => i.description).join('; ')}`;

      try {
        const result = await this.orchestrator.executeGoal(companyId, goal, {
          feedbackIssues: criticalIssues,
          isOptimizationCycle: true,
        });

        actionsTriggered.push(`Orchestrator: ${result.summary}`);
      } catch (error) {
        console.error('Feedback loop optimization failed:', error);
        actionsTriggered.push(`Failed: ${error instanceof Error ? error.message : 'Unknown'}`);
      }
    }

    // 5. Store feedback evaluation in memory
    const systemAgentId = await this.getSystemAgent(companyId);
    await this.memory.store({
      companyId,
      agentId: systemAgentId,
      type: 'feedback',
      title: `Feedback evaluation: ${issues.length} issues found`,
      content: JSON.stringify({ issues, actionsTriggered }),
      metadata: { tags: ['feedback', 'evaluation'], issueCount: issues.length },
    });

    return {
      companyId,
      evaluatedAt: new Date(),
      issues,
      actionsTriggered,
    };
  }

  private async getSystemAgent(companyId: string): Promise<string> {
    const { db } = await import('../lib/db');
    const { agents } = await import('@1person/core/db');
    const { eq, and } = await import('drizzle-orm');

    const agent = await db.query.agents.findFirst({
      where: and(eq(agents.companyId, companyId), eq(agents.role, 'ceo')),
    });
    return agent?.id || companyId;
  }
}
