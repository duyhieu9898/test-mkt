/**
 * Marketing knowledge layer — expert frameworks adapted from
 * coreyhaines31/marketingskills (MIT). See ./marketing-skills/SOURCE.md.
 *
 * Services inject these into LLM system prompts so generations follow a senior
 * growth practitioner's playbook instead of a one-line "you are an expert".
 */
import {
  MARKETING_SKILL_KNOWLEDGE,
  MARKETING_SKILL_NAMES,
  type MarketingSkillName,
  type SkillKnowledge,
} from './skill-knowledge.generated';

export {
  MARKETING_SKILL_KNOWLEDGE,
  MARKETING_SKILL_NAMES,
  type MarketingSkillName,
  type SkillKnowledge,
};

/** Return the raw framework body for a skill, or undefined if unknown. */
export function getSkillKnowledge(name: string): SkillKnowledge | undefined {
  return MARKETING_SKILL_KNOWLEDGE[name];
}

/**
 * The 7 marketing categories from the source library, mapping each skill to a
 * group. Used to render the Marketing Playbooks Studio catalog.
 */
export const MARKETING_SKILL_CATEGORIES: { category: string; skills: string[] }[] = [
  {
    category: 'SEO & Content',
    skills: ['seo-audit', 'ai-seo', 'site-architecture', 'programmatic-seo', 'schema', 'content-strategy', 'aso', 'competitors', 'directory-submissions', 'customer-research'],
  },
  {
    category: 'Conversion (CRO)',
    skills: ['cro', 'signup', 'onboarding', 'popups', 'paywalls'],
  },
  {
    category: 'Content & Copy',
    skills: ['copywriting', 'copy-editing', 'cold-email', 'emails', 'social', 'sms', 'image', 'video'],
  },
  {
    category: 'Paid & Measurement',
    skills: ['ads', 'ad-creative', 'ab-testing', 'analytics'],
  },
  {
    category: 'Growth & Retention',
    skills: ['churn-prevention', 'referrals', 'free-tools', 'lead-magnets', 'community-marketing', 'co-marketing', 'competitor-profiling'],
  },
  {
    category: 'Sales & GTM',
    skills: ['revops', 'sales-enablement', 'launch', 'pricing'],
  },
  {
    category: 'Strategy',
    skills: ['marketing-ideas', 'marketing-psychology', 'product-marketing'],
  },
];

export interface SkillCatalogEntry {
  name: string;
  category: string;
  /** First sentence of the description — a human-friendly one-liner. */
  summary: string;
}

/** Friendly title-cased label for a skill slug (e.g. "ai-seo" → "AI SEO"). */
export function skillLabel(name: string): string {
  const special: Record<string, string> = {
    'ai-seo': 'AI SEO (GEO)',
    cro: 'CRO',
    aso: 'ASO',
    sms: 'SMS',
    revops: 'RevOps',
    'ab-testing': 'A/B Testing',
  };
  if (special[name]) return special[name];
  return name.split('-').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

/** Catalog of all skills grouped by category, with a short summary each. */
export function listSkillCatalog(): { category: string; items: SkillCatalogEntry[] }[] {
  return MARKETING_SKILL_CATEGORIES.map(({ category, skills }) => ({
    category,
    items: skills
      .map((s) => MARKETING_SKILL_KNOWLEDGE[s])
      .filter((entry): entry is SkillKnowledge => !!entry)
      .map((entry) => {
        const desc = entry.description || '';
        // First sentence, stripped of the leading "When the user wants to ..." trigger boilerplate.
        const firstSentence = desc.split(/(?<=\.)\s/)[0] ?? desc;
        const summary = firstSentence.replace(/^"?When the user wants to /i, 'Helps you ').replace(/"$/, '');
        return { name: entry.name, category, summary: summary.slice(0, 200) };
      }),
  }));
}

/**
 * Render a skill's framework as a system-prompt block, ready to prepend to an
 * LLM call. Returns '' for an unknown skill so callers can inject unconditionally.
 *
 * @param name  skill slug, e.g. 'copywriting', 'cro', 'ads', 'emails'
 * @param opts.maxChars  hard cap to bound token cost (default 9000 ≈ a lean SKILL.md)
 */
export function renderSkillKnowledge(
  name: string,
  opts: { maxChars?: number } = {},
): string {
  const skill = MARKETING_SKILL_KNOWLEDGE[name];
  if (!skill) return '';
  const max = opts.maxChars ?? 9000;
  let body = skill.body;
  if (body.length > max) {
    body = body.slice(0, max) + '\n\n[...framework truncated]';
  }
  return [
    `# Expert framework: ${skill.name}`,
    `Apply the following senior marketing playbook to produce the deliverable. Follow its principles, frameworks, checklists, and output structure, adapting every example to the user's product and brand voice.`,
    `IMPORTANT — you are running autonomously inside an automated pipeline. The product, audience, and brand context is already provided to you separately in this prompt. Do NOT ask the user any questions, do NOT pause for input, and IGNORE any instruction inside the playbook that says to read a file such as ".agents/product-marketing.md", to "check for product marketing context first", or to gather information interactively. Just generate the final output directly.`,
    '',
    body,
  ].join('\n');
}

/** Convenience: render several frameworks back-to-back. */
export function renderSkillKnowledgeBundle(
  names: string[],
  opts: { maxCharsEach?: number } = {},
): string {
  return names
    .map((n) => renderSkillKnowledge(n, { maxChars: opts.maxCharsEach }))
    .filter(Boolean)
    .join('\n\n---\n\n');
}
