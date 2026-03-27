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
import { eq, desc, and } from 'drizzle-orm';
import {
  companies,
  knowledgeBase,
  brandIdentities,
  agentMemories,
} from '@1person/core/db';

export interface BusinessContext {
  companyName: string;
  industry: string;
  description: string;
  businessType: string;

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

  // From meetings
  strategies: string[];
  decisions: string[];

  // Compiled context string for LLM
  fullContext: string;
}

export async function buildBusinessContext(companyId: string): Promise<BusinessContext> {
  // 1. Company profile
  const company = await db.query.companies.findFirst({
    where: eq(companies.id, companyId),
  });

  // 2. All knowledge entries (max 30)
  const knowledge = await db
    .select({ category: knowledgeBase.category, title: knowledgeBase.title, content: knowledgeBase.content })
    .from(knowledgeBase)
    .where(eq(knowledgeBase.companyId, companyId))
    .orderBy(desc(knowledgeBase.updatedAt))
    .limit(30);

  // 3. Brand identity
  const brand = await db.query.brandIdentities.findFirst({
    where: eq(brandIdentities.companyId, companyId),
  });

  // 4. Agent memories (strategies, performance)
  const memories = await db
    .select({ type: agentMemories.type, title: agentMemories.title, content: agentMemories.content })
    .from(agentMemories)
    .where(eq(agentMemories.companyId, companyId))
    .orderBy(desc(agentMemories.createdAt))
    .limit(15);

  // Categorize knowledge
  const byCategory = (cat: string) =>
    knowledge.filter((k) => k.category === cat).map((k) => `${k.title}: ${k.content.substring(0, 200)}`);

  const products = byCategory('product');
  const pricing = byCategory('pricing');
  const targetAudience = byCategory('customer');
  const faqs = byCategory('faq');
  const policies = byCategory('policy');
  const general = byCategory('general');

  // Extract meeting strategies from memories
  const strategyMemories = memories
    .filter((m) => m.type === 'strategy')
    .map((m) => m.title);
  const decisionMemories = memories
    .filter((m) => m.type === 'decision')
    .map((m) => m.title);

  // Brand info
  const brandColors = {
    primary: (brand?.colors as any)?.primary || '#3b82f6',
    secondary: (brand?.colors as any)?.secondary || '#8b5cf6',
  };
  const brandVoice = (brand?.voice as any)?.tone || ['professional'];
  const brandStyle = (brand as any)?.visualStyle || 'modern';

  // Build comprehensive context string for LLM
  const contextParts: string[] = [];

  contextParts.push(`COMPANY: ${company?.name || 'Unknown'}`);
  contextParts.push(`INDUSTRY: ${company?.industry || 'Unknown'}`);
  contextParts.push(`DESCRIPTION: ${company?.description || 'No description'}`);

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
  if (general.length > 0) {
    contextParts.push(`\nBUSINESS INFO:\n${general.join('\n')}`);
  }
  if (strategyMemories.length > 0) {
    contextParts.push(`\nSTRATEGY (from meetings):\n${strategyMemories.join('\n')}`);
  }

  contextParts.push(`\nBRAND: Voice=${brandVoice.join(',')}, Style=${brandStyle}, Colors=${brandColors.primary}/${brandColors.secondary}`);

  return {
    companyName: company?.name || 'Business',
    industry: company?.industry || 'Unknown',
    description: company?.description || '',
    businessType: (company as any)?.businessType || '',
    products,
    pricing,
    targetAudience,
    faqs,
    policies,
    brandColors,
    brandVoice,
    brandStyle,
    strategies: strategyMemories,
    decisions: decisionMemories,
    fullContext: contextParts.join('\n'),
  };
}
