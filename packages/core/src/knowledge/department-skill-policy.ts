import { MARKETING_SKILL_KNOWLEDGE } from './skill-knowledge.generated';

export type DepartmentKey =
  | 'executive'
  | 'research'
  | 'marketing'
  | 'content'
  | 'sales'
  | 'growth'
  | 'support'
  | 'general';

export interface DepartmentSkillPolicy {
  label: string;
  mission: string;
  defaultSkills: string[];
  qualityChecks: string[];
}

export interface SkillResolutionInput {
  type?: string;
  title?: string;
  description?: string;
  department?: string;
  explicitSkillIds?: string[];
}

export interface SkillResolution {
  department: DepartmentKey;
  skills: string[];
  reason: string;
}

const DEPARTMENT_POLICIES: Record<DepartmentKey, DepartmentSkillPolicy> = {
  executive: {
    label: 'Executive',
    mission: 'Turn company goals into a measurable cross-department plan, resolve trade-offs, and define approval gates.',
    defaultSkills: ['marketing-plan', 'launch'],
    qualityChecks: [
      'Connect the deliverable to a company goal and measurable outcome',
      'Make ownership, dependencies, risks, and approval gates explicit',
      'Do not perform irreversible publishing or spending actions without approval',
    ],
  },
  research: {
    label: 'Research',
    mission: 'Produce evidence-backed customer, market, and competitor insight for downstream teams.',
    defaultSkills: ['customer-research', 'competitor-profiling'],
    qualityChecks: [
      'Separate observed facts, assumptions, and recommendations',
      'Cite the supplied evidence and call out missing data',
      'End with implications that another department can act on',
    ],
  },
  marketing: {
    label: 'Marketing',
    mission: 'Design campaigns, distribution, positioning, and measurement that support company growth goals.',
    defaultSkills: ['marketing-ideas', 'analytics'],
    qualityChecks: [
      'Define audience, message, channel, CTA, owner, timing, and KPI',
      'Tie creative decisions to the campaign objective',
      'Require approval before publishing, sending, or spending',
    ],
  },
  content: {
    label: 'Content',
    mission: 'Create useful, differentiated, on-brand content for the intended audience and channel.',
    defaultSkills: ['copywriting', 'copy-editing'],
    qualityChecks: [
      'Match the company voice and customer language',
      'Use a clear structure, concrete claims, and one primary CTA',
      'Return a publishable deliverable, not generic advice',
    ],
  },
  sales: {
    label: 'Sales',
    mission: 'Turn qualified market opportunities into relevant conversations and sales-ready assets.',
    defaultSkills: ['sales-enablement', 'cold-email'],
    qualityChecks: [
      'Personalize from supplied account and buyer evidence',
      'State the buyer problem, value, proof, objection response, and next step',
      'Do not send outreach without approval',
    ],
  },
  growth: {
    label: 'Growth',
    mission: 'Improve acquisition, activation, retention, and revenue through measurable experiments.',
    defaultSkills: ['cro', 'ab-testing'],
    qualityChecks: [
      'State the funnel stage, baseline, hypothesis, change, and success metric',
      'Prioritize by expected impact, confidence, and effort',
      'Avoid claiming causality without sufficient evidence',
    ],
  },
  support: {
    label: 'Customer Support',
    mission: 'Resolve customer needs accurately and feed recurring insights back to product, content, and growth.',
    defaultSkills: [],
    qualityChecks: [
      'Use only verified company and customer information',
      'State the resolution, owner, urgency, and follow-up',
      'Escalate rather than invent an answer',
    ],
  },
  general: {
    label: 'General Operations',
    mission: 'Complete the assigned work with clear ownership, evidence, and a usable deliverable.',
    defaultSkills: [],
    qualityChecks: [
      'Clarify the expected deliverable and completion criteria',
      'Make assumptions and dependencies explicit',
      'Stay within the assigned role and approval policy',
    ],
  },
};

const TASK_SKILL_RULES: Array<{
  pattern: RegExp;
  skills: string[];
  department?: DepartmentKey;
}> = [
  { pattern: /\b(marketing plan|growth plan|go[- ]to[- ]market|gtm plan|ke hoach marketing|ke hoach tang truong)\b/i, skills: ['marketing-plan'], department: 'executive' },
  { pattern: /\b(launch|release|announcement|ra mat|cong bo san pham)\b/i, skills: ['launch', 'marketing-plan'], department: 'marketing' },
  { pattern: /\b(competitors?|competitive|market research|doi thu|nghien cuu thi truong)\b/i, skills: ['competitor-profiling', 'customer-research'], department: 'research' },
  { pattern: /\b(customer research|customer pains?|persona|ideal customer|icp|jobs? to be done|jtbd|nghien cuu khach hang|chan dung khach hang)\b/i, skills: ['customer-research', 'product-marketing'], department: 'research' },
  { pattern: /\b(prospects?|lead list|account list|khach hang tiem nang|danh sach lead)\b/i, skills: ['prospecting', 'customer-research'], department: 'sales' },
  { pattern: /\b(cold email|outreach|follow[- ]?up email|email tiep can|email ban hang)\b/i, skills: ['cold-email', 'sales-enablement'], department: 'sales' },
  { pattern: /\b(proposal|pitch deck|one[- ]pager|objection|demo script)\b/i, skills: ['sales-enablement', 'offers'], department: 'sales' },
  { pattern: /\b(price|pricing|package|monetization)\b/i, skills: ['pricing', 'offers'], department: 'executive' },
  { pattern: /\b(blog|article|editorial|content brief|content calendar|bai viet|lich noi dung)\b/i, skills: ['content-strategy', 'copywriting'], department: 'content' },
  { pattern: /\b(edit|rewrite|proofread|polish)\b/i, skills: ['copy-editing', 'copywriting'], department: 'content' },
  { pattern: /\b(social|linkedin|facebook post|instagram|twitter|x post|bai dang|mang xa hoi)\b/i, skills: ['social', 'copywriting'], department: 'content' },
  { pattern: /\b(email campaign|email sequence|newsletter|lifecycle email)\b/i, skills: ['emails', 'copywriting'], department: 'marketing' },
  { pattern: /\b(ad creative|advertis|paid campaign|google ads|meta ads)\b/i, skills: ['ads', 'ad-creative'], department: 'marketing' },
  { pattern: /\b(landing page|homepage|conversion|cta|form optimization|trang dich|chuyen doi)\b/i, skills: ['cro', 'copywriting'], department: 'growth' },
  { pattern: /\b(signup|registration|trial activation)\b/i, skills: ['signup', 'cro'], department: 'growth' },
  { pattern: /\b(onboarding|activation|first[- ]run)\b/i, skills: ['onboarding', 'emails'], department: 'growth' },
  { pattern: /\b(churn|retention|cancel flow|dunning)\b/i, skills: ['churn-prevention', 'emails'], department: 'growth' },
  { pattern: /\b(referral|affiliate|word of mouth)\b/i, skills: ['referrals'], department: 'growth' },
  { pattern: /\b(a\/b|ab test|experiment|hypothesis)\b/i, skills: ['ab-testing', 'analytics'], department: 'growth' },
  { pattern: /\b(analytics|tracking|measurement|kpi|attribution)\b/i, skills: ['analytics'], department: 'marketing' },
  { pattern: /\b(technical seo|seo audit|search audit)\b/i, skills: ['seo-audit'], department: 'growth' },
  { pattern: /\b(ai seo|geo|llmo|answer engine)\b/i, skills: ['ai-seo', 'content-strategy'], department: 'content' },
  { pattern: /\b(seo|keyword|organic search)\b/i, skills: ['content-strategy', 'seo-audit'], department: 'content' },
  { pattern: /\b(public relations|press release|journalist|earned media|pr campaign)\b/i, skills: ['public-relations'], department: 'marketing' },
  { pattern: /\b(offer|value proposition|guarantee)\b/i, skills: ['offers', 'copywriting'], department: 'marketing' },
];

function normalizeText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .trim();
}

export function normalizeDepartment(value?: string): DepartmentKey {
  const normalized = normalizeText(value || '');
  if (!normalized) return 'general';
  if (/(executive|leadership|ceo|founder|strategy|dieu hanh|chien luoc)/.test(normalized)) return 'executive';
  if (/(research|insight|market intelligence|nghien cuu)/.test(normalized)) return 'research';
  if (/(content|editorial|writer|copy|noi dung)/.test(normalized)) return 'content';
  if (/(sales|revenue|business development|kinh doanh)/.test(normalized)) return 'sales';
  if (/(growth|cro|acquisition|retention|tang truong)/.test(normalized)) return 'growth';
  if (/(support|success|customer service|cham soc|ho tro)/.test(normalized)) return 'support';
  if (/(marketing|brand|demand|tiep thi)/.test(normalized)) return 'marketing';
  return 'general';
}

export function getDepartmentSkillPolicy(department?: string): DepartmentSkillPolicy {
  return DEPARTMENT_POLICIES[normalizeDepartment(department)];
}

function availableSkills(skills: string[]): string[] {
  return [...new Set(skills)].filter((skill) => Boolean(MARKETING_SKILL_KNOWLEDGE[skill]));
}

export function resolveSkillsForTask(input: SkillResolutionInput): SkillResolution {
  const text = normalizeText([input.type, input.title, input.description].filter(Boolean).join(' '));
  const requestedDepartment = normalizeDepartment(input.department);
  const explicit = availableSkills(input.explicitSkillIds || []);
  const explicitSelectionProvided = Array.isArray(input.explicitSkillIds);
  const matchedRules = TASK_SKILL_RULES.filter((rule) => rule.pattern.test(text));
  const inferredDepartment =
    requestedDepartment !== 'general'
      ? requestedDepartment
      : matchedRules.find((rule) => rule.department)?.department || 'general';

  const ruleSkills = matchedRules.flatMap((rule) => rule.skills);
  const fallbackSkills =
    matchedRules.length === 0 && explicitSelectionProvided
      ? []
      : DEPARTMENT_POLICIES[inferredDepartment].defaultSkills;
  const skills = availableSkills([...explicit, ...ruleSkills, ...fallbackSkills]).slice(0, 2);

  const reason = explicit.length
    ? 'Task supplied explicit knowledge skills; invalid or unavailable names were ignored.'
    : matchedRules.length
      ? 'Skills inferred deterministically from task type and wording.'
      : skills.length
        ? 'No task rule matched; department defaults were used.'
        : 'No marketing knowledge skill is needed for this task.';

  return { department: inferredDepartment, skills, reason };
}

export function renderDepartmentPolicy(department?: string): string {
  const key = normalizeDepartment(department);
  const policy = DEPARTMENT_POLICIES[key];
  return [
    `Department: ${policy.label}`,
    `Mission: ${policy.mission}`,
    'Definition of quality:',
    ...policy.qualityChecks.map((check) => `- ${check}`),
  ].join('\n');
}
