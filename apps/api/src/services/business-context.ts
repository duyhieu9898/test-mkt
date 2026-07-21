/**
 * Business Context Builder
 *
 * Loads FULL business understanding from ALL memory sources:
 * - Company profile (from FTUX)
 * - Knowledge base (uploaded docs, URLs, text)
 * - Meeting insights (approved meetings)
 * - Brand identity (colors, voice, style)
 * - Website analysis (if available)
 * - Agent memories (SEO, content, performance)
 *
 * Used by: Banner Agent, Social Post Agent, Campaign Agent, Chatbot
 * So every AI action understands the full business context.
 */

import { db } from '../lib/db';
import { eq, desc, and, inArray, sql } from 'drizzle-orm';
import {
  companies,
  knowledgeBase,
  brandIdentities,
  agentMemories,
  type BusinessPlan,
  type GrowthMasterPlan,
} from '@1person/core/db';
import { getActiveBrandIq, renderBrandIqContext } from './brand-iq-extractor';
import {
  buildContentLanguageInstruction,
  contentLanguageName,
  normalizeContentLanguage,
  type ContentLanguage,
} from '../lib/language';

/**
 * Visibility filter level — controls which knowledge entries are included.
 *
 *   'public'   — only public docs (for customer-facing chatbot widget)
 *   'internal' — public + internal (for logged-in team members)
 *   'admin'    — all (for owner/admin)
 *   'all'      — no filter (legacy behavior, same as admin)
 */
export type VisibilityLevel = 'public' | 'internal' | 'admin' | 'all';

/**
 * Map visibility level to allowed document visibility values.
 * A chatbot in 'internal' mode can see both 'public' and 'internal' docs.
 */
function allowedVisibilities(level: VisibilityLevel): string[] {
  switch (level) {
    case 'public':
      return ['public'];
    case 'internal':
      return ['public', 'internal'];
    case 'admin':
    case 'all':
      return ['public', 'internal', 'confidential'];
  }
}

type KnowledgeContextEntry = {
  category: string;
  title: string;
  content: string;
  tags: string[];
};

function isMissingKnowledgeTagsColumn(error: unknown): boolean {
  const seen = new Set<unknown>();
  let current: unknown = error;

  while (current && typeof current === 'object' && !seen.has(current)) {
    seen.add(current);
    const err = current as { code?: string; message?: string; cause?: unknown };
    if (err.code === '42703' || err.message?.includes('column "tags" does not exist')) {
      return true;
    }
    current = err.cause;
  }

  return false;
}

export interface BusinessContext {
  companyName: string;
  industry: string;
  description: string;
  businessType: string;
  language: ContentLanguage;
  languageName: string;

  // From knowledge_base
  products: string[];
  pricing: string[];
  targetAudience: string[];
  faqs: string[];
  policies: string[];

  // From brand
  brandColors: { primary?: string; secondary?: string };
  brandVoice: string[];
  brandStyle: string;
  growthPlan?: GrowthMasterPlan;
  businessPlan?: BusinessPlan;

  // From meetings
  strategies: string[];
  decisions: string[];

  // Compiled context string for LLM
  fullContext: string;
}

/**
 * Build a business context snapshot for a company. Used by every
 * content generator, chatbot, and agent in the system.
 *
 * @param visibilityFilter — Controls which knowledge entries are
 *   included based on their visibility level. Default 'all' = no
 *   filter (legacy behavior). Pass 'public' for the embed chatbot
 *   widget so it never leaks internal/confidential data.
 */
export async function buildBusinessContext(
  companyId: string,
  visibilityFilter: VisibilityLevel = 'all',
  knowledgeTags: string[] = [],
): Promise<BusinessContext> {
  const allowed = allowedVisibilities(visibilityFilter);
  const canUseInternalContext = visibilityFilter !== 'public';

  // 1. Company profile
  const company = await db.query.companies.findFirst({
    where: eq(companies.id, companyId),
  });
  const language = normalizeContentLanguage(company?.settings?.language);

  // 2. Knowledge entries filtered by visibility. If a chatbot has tags,
  // empty-tag entries stay global and tagged entries must overlap.
  const knowledgeWhere = and(
    eq(knowledgeBase.companyId, companyId),
    sql`${knowledgeBase.visibility} = ANY(${sql.raw(`ARRAY[${allowed.map((v) => `'${v}'`).join(',')}]`)})`,
  );

  let rawKnowledge: KnowledgeContextEntry[];
  try {
    rawKnowledge = await db
      .select({
        category: knowledgeBase.category,
        title: knowledgeBase.title,
        content: knowledgeBase.content,
        tags: knowledgeBase.tags,
      })
      .from(knowledgeBase)
      .where(knowledgeWhere)
      .orderBy(desc(knowledgeBase.updatedAt))
      .limit(80);
  } catch (error) {
    if (!isMissingKnowledgeTagsColumn(error)) throw error;

    const legacyKnowledge = await db
      .select({
        category: knowledgeBase.category,
        title: knowledgeBase.title,
        content: knowledgeBase.content,
      })
      .from(knowledgeBase)
      .where(knowledgeWhere)
      .orderBy(desc(knowledgeBase.updatedAt))
      .limit(80);

    rawKnowledge = legacyKnowledge.map((entry) => ({ ...entry, tags: [] }));
  }

  const tagSet = new Set((knowledgeTags || []).map((tag) => tag.trim()).filter(Boolean));
  const knowledge = rawKnowledge
    .filter((entry) => {
      if (tagSet.size === 0) return true;
      const entryTags = Array.isArray(entry.tags) ? entry.tags : [];
      if (entryTags.length === 0) return true;
      return entryTags.some((tag) => tagSet.has(tag));
    })
    .slice(0, 30);

  // 3. Brand identity
  const brand = await db.query.brandIdentities.findFirst({
    where: eq(brandIdentities.companyId, companyId),
  });

  // 4. Agent memories (strategies, performance). These are internal
  // operating notes, so public widgets must not receive them.
  const memories = canUseInternalContext
    ? await db
        .select({ type: agentMemories.type, title: agentMemories.title, content: agentMemories.content })
        .from(agentMemories)
        .where(eq(agentMemories.companyId, companyId))
        .orderBy(desc(agentMemories.createdAt))
        .limit(15)
    : [];

  // Categorize knowledge
  const byCategory = (cat: string) =>
    knowledge.filter((k) => k.category === cat).map((k) => `${k.title}: ${k.content.substring(0, 200)}`);

  const products = byCategory('product');
  const pricing = byCategory('pricing');
  const targetAudience = byCategory('customer');
  const faqs = byCategory('faq');
  const policies = byCategory('policy');
  const general = byCategory('general');
  const meetingSummaries = byCategory('meeting_insight');
  const meetingStrategies = byCategory('strategy');
  const meetingDecisions = byCategory('decision');
  const marketInsights = byCategory('market');
  const salesObjections = byCategory('sales_objection');

  // Extract meeting strategies from memories
  const strategyMemories = memories
    .filter((m) => m.type === 'strategy')
    .map((m) => m.title);
  const decisionMemories = memories
    .filter((m) => m.type === 'decision')
    .map((m) => m.title);
  const approvedStrategies = [...meetingStrategies, ...strategyMemories];
  const approvedDecisions = [...meetingDecisions, ...decisionMemories];

  // Brand info
  const brandColors = {
    primary: (brand?.colors as any)?.primary || '#3b82f6',
    secondary: (brand?.colors as any)?.secondary || '#8b5cf6',
  };
  const brandVoice = (brand?.voice as any)?.tone || ['professional'];
  const brandStyle = (brand as any)?.visualStyle || 'modern';
  const growthPlan = canUseInternalContext ? company?.businessPlan?.growthPlan : undefined;

  // Build comprehensive context string for LLM
  const contextParts: string[] = [];

  // Brand IQ first — every agent reads this before anything else (Block 2).
  // Falls back silently if the founder hasn't set one up yet.
  const brandIq = canUseInternalContext
    ? await getActiveBrandIq(companyId).catch(() => null)
    : null;
  if (brandIq) {
    contextParts.push(renderBrandIqContext(brandIq));
    contextParts.push('');
  }

  contextParts.push(`COMPANY: ${company?.name || 'Unknown'}`);
  contextParts.push(`INDUSTRY: ${company?.industry || 'Unknown'}`);
  contextParts.push(`DESCRIPTION: ${company?.description || 'No description'}`);
  contextParts.push(`\n${buildContentLanguageInstruction(language)}`);
  if (canUseInternalContext && company?.businessPlan) {
    contextParts.push(`\nAPPROVED BUSINESS & GROWTH PLAN:\n${JSON.stringify(company.businessPlan, null, 2).slice(0, 6000)}`);
  }

  if (products.length > 0) {
    contextParts.push(`\nPRODUCTS & SERVICES:\n${products.join('\n')}`);
  }
  if (pricing.length > 0) {
    contextParts.push(`\nPRICING:\n${pricing.join('\n')}`);
  }
  if (targetAudience.length > 0) {
    contextParts.push(`\nTARGET AUDIENCE:\n${targetAudience.join('\n')}`);
  }
  if (faqs.length > 0) {
    contextParts.push(`\nFAQs:\n${faqs.join('\n')}`);
  }
  if (policies.length > 0) {
    contextParts.push(`\nPOLICIES:\n${policies.join('\n')}`);
  }
  if (general.length > 0) {
    contextParts.push(`\nBUSINESS INFO:\n${general.join('\n')}`);
  }
  if (meetingSummaries.length > 0) {
    contextParts.push(`\nAPPROVED MEETING INSIGHTS:\n${meetingSummaries.join('\n')}`);
  }
  if (approvedStrategies.length > 0) {
    contextParts.push(`\nSTRATEGY (from approved meetings):\n${approvedStrategies.join('\n')}`);
  }
  if (approvedDecisions.length > 0) {
    contextParts.push(`\nDECISIONS (from approved meetings):\n${approvedDecisions.join('\n')}`);
  }
  if (marketInsights.length > 0) {
    contextParts.push(`\nMARKET INSIGHTS (from approved meetings):\n${marketInsights.join('\n')}`);
  }
  if (salesObjections.length > 0) {
    contextParts.push(`\nSALES OBJECTIONS (from approved meetings):\n${salesObjections.join('\n')}`);
  }

  contextParts.push(`\nBRAND: Voice=${brandVoice.join(',')}, Style=${brandStyle}, Colors=${brandColors.primary}/${brandColors.secondary}`);

  return {
    companyName: company?.name || 'Business',
    industry: company?.industry || 'Unknown',
    description: company?.description || '',
    businessType: (company as any)?.businessType || '',
    language,
    languageName: contentLanguageName(language),
    products,
    pricing,
    targetAudience,
    faqs,
    policies,
    brandColors,
    brandVoice,
    brandStyle,
    growthPlan,
    businessPlan: canUseInternalContext ? company?.businessPlan ?? undefined : undefined,
    strategies: canUseInternalContext ? approvedStrategies : [],
    decisions: canUseInternalContext ? approvedDecisions : [],
    fullContext: contextParts.join('\n'),
  };
}
