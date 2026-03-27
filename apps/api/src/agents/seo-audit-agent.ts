/**
 * SEO Audit Agent - Analyzes HTML for SEO issues
 *
 * Single responsibility: extract and score SEO data from HTML.
 * Persists results to memory for future optimization loops.
 */

import { BaseAgent, type AgentContext, type AgentResult } from './base-agent';

export class SeoAuditAgent extends BaseAgent {
  readonly name = 'seo_audit';
  readonly description = 'Analyzes website HTML for SEO issues, scores meta tags, headings, and structure';
  readonly capabilities = ['seo_audit', 'analyze_meta_tags', 'check_headings', 'seo_score'];

  canHandle(taskType: string): boolean {
    return this.capabilities.includes(taskType);
  }

  async execute(input: Record<string, unknown>, context: AgentContext): Promise<AgentResult> {
    const html = input.html as string;
    const url = input.url as string;

    if (!html) {
      return { success: false, data: {}, error: 'HTML content is required' };
    }

    const audit = this.runAudit(html, url || '');

    return {
      success: true,
      data: { seoAudit: audit },
      memoryEntries: [
        {
          type: 'customer_insight',
          title: `SEO Audit: ${url || 'unknown'} - Score ${audit.score}/100`,
          content: JSON.stringify(audit),
          metadata: { tags: ['seo', 'audit'], url, score: audit.score },
        },
      ],
    };
  }

  private runAudit(html: string, url: string) {
    const issues: string[] = [];
    const missingElements: string[] = [];
    const performanceHints: string[] = [];
    let score = 100;

    // Title
    const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    const title = titleMatch ? titleMatch[1].trim() : '';
    if (!title) { missingElements.push('Page title is missing'); score -= 15; }
    else if (title.length > 60) { issues.push(`Title too long (${title.length} chars, max 60)`); score -= 5; }

    // Meta description
    const descMatch = html.match(/<meta\s+name=["']description["']\s+content=["']([\s\S]*?)["']/i)
      || html.match(/<meta\s+content=["']([\s\S]*?)["']\s+name=["']description["']/i);
    const description = descMatch ? descMatch[1].trim() : '';
    if (!description) { missingElements.push('Meta description is missing'); score -= 15; }
    else if (description.length > 160) { issues.push(`Meta description too long (${description.length} chars, max 160)`); score -= 5; }

    // OG tags
    const hasOgTitle = /<meta\s+property=["']og:title["']/i.test(html);
    const hasOgDesc = /<meta\s+property=["']og:description["']/i.test(html);
    const hasOgImage = /<meta\s+property=["']og:image["']/i.test(html);
    if (!hasOgTitle || !hasOgDesc) { missingElements.push('Open Graph tags incomplete'); score -= 10; }
    if (!hasOgImage) { missingElements.push('OG image missing'); score -= 5; }

    // Headings
    const h1Count = (html.match(/<h1[^>]*>/gi) || []).length;
    const h2Count = (html.match(/<h2[^>]*>/gi) || []).length;
    if (h1Count === 0) { missingElements.push('No H1 heading found'); score -= 15; }
    else if (h1Count > 1) { issues.push(`Multiple H1 headings (${h1Count}), should have 1`); score -= 5; }

    // Viewport
    if (!/<meta\s+name=["']viewport["']/i.test(html)) {
      missingElements.push('Viewport meta tag missing'); score -= 10;
    }

    // Canonical
    if (!/<link\s+rel=["']canonical["']/i.test(html)) {
      missingElements.push('Canonical URL not set'); score -= 5;
    }

    // Noindex check
    const robotsMatch = html.match(/<meta\s+name=["']robots["']\s+content=["']([\s\S]*?)["']/i);
    if (robotsMatch && robotsMatch[1].includes('noindex')) {
      issues.push('Page is set to noindex'); score -= 20;
    }

    // Structured data
    if (!html.includes('application/ld+json')) {
      performanceHints.push('Add structured data (JSON-LD) for rich results');
    }

    // Images without alt
    const imgTags = html.match(/<img[^>]*>/gi) || [];
    const noAlt = imgTags.filter((img) => !img.includes('alt='));
    if (noAlt.length > 0) {
      performanceHints.push(`${noAlt.length} images missing alt text`);
      score -= Math.min(noAlt.length * 2, 10);
    }

    return {
      score: Math.max(0, score),
      metaTags: { title, description, hasOgTags: hasOgTitle && hasOgDesc },
      headings: { h1Count, h2Count, issues },
      missingElements,
      performanceHints,
    };
  }
}
