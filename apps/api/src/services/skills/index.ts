// Export all skill modules
export * from './marketing-skills';
export * from './content-skills';
export * from './sales-skills';
export * from './support-skills';

// Import executor maps
import { marketingSkillExecutors } from './marketing-skills';
import { contentSkillExecutors } from './content-skills';
import { salesSkillExecutors } from './sales-skills';
import { supportSkillExecutors } from './support-skills';
import type { SkillResult } from './marketing-skills';

// Unified skill executor map
export const allSkillExecutors: Record<string, (input: unknown) => Promise<SkillResult>> = {
  ...marketingSkillExecutors,
  ...contentSkillExecutors,
  ...salesSkillExecutors,
  ...supportSkillExecutors,
};

// Agent type to skills mapping
export const agentSkillsMap: Record<string, string[]> = {
  marketing: [
    'generate_ad_copy',
    'generate_banner',
    'generate_short_video',
    'schedule_social_post',
    'generate_social_content',
    'generate_email_campaign',
    'analyze_campaign_performance',
  ],
  content: [
    'write_blog_post',
    'generate_product_description',
    'rewrite_content',
    'generate_faq',
  ],
  sales: [
    'score_lead',
    'send_outreach_email',
    'generate_proposal',
    'qualify_lead',
  ],
  support: [
    'answer_question',
    'create_ticket',
    'summarize_conversation',
    'generate_knowledge_article',
    'draft_response',
  ],
};

/**
 * Execute a skill by slug
 */
export async function executeSkill(
  skillSlug: string,
  input: unknown
): Promise<SkillResult> {
  const executor = allSkillExecutors[skillSlug];

  if (!executor) {
    return {
      success: false,
      error: `Unknown skill: ${skillSlug}`,
      metadata: { executionTimeMs: 0 },
    };
  }

  try {
    return await executor(input);
  } catch (error) {
    console.error(`[Skills] Skill ${skillSlug} execution failed:`, error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Skill execution failed',
      metadata: { executionTimeMs: 0 },
    };
  }
}

/**
 * Get available skills for an agent type
 */
export function getSkillsForAgentType(agentType: string): string[] {
  return agentSkillsMap[agentType] || [];
}

/**
 * Check if a skill is available for an agent type
 */
export function canAgentUseSkill(agentType: string, skillSlug: string): boolean {
  const agentSkills = agentSkillsMap[agentType];
  return agentSkills ? agentSkills.includes(skillSlug) : false;
}
