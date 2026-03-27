/**
 * SEO Content Factory Engine
 *
 * Generates structured SEO content from keywords:
 * - Keyword → Content Type mapping
 * - SEO-optimized content generation
 * - Internal linking
 * - FAQ generation
 *
 * Position in Architecture:
 * Content Planning Engine → SEO Content Factory → Landing Page SEO Deployment
 */

import { db } from '../../lib/db';
import { eq, and, desc } from 'drizzle-orm';
import { companies, brandIdentities, landingPages } from '@1person/core/db';
import { marketIntelligenceEngine } from './market-intelligence-engine';
import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic();

// Content Types
export type SEOContentType = 'landing_page' | 'blog_post' | 'comparison' | 'listicle';
export type SearchIntent = 'informational' | 'commercial' | 'transactional' | 'navigational';

// SEO Content Interfaces
export interface SEOKeyword {
  keyword: string;
  intent: SearchIntent;
  searchVolume?: number;
  difficulty?: number;
  relatedKeywords?: string[];
}

export interface SEOContentInput {
  keyword: string;
  intent: SearchIntent;
  audience: string;
  competitors?: string[];
  brandVoice?: string;
}

export interface SEOContentOutput {
  id: string;
  keyword: string;
  intent: SearchIntent;
  contentType: SEOContentType;

  // SEO Metadata
  title: string;
  metaDescription: string;
  slug: string;

  // Content Structure
  headings: string[];
  content: string;
  wordCount: number;

  // FAQ Section
  faq: Array<{
    question: string;
    answer: string;
  }>;

  // Internal Linking
  internalLinks: string[];
  suggestedLinks: Array<{
    text: string;
    targetKeyword: string;
  }>;

  // Schema Markup
  schemaMarkup: Record<string, unknown>;

  // Metadata
  generatedAt: Date;
  status: 'draft' | 'ready' | 'published';
}

export interface SEOFactoryResult {
  companyId: string;
  processedKeywords: number;
  generatedContent: SEOContentOutput[];
  failedKeywords: string[];
  totalDuration: number;
}

// Content Templates
const CONTENT_TEMPLATES = {
  landing_page: {
    structure: [
      'H1: Primary Keyword',
      'Intro (pain + promise)',
      'H2: The Problem',
      'H2: Our Solution',
      'H2: Key Benefits',
      'H2: How It Works',
      'H2: Use Cases',
      'H2: Frequently Asked Questions',
      'CTA Section',
    ],
    minWords: 1500,
    maxWords: 2500,
  },
  blog_post: {
    structure: [
      'H1: Keyword-rich Title',
      'Intro paragraph',
      'H2: Direct Answer',
      'H2: Detailed Explanation',
      'H2: Step-by-Step Guide',
      'H2: Examples',
      'H2: Common Mistakes to Avoid',
      'H2: FAQ',
      'Conclusion + CTA',
    ],
    minWords: 1200,
    maxWords: 2000,
  },
  comparison: {
    structure: [
      'H1: [Product A] vs [Product B]',
      'Intro: Why this comparison matters',
      'H2: Quick Comparison Table',
      'H2: [Product A] Overview',
      'H2: [Product B] Overview',
      'H2: Feature-by-Feature Comparison',
      'H2: Pricing Comparison',
      'H2: Who Should Choose What',
      'H2: FAQ',
      'Conclusion',
    ],
    minWords: 1500,
    maxWords: 2500,
  },
  listicle: {
    structure: [
      'H1: [Number] Best [Topic]',
      'Intro',
      'H2: 1. [Item]',
      'H2: 2. [Item]',
      'H2: 3. [Item]',
      '... more items',
      'H2: How to Choose',
      'H2: FAQ',
      'Conclusion',
    ],
    minWords: 1000,
    maxWords: 2000,
  },
};

// Intent Keywords for detection
const INTENT_PATTERNS = {
  transactional: ['buy', 'price', 'cost', 'purchase', 'order', 'discount', 'deal', 'cheap', 'affordable', 'hire', 'get', 'signup', 'subscribe'],
  commercial: ['best', 'top', 'review', 'compare', 'vs', 'versus', 'alternative', 'comparison', 'which', 'recommend'],
  informational: ['how', 'what', 'why', 'when', 'where', 'guide', 'tutorial', 'learn', 'tips', 'examples', 'definition'],
  navigational: ['login', 'sign in', 'website', 'official', 'homepage'],
};

/**
 * SEO Content Factory Class
 */
export class SEOContentFactory {
  /**
   * Detect search intent from keyword
   */
  detectIntent(keyword: string): SearchIntent {
    const lowerKeyword = keyword.toLowerCase();

    for (const [intent, patterns] of Object.entries(INTENT_PATTERNS)) {
      if (patterns.some(pattern => lowerKeyword.includes(pattern))) {
        return intent as SearchIntent;
      }
    }

    // Default to informational
    return 'informational';
  }

  /**
   * Map keyword + intent to content type
   */
  mapKeywordToContentType(keyword: string, intent: SearchIntent): SEOContentType {
    const lowerKeyword = keyword.toLowerCase();

    // Check for comparison keywords
    if (lowerKeyword.includes(' vs ') || lowerKeyword.includes(' versus ') || lowerKeyword.includes('compare')) {
      return 'comparison';
    }

    // Check for listicle keywords
    if (/\d+\s+(best|top|ways|tips|ideas|examples)/.test(lowerKeyword) ||
        /^(best|top)\s+\d+/.test(lowerKeyword)) {
      return 'listicle';
    }

    // Map by intent
    switch (intent) {
      case 'transactional':
        return 'landing_page';
      case 'commercial':
        return 'comparison';
      case 'informational':
        return 'blog_post';
      default:
        return 'blog_post';
    }
  }

  /**
   * Generate SEO-optimized content for a keyword
   */
  async generateSEOContent(
    companyId: string,
    input: SEOContentInput
  ): Promise<SEOContentOutput> {
    console.log(`[SEOFactory] Generating content for keyword: ${input.keyword}`);

    // Get company context
    const company = await db.query.companies.findFirst({
      where: eq(companies.id, companyId),
    });

    const brand = await db.query.brandIdentities.findFirst({
      where: eq(brandIdentities.companyId, companyId),
    });

    // Determine content type
    const contentType = this.mapKeywordToContentType(input.keyword, input.intent);
    const template = CONTENT_TEMPLATES[contentType];

    // Generate slug
    const slug = this.generateSlug(input.keyword);

    // Get existing pages for internal linking
    const existingPages = await db.query.landingPages.findMany({
      where: and(
        eq(landingPages.companyId, companyId),
        eq(landingPages.status, 'published')
      ),
      limit: 20,
    });

    // Generate content using AI
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4096,
      messages: [
        {
          role: 'user',
          content: `You are an expert SEO content writer. Generate comprehensive, SEO-optimized content for the following:

COMPANY: ${company?.name || 'Company'}
INDUSTRY: ${company?.industry || 'Technology'}
BRAND VOICE: ${input.brandVoice || brand?.voiceTone || 'Professional and helpful'}

TARGET KEYWORD: ${input.keyword}
SEARCH INTENT: ${input.intent}
CONTENT TYPE: ${contentType}
TARGET AUDIENCE: ${input.audience}

COMPETITORS TO OUTRANK: ${input.competitors?.join(', ') || 'N/A'}

CONTENT STRUCTURE TO FOLLOW:
${template.structure.join('\n')}

REQUIREMENTS:
1. Write ${template.minWords}-${template.maxWords} words
2. Include the target keyword naturally in title, headings, and content
3. Write in a ${input.brandVoice || 'professional'} tone
4. Include actionable advice and specific examples
5. Optimize for featured snippets where applicable
6. Include a compelling meta description (150-160 characters)

EXISTING PAGES FOR INTERNAL LINKING:
${existingPages.map(p => `- ${p.title} (/${p.slug})`).join('\n') || 'None yet'}

Return ONLY valid JSON in this format:
{
  "title": "SEO-optimized title (60-70 chars)",
  "metaDescription": "Compelling meta description (150-160 chars)",
  "headings": ["H1: ...", "H2: ...", "H2: ..."],
  "content": "Full markdown content with headings and paragraphs",
  "faq": [
    {"question": "...", "answer": "..."},
    {"question": "...", "answer": "..."}
  ],
  "internalLinks": ["slug1", "slug2"],
  "suggestedLinks": [
    {"text": "anchor text", "targetKeyword": "related keyword"}
  ]
}`,
        },
      ],
    });

    // Parse AI response
    const textContent = response.content[0];
    if (textContent.type !== 'text') {
      throw new Error('Unexpected response type');
    }

    let parsed: {
      title: string;
      metaDescription: string;
      headings: string[];
      content: string;
      faq: Array<{ question: string; answer: string }>;
      internalLinks: string[];
      suggestedLinks: Array<{ text: string; targetKeyword: string }>;
    };

    try {
      const jsonMatch = textContent.text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error('No JSON found');
      parsed = JSON.parse(jsonMatch[0]);
    } catch {
      // Fallback structure
      parsed = {
        title: `${input.keyword} - Complete Guide`,
        metaDescription: `Learn everything about ${input.keyword}. Comprehensive guide with tips, examples, and best practices.`,
        headings: template.structure,
        content: textContent.text,
        faq: [],
        internalLinks: [],
        suggestedLinks: [],
      };
    }

    // Calculate word count
    const wordCount = parsed.content.split(/\s+/).length;

    // Generate schema markup
    const schemaMarkup = this.generateSchemaMarkup(
      contentType,
      parsed.title,
      parsed.metaDescription,
      parsed.faq,
      company?.name || 'Company'
    );

    const output: SEOContentOutput = {
      id: `seo-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      keyword: input.keyword,
      intent: input.intent,
      contentType,
      title: parsed.title,
      metaDescription: parsed.metaDescription,
      slug,
      headings: parsed.headings,
      content: parsed.content,
      wordCount,
      faq: parsed.faq,
      internalLinks: parsed.internalLinks,
      suggestedLinks: parsed.suggestedLinks,
      schemaMarkup,
      generatedAt: new Date(),
      status: 'draft',
    };

    console.log(`[SEOFactory] Generated ${wordCount} words for "${input.keyword}"`);

    return output;
  }

  /**
   * Generate URL slug from keyword
   */
  private generateSlug(keyword: string): string {
    return keyword
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .trim();
  }

  /**
   * Generate JSON-LD schema markup
   */
  private generateSchemaMarkup(
    contentType: SEOContentType,
    title: string,
    description: string,
    faq: Array<{ question: string; answer: string }>,
    companyName: string
  ): Record<string, unknown> {
    const baseSchema = {
      '@context': 'https://schema.org',
      '@type': contentType === 'blog_post' ? 'BlogPosting' : 'WebPage',
      name: title,
      description,
      publisher: {
        '@type': 'Organization',
        name: companyName,
      },
      datePublished: new Date().toISOString(),
      dateModified: new Date().toISOString(),
    };

    // Add FAQ schema if applicable
    if (faq.length > 0) {
      return {
        '@context': 'https://schema.org',
        '@graph': [
          baseSchema,
          {
            '@type': 'FAQPage',
            mainEntity: faq.map(item => ({
              '@type': 'Question',
              name: item.question,
              acceptedAnswer: {
                '@type': 'Answer',
                text: item.answer,
              },
            })),
          },
        ],
      };
    }

    return baseSchema;
  }

  /**
   * Run SEO Content Factory for all keywords
   */
  async runFactory(
    companyId: string,
    options?: {
      keywords?: SEOKeyword[];
      maxKeywords?: number;
      contentTypes?: SEOContentType[];
    }
  ): Promise<SEOFactoryResult> {
    console.log(`[SEOFactory] Starting factory for company ${companyId}`);
    const startTime = Date.now();

    // Get keywords from Market Intelligence if not provided
    let keywords = options?.keywords || [];

    if (keywords.length === 0) {
      const discoveredKeywords = await marketIntelligenceEngine.discoverKeywords(companyId);
      keywords = discoveredKeywords.map(kw => ({
        keyword: kw.keyword,
        intent: this.detectIntent(kw.keyword),
        searchVolume: kw.searchVolume,
        difficulty: kw.difficulty,
      }));
    }

    // Limit keywords
    const maxKeywords = options?.maxKeywords || 10;
    const targetKeywords = keywords.slice(0, maxKeywords);

    // Get company info for audience
    const company = await db.query.companies.findFirst({
      where: eq(companies.id, companyId),
    });

    const generatedContent: SEOContentOutput[] = [];
    const failedKeywords: string[] = [];

    // Process each keyword
    for (const kw of targetKeywords) {
      try {
        const contentType = this.mapKeywordToContentType(kw.keyword, kw.intent);

        // Skip if content type filter specified and doesn't match
        if (options?.contentTypes && !options.contentTypes.includes(contentType)) {
          continue;
        }

        const content = await this.generateSEOContent(companyId, {
          keyword: kw.keyword,
          intent: kw.intent,
          audience: company?.description || 'Business professionals',
        });

        generatedContent.push(content);
      } catch (error) {
        console.error(`[SEOFactory] Failed to generate content for "${kw.keyword}":`, error);
        failedKeywords.push(kw.keyword);
      }
    }

    const totalDuration = Date.now() - startTime;

    console.log(`[SEOFactory] Completed: ${generatedContent.length} content pieces in ${totalDuration}ms`);

    return {
      companyId,
      processedKeywords: targetKeywords.length,
      generatedContent,
      failedKeywords,
      totalDuration,
    };
  }

  /**
   * Build internal links for existing content
   */
  async buildInternalLinks(
    companyId: string
  ): Promise<Array<{ sourceSlug: string; targetSlug: string; anchorText: string }>> {
    console.log(`[SEOFactory] Building internal links for ${companyId}`);

    // Get all published pages
    const pages = await db.query.landingPages.findMany({
      where: and(
        eq(landingPages.companyId, companyId),
        eq(landingPages.status, 'published')
      ),
    });

    const links: Array<{ sourceSlug: string; targetSlug: string; anchorText: string }> = [];

    // Simple internal linking: link related pages
    for (let i = 0; i < pages.length; i++) {
      const sourcePage = pages[i];
      if (!sourcePage) continue;

      // Find related pages (simple: different pages)
      const relatedPages = pages.filter((p, idx) => idx !== i).slice(0, 3);

      for (const targetPage of relatedPages) {
        links.push({
          sourceSlug: sourcePage.slug,
          targetSlug: targetPage.slug,
          anchorText: targetPage.title || targetPage.slug,
        });
      }
    }

    return links;
  }

  /**
   * Get content suggestions for a topic cluster
   */
  async suggestContentCluster(
    companyId: string,
    pillarKeyword: string
  ): Promise<{
    pillar: { keyword: string; contentType: SEOContentType };
    clusters: Array<{ keyword: string; contentType: SEOContentType; relationship: string }>;
  }> {
    console.log(`[SEOFactory] Suggesting cluster for: ${pillarKeyword}`);

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1024,
      messages: [
        {
          role: 'user',
          content: `Suggest a content cluster for the pillar keyword: "${pillarKeyword}"

Return JSON with this structure:
{
  "pillar": {
    "keyword": "main keyword",
    "contentType": "landing_page"
  },
  "clusters": [
    {"keyword": "related keyword 1", "contentType": "blog_post", "relationship": "how-to guide"},
    {"keyword": "related keyword 2", "contentType": "comparison", "relationship": "product comparison"},
    {"keyword": "related keyword 3", "contentType": "listicle", "relationship": "best practices"}
  ]
}

Include 5-8 cluster keywords that support the pillar.`,
        },
      ],
    });

    const textContent = response.content[0];
    if (textContent.type !== 'text') {
      throw new Error('Unexpected response type');
    }

    try {
      const jsonMatch = textContent.text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error('No JSON found');
      return JSON.parse(jsonMatch[0]);
    } catch {
      return {
        pillar: { keyword: pillarKeyword, contentType: 'landing_page' },
        clusters: [],
      };
    }
  }
}

export const seoContentFactory = new SEOContentFactory();
