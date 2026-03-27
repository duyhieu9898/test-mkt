/**
 * Sales Agent - Conversion optimization
 *
 * Analyzes pages for conversion rate improvement.
 * Optimizes CTAs, forms, and user flow.
 * Uses same BullMQ task queue.
 */

import { BaseAgent, type AgentContext, type AgentResult } from './base-agent';

export class SalesAgent extends BaseAgent {
  readonly name = 'sales_agent';
  readonly description = 'Optimizes conversion rates by improving CTAs, forms, and sales funnels';
  readonly capabilities = ['optimize_conversion', 'improve_cta', 'sales_funnel'];

  canHandle(taskType: string): boolean {
    return this.capabilities.includes(taskType);
  }

  async execute(input: Record<string, unknown>, context: AgentContext): Promise<AgentResult> {
    const pageId = input.pageId as string;
    const currentCTR = input.currentCTR as number || 0;

    // Read memory for previous conversion data
    let previousData: any = null;
    try {
      const memories = await context.memory.recall({ type: 'task_result', limit: 5 });
      previousData = memories.find((m) => m.metadata?.tags?.includes('conversion'));
    } catch {}

    const suggestions = [
      { area: 'CTA', suggestion: 'Make CTA button larger and use action-oriented text', impact: 'high' },
      { area: 'Social Proof', suggestion: 'Add testimonials or trust badges above the fold', impact: 'high' },
      { area: 'Form', suggestion: 'Reduce form fields to name + email only', impact: 'medium' },
      { area: 'Urgency', suggestion: 'Add limited-time offer or countdown', impact: 'medium' },
    ];

    return {
      success: true,
      data: {
        pageId,
        currentCTR,
        suggestions,
        recommendedAction: suggestions[0],
      },
      memoryEntries: [{
        type: 'task_result',
        title: `Conversion optimization: ${pageId || 'general'}`,
        content: JSON.stringify({ suggestions, previousData }),
        metadata: { tags: ['conversion', 'sales'] },
      }],
    };
  }
}
