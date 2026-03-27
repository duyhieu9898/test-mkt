/**
 * Social Agent - Generates and schedules social media posts
 *
 * Creates tasks for:
 * - Generate post from blog content
 * - Schedule posts across platforms
 * - Track engagement
 *
 * Uses same BullMQ task queue as all other agents.
 */

import { BaseAgent, type AgentContext, type AgentResult } from './base-agent';
import { llmGenerate, extractJSON } from '../lib/llm';

export class SocialAgent extends BaseAgent {
  readonly name = 'social_agent';
  readonly description = 'Generates social media posts from content and schedules across platforms (Facebook, Instagram, LinkedIn, Twitter)';
  readonly capabilities = ['create_social_post', 'schedule_social', 'generate_social_content'];

  canHandle(taskType: string): boolean {
    return this.capabilities.includes(taskType);
  }

  async execute(input: Record<string, unknown>, context: AgentContext): Promise<AgentResult> {
    const content = input.content as string || input.pageName as string || '';
    const keyword = input.keyword as string || '';
    const platforms = (input.platforms as string[]) || ['facebook', 'linkedin', 'instagram'];
    const businessType = input.businessType as string || '';
    const audience = input.audience as string || '';
    const brandVoice = input.brandVoice as string || '';

    // Load business context from memory
    let businessContext = '';
    try {
      const memories = await context.memory.recallKnowledge('company_profile');
      if (memories.length > 0) businessContext = memories[0].content.substring(0, 400);
    } catch {}

    try {
      const { text } = await llmGenerate([{
          role: 'system',
          content: `You are a social media strategist who writes viral, platform-native posts. You NEVER write generic corporate content. Each post must feel like it was written by a real person who deeply understands the business and its audience. Use proven viral frameworks: transformation stories, contrarian takes, problem→solution threads, genuine recommendations.`,
        }, {
          role: 'user',
          content: `Generate social media posts for: ${platforms.join(', ')}

BUSINESS CONTEXT:
- Type: ${businessType || 'see content below'}
- Audience: ${audience || 'infer from content'}
- Brand Voice: ${brandVoice || 'friendly and authentic'}
${businessContext ? `- Knowledge: ${businessContext}` : ''}

CONTENT TO PROMOTE:
${content}
${keyword ? `Target keyword: ${keyword}` : ''}

PLATFORM-SPECIFIC RULES:
- Facebook: Conversational, storytelling format, ask questions to drive comments, 1-3 sentences then expand. Use line breaks for readability.
- LinkedIn: Professional insight format, start with a bold hook line, use "Here's what I learned:" or "X lessons from Y:" structure, end with a question. 3-5 short paragraphs.
- Instagram: Visual-first caption, start with a hook, use emojis sparingly, include 8-15 relevant hashtags at the end, use line breaks.
- Twitter/X: Punchy, max 280 chars, controversial or thought-provoking take, no hashtags in main text.

CRITICAL RULES:
- First line of EVERY post must be a scroll-stopping hook (question, bold claim, or unexpected statement)
- NEVER start with "Excited to announce..." or "We're thrilled to share..."
- Reference SPECIFIC details from the business/content — not generic platitudes
- Each post must have a clear CTA (soft: question, or hard: link/action)
- Hashtags must be RELEVANT to the niche — not generic like #business #success

Return ONLY JSON array:
[{
  "platform": "facebook",
  "text": "Full post text with line breaks",
  "hashtags": ["#relevant_niche_tag"],
  "hook": "The first line that stops the scroll",
  "cta": "What action the reader should take",
  "framework": "transformation|contrarian|problem-solution|recommendation"
}]`,
        }], { maxTokens: 1500 });

      const posts = extractJSON(text) || [];

      return {
        success: true,
        data: { posts, count: posts.length },
        memoryEntries: [{
          type: 'task_result',
          title: `Social posts generated: ${keyword || content.substring(0, 30)}`,
          content: JSON.stringify(posts),
          metadata: { tags: ['social', 'content'], platforms },
        }],
      };
    } catch {
      return {
        success: true,
        data: {
          posts: platforms.map((p) => ({ platform: p, text: `Check out our latest: ${content.substring(0, 100)}`, hashtags: [] })),
          count: platforms.length,
          fallback: true,
        },
      };
    }
  }
}
