/**
 * Website Analyzer Service
 *
 * Comprehensive website analysis for the FTUX onboarding flow.
 * Crawls a website and extracts business info, SEO audit, competitors,
 * social profiles, and keyword opportunities.
 */

import { llmGenerate, extractJSON } from '../lib/llm';
import { buildContentLanguageInstruction, contentLanguageName } from '../lib/language';

// ============================================================================
// TYPES
// ============================================================================

export interface WebsiteAnalysisResult {
  businessInfo: {
    companyName: string;
    industry: string;
    model: string;
    audience: string;
    offerings: string[];
    valueProposition: string;
    market: string;
    strategy: string;
  };
  seoAudit: {
    score: number;
    metaTags: { title: string; description: string; hasOgTags: boolean };
    headings: { h1Count: number; h2Count: number; issues: string[] };
    missingElements: string[];
    performanceHints: string[];
  };
  competitors: Array<{ name: string; domain: string; strengths: string[] }>;
  socialProfiles: Array<{ platform: string; url: string; detected: boolean }>;
  keywordOpportunities: Array<{
    keyword: string;
    volume: string;
    competition: 'low' | 'medium' | 'high';
    relevance: number;
  }>;
  masterPlan: {
    seoGrowthPlan: PlanBlock;
    contentPlan: PlanBlock;
    socialMediaPlan: PlanBlock;
  };
}

interface PlanBlock {
  title: string;
  description: string;
  items: Array<{
    action: string;
    timeline: string;
    expectedImpact: string;
    priority: 'high' | 'medium' | 'low';
  }>;
}

// ============================================================================
// SERVICE
// ============================================================================

export class WebsiteAnalyzerService {
  /**
   * Full website analysis pipeline
   */
  async analyze(url: string, language?: string): Promise<WebsiteAnalysisResult> {
    // Normalize URL
    const normalizedUrl = this.normalizeUrl(url);

    // Step 1: Crawl website
    const html = await this.crawlWebsite(normalizedUrl);

    // Step 2: Extract SEO data from HTML
    const seoData = this.extractSEOData(html, normalizedUrl);

    // Step 3: Detect social profiles
    const socialProfiles = this.detectSocialProfiles(html);

    // Step 4: AI analysis for business info, competitors, keywords, and master plan
    const aiAnalysis = await this.analyzeWithAI(html, normalizedUrl, seoData, socialProfiles, language);

    return {
      businessInfo: aiAnalysis.businessInfo,
      seoAudit: {
        ...seoData,
        ...aiAnalysis.seoAuditExtras,
      },
      competitors: aiAnalysis.competitors,
      socialProfiles,
      keywordOpportunities: aiAnalysis.keywordOpportunities,
      masterPlan: aiAnalysis.masterPlan,
    };
  }

  /**
   * Generate master plan from text prompt (no website)
   */
  async generateMasterPlanFromPrompt(
    prompt: string,
    detectedInfo: any,
    businessContext = '',
    language?: string,
  ): Promise<{
    masterPlan: {
      seoGrowthPlan: PlanBlock;
      contentPlan: PlanBlock;
      socialMediaPlan: PlanBlock;
    };
    usedFallback?: boolean;
  }> {
    try {
      const languageInstruction = buildContentLanguageInstruction(language);
      const outputLanguage = contentLanguageName(language);
      const { text } = await llmGenerate([{
        role: 'system',
        content: `You are a growth marketing strategist who creates SPECIFIC, actionable plans. Every action item must reference the actual business, its offerings, and target audience. Never use generic advice like "create content" or "improve SEO" — always specify WHAT content, WHICH keywords, and HOW to improve.`,
      }, {
        role: 'user',
        content: `Create a marketing master plan for this business:

BUSINESS: ${prompt}
MARKET: ${detectedInfo?.market || 'Analyze from business description'}
MODEL: ${detectedInfo?.model || 'Analyze from business description'}
${languageInstruction}
COMPANY CONTEXT:
${businessContext || 'No additional context available'}

RULES:
- Every action must be specific to THIS business (e.g., "Write article: '10 Best Coding Activities for Kids Ages 6-10'" NOT "Write blog posts")
- Include real keyword suggestions based on the business niche
- Timeline must be realistic for a small team (1-2 people)
- Expected impact must be measurable (e.g., "Target 500 monthly organic visits" NOT "increase traffic")
- Prioritize quick wins in Week 1 (things that can show results in days)
- Include specific content titles, keyword targets, and platform choices
- Write all user-facing plan text in ${outputLanguage}

LANGUAGE RULES:
- Write all masterPlan values in ${outputLanguage}: plan titles, descriptions, actions, timelines, and expected impacts.
- Keep company names, brand names, product/service/course names, URLs, exact source titles, JSON keys, and enum values unchanged.
- If the output language is not English, do not return English prose in user-facing plan text.

Return ONLY valid JSON:
{
  "seoGrowthPlan": {
    "title": "SEO Growth Plan",
    "description": "Strategy summary referencing specific keywords and pages",
    "items": [{"action": "Specific action with exact deliverable", "timeline": "Week X", "expectedImpact": "Measurable outcome", "priority": "high|medium|low", "keyword": "target keyword if applicable"}]
  },
  "contentPlan": {
    "title": "Content Plan",
    "description": "Content strategy with specific topics and formats",
    "items": [{"action": "Specific content piece with title and format", "timeline": "Week X", "expectedImpact": "Measurable outcome", "priority": "high|medium|low"}]
  },
  "socialMediaPlan": {
    "title": "Social Media Plan",
    "description": "Platform-specific strategy with posting cadence",
    "items": [{"action": "Platform-specific action with content type", "timeline": "Week X", "expectedImpact": "Measurable outcome", "priority": "high|medium|low", "platform": "specific platform"}]
  }
}

Generate 4-5 items per section. Be CONCRETE — I should be able to execute each item immediately.`,
      }], { maxTokens: 2000 });

      const parsed = extractJSON(text);
      if (parsed) {
        return { masterPlan: parsed };
      }
    } catch (error) {
      console.error('Failed to generate master plan from prompt:', error);
    }

    return { masterPlan: this.getDefaultMasterPlan(), usedFallback: true };
  }

  // ==========================================================================
  // PRIVATE METHODS
  // ==========================================================================

  private normalizeUrl(url: string): string {
    let normalized = url.trim();
    if (!normalized.startsWith('http://') && !normalized.startsWith('https://')) {
      normalized = 'https://' + normalized;
    }
    return normalized;
  }

  private async crawlWebsite(url: string): Promise<string> {
    try {
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; 1PersonBot/1.0; +https://1person.ai)',
          Accept: 'text/html,application/xhtml+xml',
        },
        signal: AbortSignal.timeout(15000),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      return await response.text();
    } catch (error) {
      console.error(`Failed to crawl ${url}:`, error);
      throw new Error(`Could not access website: ${url}`);
    }
  }

  private extractSEOData(
    html: string,
    url: string
  ): WebsiteAnalysisResult['seoAudit'] {
    const issues: string[] = [];
    const missingElements: string[] = [];
    const performanceHints: string[] = [];
    let score = 100;

    // Extract title
    const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    const title = titleMatch?.[1]?.trim() ?? '';
    if (!title) {
      missingElements.push('Page title is missing');
      score -= 15;
    } else if (title.length > 60) {
      issues.push(`Title too long (${title.length} chars, recommended < 60)`);
      score -= 5;
    }

    // Extract meta description
    const descMatch = html.match(/<meta\s+name=["']description["']\s+content=["']([\s\S]*?)["']/i)
      || html.match(/<meta\s+content=["']([\s\S]*?)["']\s+name=["']description["']/i);
    const description = descMatch?.[1]?.trim() ?? '';
    if (!description) {
      missingElements.push('Meta description is missing');
      score -= 15;
    } else if (description.length > 160) {
      issues.push(`Meta description too long (${description.length} chars, recommended < 160)`);
      score -= 5;
    }

    // Check OG tags
    const hasOgTitle = /<meta\s+property=["']og:title["']/i.test(html);
    const hasOgDesc = /<meta\s+property=["']og:description["']/i.test(html);
    const hasOgImage = /<meta\s+property=["']og:image["']/i.test(html);
    const hasOgTags = hasOgTitle && hasOgDesc;
    if (!hasOgTags) {
      missingElements.push('Open Graph tags incomplete');
      score -= 10;
    }
    if (!hasOgImage) {
      missingElements.push('OG image missing (affects social sharing)');
      score -= 5;
    }

    // Count headings
    const h1Matches = html.match(/<h1[^>]*>/gi) || [];
    const h2Matches = html.match(/<h2[^>]*>/gi) || [];
    const h1Count = h1Matches.length;
    const h2Count = h2Matches.length;

    if (h1Count === 0) {
      missingElements.push('No H1 heading found');
      score -= 15;
    } else if (h1Count > 1) {
      issues.push(`Multiple H1 headings found (${h1Count}), should have exactly 1`);
      score -= 5;
    }

    // Check viewport meta
    if (!/<meta\s+name=["']viewport["']/i.test(html)) {
      missingElements.push('Viewport meta tag missing (mobile responsiveness)');
      score -= 10;
    }

    // Check canonical
    if (!/<link\s+rel=["']canonical["']/i.test(html)) {
      missingElements.push('Canonical URL not set');
      score -= 5;
    }

    // Check robots
    const robotsBlock = html.match(/<meta\s+name=["']robots["']\s+content=["']([\s\S]*?)["']/i);
    if (robotsBlock?.[1]?.includes('noindex')) {
      issues.push('Page is set to noindex - search engines will not index it');
      score -= 20;
    }

    // Check structured data
    if (!html.includes('application/ld+json')) {
      performanceHints.push('Add structured data (JSON-LD) for rich search results');
    }

    // Check alt attributes on images
    const imgTags = html.match(/<img[^>]*>/gi) || [];
    const imgsWithoutAlt = imgTags.filter((img) => !img.includes('alt='));
    if (imgsWithoutAlt.length > 0) {
      performanceHints.push(`${imgsWithoutAlt.length} images missing alt text`);
      score -= Math.min(imgsWithoutAlt.length * 2, 10);
    }

    // Check internal links
    const internalLinks = html.match(/<a[^>]*href=["']\/[^"']*["']/gi) || [];
    if (internalLinks.length < 3) {
      performanceHints.push('Add more internal links for better SEO');
    }

    return {
      score: Math.max(0, score),
      metaTags: { title, description, hasOgTags },
      headings: { h1Count, h2Count, issues },
      missingElements,
      performanceHints,
    };
  }

  private detectSocialProfiles(html: string): WebsiteAnalysisResult['socialProfiles'] {
    const platforms = [
      { platform: 'Facebook', pattern: /href=["'](https?:\/\/(www\.)?facebook\.com\/[^"'\s]+)["']/gi },
      { platform: 'Instagram', pattern: /href=["'](https?:\/\/(www\.)?instagram\.com\/[^"'\s]+)["']/gi },
      { platform: 'Twitter', pattern: /href=["'](https?:\/\/(www\.)?(twitter|x)\.com\/[^"'\s]+)["']/gi },
      { platform: 'LinkedIn', pattern: /href=["'](https?:\/\/(www\.)?linkedin\.com\/(company|in)\/[^"'\s]+)["']/gi },
      { platform: 'YouTube', pattern: /href=["'](https?:\/\/(www\.)?youtube\.com\/(c|channel|@)[^"'\s]+)["']/gi },
      { platform: 'TikTok', pattern: /href=["'](https?:\/\/(www\.)?tiktok\.com\/@[^"'\s]+)["']/gi },
    ];

    return platforms.map(({ platform, pattern }) => {
      const match = pattern.exec(html);
      return {
        platform,
        url: match?.[1] ?? '',
        detected: !!match,
      };
    });
  }

  private async analyzeWithAI(
    html: string,
    url: string,
    seoData: WebsiteAnalysisResult['seoAudit'],
    socialProfiles: WebsiteAnalysisResult['socialProfiles'],
    language?: string
  ) {
    // Truncate HTML for token limits
    const truncatedHtml = html.substring(0, 20000);
    const detectedSocials = socialProfiles
      .filter((s) => s.detected)
      .map((s) => s.platform)
      .join(', ');
    const languageInstruction = buildContentLanguageInstruction(language);
    const outputLanguage = contentLanguageName(language);

    try {
      const { text } = await llmGenerate([{
        role: 'system',
        content: `You are a senior marketing consultant performing a website audit. Extract PRECISE business information from the actual HTML content — use exact text from the website, not assumptions. For the master plan, every action must reference specific pages, keywords, or issues found in the audit.`,
      }, {
        role: 'user',
        content: `Perform a complete website audit and create a marketing strategy.

URL: ${url}
CURRENT SEO SCORE: ${seoData.score}/100
DETECTED SOCIAL PROFILES: ${detectedSocials || 'None detected'}
SEO ISSUES FOUND: ${seoData.missingElements.join('; ') || 'None'}
HEADINGS: H1=${seoData.headings.h1Count}, H2=${seoData.headings.h2Count}
${languageInstruction}

WEBSITE HTML (analyze this carefully):
${truncatedHtml}

EXTRACTION RULES:
- companyName: Extract the EXACT company/brand name from the website (title, logo, footer)
- industry: Be SPECIFIC (e.g., "EdTech - Coding Education for Children" not just "Education")
- offerings: List SPECIFIC products/services mentioned on the page with exact names
- audience: Identify from pricing pages, testimonials, copy language — be specific about demographics
- competitors: Name REAL competitors in this specific niche (not generic industry leaders)
- keywords: Suggest keywords based on the ACTUAL content and services found on the site

LANGUAGE RULES:
- Write descriptive businessInfo and masterPlan values in ${outputLanguage}: industry, model, audience, valueProposition, market, strategy, plan titles, descriptions, actions, timelines, and expected impacts.
- Keep company names, brand names, product/service/course names, URLs, exact source titles, JSON keys, and enum values unchanged.
- If the output language is not English, do not return English prose in businessInfo.market, businessInfo.model, businessInfo.audience, or businessInfo.strategy.

Return ONLY valid JSON:
{
  "businessInfo": {
    "companyName": "Exact name from website",
    "industry": "Specific niche (e.g., 'EdTech - Kids Coding Classes')",
    "model": "Revenue model (e.g., 'B2C - Class subscriptions + workshops')",
    "audience": "Specific audience (e.g., 'Parents of children ages 6-15 in HCMC')",
    "offerings": ["Exact Service 1 from site", "Exact Service 2"],
    "valueProposition": "One sentence from their actual messaging",
    "market": "Specific market (e.g., 'Children's STEM education in Vietnam')",
    "strategy": "Recommended growth strategy based on their current positioning"
  },
  "competitors": [{"name": "Real Competitor", "domain": "domain.com", "strengths": ["Specific strength"]}],
  "keywordOpportunities": [{"keyword": "specific long-tail keyword", "volume": "high|medium|low", "competition": "low|medium|high", "relevance": 9}],
  "seoIssues": ["Specific issue found in the audit"],
  "masterPlan": {
    "seoGrowthPlan": {"title": "SEO Growth Plan", "description": "Strategy based on audit findings", "items": [{"action": "Specific fix/creation referencing actual page or keyword", "timeline": "Week 1", "expectedImpact": "Measurable outcome", "priority": "high"}]},
    "contentPlan": {"title": "Content Plan", "description": "Content strategy based on keyword gaps", "items": [{"action": "Specific content with title targeting specific keyword", "timeline": "Week 1", "expectedImpact": "Measurable outcome", "priority": "high"}]},
    "socialMediaPlan": {"title": "Social Media Plan", "description": "Platform strategy based on audience", "items": [{"action": "Platform-specific tactic for their audience", "timeline": "Week 1", "expectedImpact": "Measurable outcome", "priority": "medium"}]}
  }
}

Generate 4-5 items per plan section. EVERY item must reference something specific from the website audit.`,
      }], { maxTokens: 3000 });

      const parsed = extractJSON(text);

      if (parsed) {
        return {
          businessInfo: {
            companyName: parsed.businessInfo?.companyName || 'Unknown',
            industry: parsed.businessInfo?.industry || 'General',
            model: parsed.businessInfo?.model || 'Unknown',
            audience: parsed.businessInfo?.audience || 'General audience',
            offerings: parsed.businessInfo?.offerings || [],
            valueProposition: parsed.businessInfo?.valueProposition || '',
            market: parsed.businessInfo?.market || 'General',
            strategy: parsed.businessInfo?.strategy || '',
          },
          competitors: (parsed.competitors || []).slice(0, 5),
          keywordOpportunities: (parsed.keywordOpportunities || []).slice(0, 10),
          seoAuditExtras: {
            performanceHints: [
              ...(seoData.performanceHints || []),
              ...(parsed.seoIssues || []),
            ],
          },
          masterPlan: parsed.masterPlan || this.getDefaultMasterPlan(),
        };
      }
    } catch (error) {
      console.error('AI website analysis failed:', error);
    }

    // Fallback
    const fallbackCompanyName = new URL(url).hostname.replace('www.', '').split('.')[0] || 'Business';
    return {
      businessInfo: {
        companyName: fallbackCompanyName,
        industry: 'General',
        model: 'Unknown',
        audience: 'General audience',
        offerings: [],
        valueProposition: '',
        market: 'General',
        strategy: 'Content marketing and SEO',
      },
      competitors: [],
      keywordOpportunities: [],
      seoAuditExtras: {},
      masterPlan: this.getDefaultMasterPlan(),
    };
  }

  private getDefaultMasterPlan() {
    return {
      seoGrowthPlan: {
        title: 'SEO Growth Plan',
        description: 'Improve organic search visibility',
        items: [
          { action: 'Fix all missing meta tags and descriptions', timeline: 'Week 1', expectedImpact: 'Better search indexing', priority: 'high' as const },
          { action: 'Create 5 SEO-optimized landing pages for key services', timeline: 'Week 1-2', expectedImpact: 'Target high-intent keywords', priority: 'high' as const },
          { action: 'Add internal linking structure between pages', timeline: 'Week 2', expectedImpact: 'Improved page authority distribution', priority: 'medium' as const },
          { action: 'Submit sitemap to Google Search Console', timeline: 'Week 1', expectedImpact: 'Faster indexing', priority: 'high' as const },
        ],
      },
      contentPlan: {
        title: 'Content Plan',
        description: 'Create content that attracts and converts',
        items: [
          { action: 'Write 3 pillar articles for main topics', timeline: 'Week 1-2', expectedImpact: 'Establish authority', priority: 'high' as const },
          { action: 'Create a content calendar with 2 posts/week', timeline: 'Week 1', expectedImpact: 'Consistent publishing cadence', priority: 'medium' as const },
          { action: 'Develop case studies and social proof content', timeline: 'Week 2-3', expectedImpact: 'Build trust and convert leads', priority: 'medium' as const },
          { action: 'Optimize existing pages with better copy', timeline: 'Week 2', expectedImpact: 'Higher conversion rates', priority: 'high' as const },
        ],
      },
      socialMediaPlan: {
        title: 'Social Media Plan',
        description: 'Build brand awareness on social platforms',
        items: [
          { action: 'Set up and optimize all social media profiles', timeline: 'Week 1', expectedImpact: 'Professional brand presence', priority: 'high' as const },
          { action: 'Post 3x/week with educational and promotional mix', timeline: 'Ongoing', expectedImpact: 'Grow followers and engagement', priority: 'medium' as const },
          { action: 'Share blog content with platform-native formatting', timeline: 'Ongoing', expectedImpact: 'Drive traffic from social', priority: 'medium' as const },
          { action: 'Engage with industry communities and groups', timeline: 'Ongoing', expectedImpact: 'Network and brand visibility', priority: 'low' as const },
        ],
      },
    };
  }
}

export const websiteAnalyzerService = new WebsiteAnalyzerService();
