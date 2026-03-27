/**
 * Smart Crawler Agent - Extracts structured data from HTML
 *
 * NOT just raw HTML fetch. Extracts:
 * - title, meta_description
 * - h1[], h2[], h3[]
 * - paragraphs (meaningful text blocks)
 * - navigation links
 * - images with alt text
 *
 * Output is structured data ready for ContentExtractionAgent.
 */

import { BaseAgent, type AgentContext, type AgentResult } from './base-agent';

export interface CrawlResult {
  url: string;
  title: string;
  metaDescription: string;
  h1: string[];
  h2: string[];
  h3: string[];
  paragraphs: string[];
  navLinks: Array<{ text: string; href: string }>;
  images: Array<{ alt: string; src: string }>;
  rawTextLength: number;
}

export class CrawlerAgent extends BaseAgent {
  readonly name = 'crawler';
  readonly description = 'Crawls a website and extracts structured content (title, headings, paragraphs, links)';
  readonly capabilities = ['crawl_website', 'fetch_html'];

  canHandle(taskType: string): boolean {
    return this.capabilities.includes(taskType);
  }

  async execute(input: Record<string, unknown>, context: AgentContext): Promise<AgentResult> {
    const url = input.url as string;
    if (!url) {
      return { success: false, data: {}, error: 'URL is required' };
    }

    const normalizedUrl = this.normalizeUrl(url);

    try {
      const response = await fetch(normalizedUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
        },
        signal: AbortSignal.timeout(15000),
        redirect: 'follow',
      });

      if (!response.ok) {
        return { success: false, data: {}, error: `HTTP ${response.status}: ${response.statusText}` };
      }

      const html = await response.text();
      const structured = this.extractStructuredData(html, normalizedUrl);

      return {
        success: true,
        data: {
          ...structured,
          html, // Keep raw HTML for SEO audit agent
        },
        suggestedNextTasks: [
          {
            type: 'extract_content',
            title: `Extract semantic content from ${normalizedUrl}`,
            input: { structuredData: structured, url: normalizedUrl },
            priority: 'high',
          },
          {
            type: 'seo_audit',
            title: `SEO audit for ${normalizedUrl}`,
            input: { html, url: normalizedUrl },
            priority: 'high',
          },
          {
            type: 'detect_social_profiles',
            title: `Detect social profiles`,
            input: { html, url: normalizedUrl },
            priority: 'medium',
          },
        ],
      };
    } catch (error) {
      return {
        success: false,
        data: {},
        error: `Failed to crawl ${normalizedUrl}: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  }

  private extractStructuredData(html: string, url: string): CrawlResult {
    // Remove scripts, styles, comments
    const cleaned = html
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<!--[\s\S]*?-->/g, '')
      .replace(/<noscript[\s\S]*?<\/noscript>/gi, '');

    // Title
    const titleMatch = cleaned.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    const title = titleMatch ? this.cleanText(titleMatch[1]) : '';

    // Meta description
    const descMatch = cleaned.match(/<meta\s+[^>]*name=["']description["'][^>]*content=["']([\s\S]*?)["']/i)
      || cleaned.match(/<meta\s+[^>]*content=["']([\s\S]*?)["'][^>]*name=["']description["']/i);
    const metaDescription = descMatch ? this.cleanText(descMatch[1]) : '';

    // Headings
    const h1 = this.extractAllMatches(cleaned, /<h1[^>]*>([\s\S]*?)<\/h1>/gi);
    const h2 = this.extractAllMatches(cleaned, /<h2[^>]*>([\s\S]*?)<\/h2>/gi);
    const h3 = this.extractAllMatches(cleaned, /<h3[^>]*>([\s\S]*?)<\/h3>/gi);

    // Paragraphs - clean and filter
    const allParagraphs = this.extractAllMatches(cleaned, /<p[^>]*>([\s\S]*?)<\/p>/gi)
      .map((p) => p.replace(/\s+/g, ' ').trim()) // Collapse whitespace
      .filter((p) => {
        if (p.length < 20) return false;
        // Filter out navigation/form junk
        if (p.split('\n').length > 5 && p.length < 100) return false;
        // Filter out lines that are mostly links/buttons
        const wordCount = p.split(/\s+/).length;
        if (wordCount < 4) return false;
        return true;
      });

    // Also extract text from <li> with meaningful content
    const listItems = this.extractAllMatches(cleaned, /<li[^>]*>([\s\S]*?)<\/li>/gi)
      .map((li) => li.replace(/\s+/g, ' ').trim())
      .filter((li) => li.length > 10 && li.length < 300 && li.split(/\s+/).length >= 3);

    // Deduplicate and merge
    const seen = new Set<string>();
    const allText = [...allParagraphs, ...listItems].filter((text) => {
      const key = text.substring(0, 50).toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    // Navigation links
    const navLinks: Array<{ text: string; href: string }> = [];
    const linkRegex = /<a[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
    let linkMatch;
    while ((linkMatch = linkRegex.exec(cleaned)) !== null) {
      const href = linkMatch[1];
      const text = this.cleanText(linkMatch[2]);
      if (text.length > 1 && text.length < 100 && !href.startsWith('#') && !href.startsWith('javascript:')) {
        navLinks.push({ text, href });
      }
    }

    // Images with alt text
    const images: Array<{ alt: string; src: string }> = [];
    const imgRegex = /<img[^>]*alt=["']([^"']+)["'][^>]*src=["']([^"']+)["']/gi;
    const imgRegex2 = /<img[^>]*src=["']([^"']+)["'][^>]*alt=["']([^"']+)["']/gi;
    let imgMatch;
    while ((imgMatch = imgRegex.exec(cleaned)) !== null) {
      images.push({ alt: imgMatch[1], src: imgMatch[2] });
    }
    while ((imgMatch = imgRegex2.exec(cleaned)) !== null) {
      images.push({ alt: imgMatch[2], src: imgMatch[1] });
    }

    return {
      url,
      title,
      metaDescription,
      h1,
      h2,
      h3,
      paragraphs: allText.slice(0, 50), // Limit to prevent token overflow
      navLinks: navLinks.slice(0, 30),
      images: images.slice(0, 20),
      rawTextLength: cleaned.replace(/<[^>]*>/g, '').length,
    };
  }

  private extractAllMatches(html: string, regex: RegExp): string[] {
    const results: string[] = [];
    let match;
    while ((match = regex.exec(html)) !== null) {
      const text = this.cleanText(match[1]);
      if (text.length > 0) {
        results.push(text);
      }
    }
    return results;
  }

  private cleanText(html: string): string {
    return html
      .replace(/<[^>]*>/g, '') // Remove HTML tags
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/\s+/g, ' ')
      .trim();
  }

  private normalizeUrl(url: string): string {
    let normalized = url.trim();
    if (!normalized.startsWith('http://') && !normalized.startsWith('https://')) {
      normalized = 'https://' + normalized;
    }
    return normalized;
  }
}
