/**
 * Marketing Agent - Campaign ideation and email content
 *
 * Uses same BullMQ task queue as all other agents.
 */

import { BaseAgent, type AgentContext, type AgentResult } from './base-agent';
import { llmGenerate, extractJSON } from '../lib/llm';

export class MarketingAgent extends BaseAgent {
  readonly name = 'marketing_agent';
  readonly description = 'Generates marketing campaigns, email sequences, and promotional content';
  readonly capabilities = ['create_campaign', 'generate_email', 'marketing_strategy'];

  canHandle(taskType: string): boolean {
    return this.capabilities.includes(taskType);
  }

  async execute(input: Record<string, unknown>, context: AgentContext): Promise<AgentResult> {
    const businessType = input.businessType as string || '';
    const audience = input.audience as string || '';
    const goal = input.goal as string || 'increase awareness';
    const offerings = input.offerings as string[] || [];
    const brandVoice = input.brandVoice as string || 'professional';
    const budget = input.budget as string || 'bootstrap';

    // Load business context from memory if available
    let memoryContext = '';
    try {
      const memories = await context.memory.recallKnowledge('company_profile');
      if (memories.length > 0) memoryContext = memories[0].content.substring(0, 500);
    } catch {}

    try {
      const { text } = await llmGenerate([{
          role: 'system',
          content: `You are a data-driven marketing strategist. You create campaigns based on SPECIFIC business details — never generic templates. Every recommendation must reference the actual business, audience, and offerings provided.`,
        }, {
          role: 'user',
          content: `Create a targeted marketing campaign.

BUSINESS DETAILS:
- Type: ${businessType}
- Target Audience: ${audience}
- Offerings: ${offerings.join(', ') || 'see business type'}
- Brand Voice: ${brandVoice}
- Budget Level: ${budget}
- Goal: ${goal}
${memoryContext ? `\nBUSINESS CONTEXT (from knowledge base):\n${memoryContext}` : ''}

RULES:
- Campaign name must reference the SPECIFIC business/product — not generic like "Growth Campaign"
- Email subjects must follow proven copywriting formulas (curiosity gap, benefit-driven, or urgency)
- Key messages must cite SPECIFIC offerings or audience pain points
- Channel selection must match where the target audience actually spends time
- Include a clear funnel: awareness → interest → conversion
- Duration should match the goal complexity

Return ONLY JSON:
{
  "campaign": {
    "name": "Specific Campaign Name for [Business]",
    "description": "Why this campaign works for this specific audience",
    "channels": ["channel1", "channel2"],
    "duration": "X weeks",
    "funnel": {
      "awareness": "How we attract attention",
      "interest": "How we build desire",
      "conversion": "How we close"
    },
    "emails": [
      {"subject": "Curiosity/benefit-driven subject", "preview": "First line preview", "purpose": "welcome|nurture|convert"}
    ],
    "keyMessages": ["Message referencing specific offering/pain point"],
    "kpis": ["Measurable KPI 1", "Measurable KPI 2"]
  }
}`,
        }], { maxTokens: 1500 });

      const campaign = extractJSON(text) || { campaign: { name: 'Growth Campaign', channels: ['email'] } };

      return {
        success: true,
        data: campaign,
        memoryEntries: [{
          type: 'strategy',
          title: `Campaign: ${campaign.campaign?.name || goal}`,
          content: JSON.stringify(campaign),
          metadata: { tags: ['marketing', 'campaign'] },
        }],
      };
    } catch {
      return { success: true, data: { campaign: { name: 'Growth Campaign', description: goal, channels: ['email', 'social'] } } };
    }
  }
}
