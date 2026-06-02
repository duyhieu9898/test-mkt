/**
 * Competitor Comparison Page Generator
 *
 * Builds a "Us vs Them" landing page by calling the existing
 * landing-page service with a well-crafted prompt derived from:
 *   - your business context
 *   - the competitor's profile + signals
 *
 * Returns the generated landing page so the UI can redirect to its editor.
 */

import { landingPageService } from './landing-page-service';
import { buildBusinessContext } from './business-context';
import { getTenantAI } from '../lib/tenant-ai';
import type { GeneratedPage } from './landing-page-service';

export async function generateComparisonPage(args: {
  companyId: string;
  tenantId: string;
  competitorId: string;
}): Promise<GeneratedPage> {
  const { companyId, tenantId, competitorId } = args;
  const ai = getTenantAI();

  const competitor = await ai.market.getCompetitor(tenantId, competitorId);
  if (!competitor) throw new Error('Competitor not found');

  const ctx = await buildBusinessContext(companyId, 'admin');

  const signalsText = competitor.latestSignals.length
    ? competitor.latestSignals.slice(0, 5).map((s) => `- [${s.type}] ${s.text}`).join('\n')
    : '(no scan signals available)';

  const prompt = `Create a comparison landing page showing why ${ctx.companyName || 'we'} is a better choice than ${competitor.name}.

YOUR COMPANY:
- Name: ${ctx.companyName || 'Our company'}
- Industry: ${ctx.industry || 'N/A'}
- What we do: ${ctx.description || 'N/A'}
- Products: ${ctx.products.slice(0, 5).join(' | ') || 'N/A'}
- Target audience: ${ctx.targetAudience.slice(0, 3).join(' | ') || 'N/A'}
- Brand voice: ${ctx.brandVoice.slice(0, 3).join(', ') || 'professional'}

COMPETITOR: ${competitor.name}${competitor.url ? ` (${competitor.url})` : ''}
Recent activity:
${signalsText}

Requirements for the landing page:
- Hero: compelling headline positioning us as the better choice (NOT attacking, just confident)
- Side-by-side comparison: 5-6 meaningful dimensions (price model, features, support, target fit, flexibility, etc.). Use fair, honest assessments — avoid unverifiable claims.
- "Why founders switch to us" section: 3 concrete reasons with specific benefits
- Customer-focused CTA: "Try [our product]" or "See a demo"
- Tone: confident but respectful. Never disparage the competitor.

Write in ${ctx.brandVoice.includes('friendly') ? 'a warm, friendly' : 'a professional, confident'} tone.`;

  return landingPageService.generateFromPrompt({
    companyId,
    prompt,
    style: 'professional',
    includeFeatures: true,
    includePricing: false,
    includeTestimonials: true,
    includeFAQ: true,
  });
}
