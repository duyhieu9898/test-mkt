/**
 * Landing Page Agent - Creates landing pages in the database
 *
 * This agent is triggered by the orchestrator as part of the growth workflow.
 * It creates REAL landing pages with SEO data (keyword, intent, cluster).
 * Pages are NOT manually created — the system generates them automatically.
 */

import { llmGenerate, extractJSON } from '../lib/llm';
import { BaseAgent, type AgentContext, type AgentResult } from './base-agent';
import { db } from '../lib/db';
import { eq } from 'drizzle-orm';

export class LandingPageAgent extends BaseAgent {
  readonly name = 'landing_page_creator';
  readonly description = 'Creates SEO-optimized landing pages in the database based on keyword and content strategy';
  readonly capabilities = ['create_landing_page', 'generate_seo_page', 'create_content'];

  canHandle(taskType: string): boolean {
    return this.capabilities.includes(taskType);
  }

  async execute(input: Record<string, unknown>, context: AgentContext): Promise<AgentResult> {
    const businessInfo = input.businessInfo as Record<string, unknown> | undefined;
    const keywordOpportunities = input.keywordOpportunities as Array<{ keyword: string; volume: string; competition: string }> | undefined;
    const prompt = input.prompt as string | undefined;

    // We need at least some business context
    if (!businessInfo && !prompt) {
      return { success: false, data: {}, error: 'Business info or prompt required' };
    }

    try {
      // Generate landing page content via AI
      const language = input.language as string | undefined;
      const pages = await this.generatePages(businessInfo, keywordOpportunities, prompt, language);

      // Save pages to database
      const createdPages: Array<{ id: string; name: string; keyword: string; status: string }> = [];

      for (const page of pages) {
        try {
          const { landingPages } = await import('@1person/core/db');

          const slug = page.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

          const [created] = await db.insert(landingPages).values({
            companyId: context.companyId,
            name: page.name,
            slug,
            description: page.description,
            primaryColor: '#3b82f6',
            status: 'draft',
            businessContext: {
              keyword: page.keyword,
              searchIntent: page.intent,
              pageType: page.pageType,
              cluster: page.cluster,
              valueProposition: page.description,
            } as any,
          }).returning();

          createdPages.push({
            id: created.id,
            name: created.name,
            keyword: page.keyword,
            status: 'draft',
          });

          // Create sections for the page
          const { landingPageSections } = await import('@1person/core/db');

          const sections = this.generateSections(page);
          for (let i = 0; i < sections.length; i++) {
            await db.insert(landingPageSections).values({
              pageId: created.id,
              type: sections[i].type,
              content: sections[i].content as any,
              order: i,
              isVisible: 1,
            });
          }
        } catch (err) {
          console.warn(`[LandingPageAgent] Failed to create page "${page.name}":`, err);
        }
      }

      return {
        success: true,
        data: {
          pagesCreated: createdPages.length,
          pages: createdPages,
        },
        memoryEntries: [
          {
            type: 'task_result',
            title: `Created ${createdPages.length} landing pages`,
            content: JSON.stringify(createdPages),
            metadata: { tags: ['content', 'landing-pages'], count: createdPages.length },
          },
        ],
      };
    } catch (error) {
      console.error('[LandingPageAgent] Failed:', error);
      return { success: false, data: {}, error: error instanceof Error ? error.message : 'Failed to create pages' };
    }
  }

  private async generatePages(
    businessInfo: Record<string, unknown> | undefined,
    keywords: Array<{ keyword: string; volume: string; competition: string }> | undefined,
    prompt: string | undefined,
    language?: string
  ): Promise<Array<{ name: string; description: string; keyword: string; intent: string; pageType: string; cluster: string; heroHeadline: string; heroSubheadline: string; ctaText: string }>> {
    const businessDesc = businessInfo
      ? `Business: ${businessInfo.businessType || businessInfo.coreOffering || 'Unknown'}
Target: ${businessInfo.targetAudience || 'Unknown'}
Offerings: ${JSON.stringify(businessInfo.offerings || [])}`
      : `Business: ${prompt || 'Unknown'}`;

    const keywordList = keywords?.slice(0, 5).map((k) => k.keyword).join(', ') || 'general business keywords';

    const LANG_NAMES: Record<string, string> = {
      en: 'English', vi: 'Vietnamese (Tiếng Việt)', zh: 'Chinese', ja: 'Japanese', ko: 'Korean', th: 'Thai', fr: 'French', es: 'Spanish',
    };
    const lang = language || (businessInfo?.language as string) || 'en';
    const langName = LANG_NAMES[lang] || 'English';
    const langRule = lang !== 'en' ? `\n- ALL content (page names, headlines, subheadlines, CTAs) MUST be in ${langName}. Keywords can stay in the original language for SEO.` : '';

    try {
      const { text } = await llmGenerate([{
          role: 'system',
          content: `You are a conversion-focused landing page strategist. Every page you create is designed to rank in Google AND convert visitors into leads/customers. You use the AIDA framework (Attention, Interest, Desire, Action) and reference SPECIFIC business offerings.`,
        }, {
          role: 'user',
          content: `Generate 3 SEO-optimized landing pages for this business.

${businessDesc}
Target keywords: ${keywordList}

Return ONLY valid JSON array:
[
  {
    "name": "Page Title (max 60 chars, include primary keyword, benefit-driven)",
    "description": "Who this page targets and what conversion it drives",
    "keyword": "exact primary keyword to rank for",
    "intent": "informational|commercial|transactional",
    "pageType": "money_page|blog|service_page|comparison",
    "cluster": "topic cluster name",
    "heroHeadline": "Benefit-driven H1 (6-12 words, addresses visitor's #1 pain point)",
    "heroSubheadline": "Supporting text that builds credibility and urgency (1-2 sentences)",
    "ctaText": "Action verb + specific outcome (e.g., 'Get Your Free Audit' not 'Submit')"
  }
]

RULES:${langRule}
- Each page targets a DIFFERENT keyword with different search intent
- Include at least 1 transactional "money page" (designed to convert)
- Page names must include the primary keyword naturally
- Hero headlines must address a specific PAIN POINT or DESIRE of the target audience
- Subheadlines must include social proof or credibility signal (numbers, timeframes, guarantees)
- CTA text must use action verbs and promise a specific outcome
- NEVER use generic CTAs like "Learn More", "Submit", "Click Here"
- Page descriptions must specify the target reader persona`,
        }], { maxTokens: 2000 });

      const parsed = extractJSON(text);
      if (parsed && Array.isArray(parsed)) {
        return parsed;
      }
    } catch (error) {
      console.warn('[LandingPageAgent] AI generation failed, using defaults:', error);
    }

    // Fallback: generate basic pages from business info
    const businessType = (businessInfo?.businessType as string) || prompt || 'Our Business';
    return [
      {
        name: `${businessType} - Get Started`,
        description: `Main landing page for ${businessType}`,
        keyword: (keywords?.[0]?.keyword) || businessType.toLowerCase(),
        intent: 'transactional',
        pageType: 'money_page',
        cluster: 'main',
        heroHeadline: `Welcome to ${businessType}`,
        heroSubheadline: 'Transform your business with our solutions',
        ctaText: 'Get Started Free',
      },
      {
        name: `Why Choose ${businessType}`,
        description: `Benefits and features page`,
        keyword: (keywords?.[1]?.keyword) || `why ${businessType.toLowerCase()}`,
        intent: 'commercial',
        pageType: 'service_page',
        cluster: 'benefits',
        heroHeadline: `Why Choose ${businessType}?`,
        heroSubheadline: 'Discover what makes us different',
        ctaText: 'Learn More',
      },
      {
        name: `${businessType} Guide`,
        description: `Educational content about ${businessType}`,
        keyword: (keywords?.[2]?.keyword) || `${businessType.toLowerCase()} guide`,
        intent: 'informational',
        pageType: 'blog',
        cluster: 'education',
        heroHeadline: `The Complete Guide to ${businessType}`,
        heroSubheadline: 'Everything you need to know',
        ctaText: 'Read More',
      },
    ];
  }

  private generateSections(page: { heroHeadline: string; heroSubheadline: string; ctaText: string; description: string }) {
    return [
      {
        type: 'hero',
        content: {
          headline: page.heroHeadline,
          subheadline: page.heroSubheadline,
          ctaText: page.ctaText,
          alignment: 'center',
        },
      },
      {
        type: 'problem',
        content: {
          title: 'The Challenge',
          description: page.description,
          painPoints: [
            { title: 'Time Consuming', description: 'Manual processes slow you down' },
            { title: 'Complex Setup', description: 'Too many tools and configurations' },
          ],
        },
      },
      {
        type: 'cta',
        content: {
          title: 'Ready to Get Started?',
          description: 'Join thousands of satisfied customers',
          ctaText: page.ctaText,
        },
      },
    ];
  }
}
