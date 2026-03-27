/**
 * Content Extraction Agent - Semantic content understanding
 *
 * LAYER 2: The critical layer between crawling and business understanding.
 *
 * Takes structured HTML data (title, headings, paragraphs) and produces
 * semantic business content. The LLM sees REAL TEXT, not raw HTML.
 *
 * Output:
 * - hero_message
 * - what_they_do
 * - services[]
 * - target_signals[]
 * - keywords[]
 * - pricing_signals
 */

import { llmGenerate, extractJSON } from '../lib/llm';
import { BaseAgent, type AgentContext, type AgentResult } from './base-agent';
import type { CrawlResult } from './crawler-agent';

export interface ExtractedContent {
  heroMessage: string;
  whatTheyDo: string;
  services: string[];
  targetSignals: string[];
  keywords: string[];
  pricingSignals: string[];
  testimonialSignals: string[];
  rawTextSample: string;
}

export class ContentExtractionAgent extends BaseAgent {
  readonly name = 'content_extraction';
  readonly description = 'Extracts semantic business content from structured website data - hero message, services, target audience signals, keywords';
  readonly capabilities = ['extract_content', 'semantic_extraction'];

  canHandle(taskType: string): boolean {
    return this.capabilities.includes(taskType);
  }

  async execute(input: Record<string, unknown>, context: AgentContext): Promise<AgentResult> {
    const structuredData = input.structuredData as CrawlResult | undefined;
    const url = input.url as string;

    if (!structuredData) {
      return { success: false, data: {}, error: 'Structured crawl data is required' };
    }

    // Build a clean text representation the LLM can actually understand
    const cleanText = this.buildCleanText(structuredData);

    try {
      const { text } = await llmGenerate([{
          role: 'user',
          content: `You are extracting structured content from a company website.

Website: ${url || structuredData.url}
Title: ${structuredData.title}
Meta Description: ${structuredData.metaDescription}

REAL WEBSITE CONTENT:
<<<
${cleanText}
>>>

Extract the following. Be PRECISE — use exact words from the content.
Do NOT summarize vaguely. Do NOT invent information not present in the text.

Return ONLY valid JSON:
{
  "heroMessage": "The main headline/hero text exactly as written",
  "whatTheyDo": "One clear sentence about what this company does, based on the content",
  "services": ["Service 1 as described on site", "Service 2"],
  "targetSignals": ["Any mention of who this is for - e.g. 'kids', 'parents', 'small business', 'developers'"],
  "keywords": ["Important industry/topic keywords found in the text"],
  "pricingSignals": ["Any pricing mentions - e.g. 'free trial', '$99/mo', 'contact for pricing'"],
  "testimonialSignals": ["Any social proof - e.g. '500+ clients', 'trusted by X']
}

Rules:
- Use EXACT text from the content when possible
- If a field has no data, return empty array []
- heroMessage should be the first H1 or the most prominent heading
- services must be specific (e.g. "Coding courses for kids", NOT "education")
- targetSignals: look for age groups, roles, industries mentioned`,
        }], { maxTokens: 1500 });

      const parsed = extractJSON(text);

      if (!parsed) {
        // Fallback: build from structured data directly
        return this.buildFallbackResult(structuredData);
      }

      const extracted: ExtractedContent = {
        ...parsed,
        rawTextSample: cleanText.substring(0, 500),
      };

      return {
        success: true,
        data: { extractedContent: extracted },
        suggestedNextTasks: [
          {
            type: 'analyze_business',
            title: 'Analyze business from extracted content',
            input: { extractedContent: extracted, url },
            priority: 'high',
          },
        ],
        memoryEntries: [
          {
            type: 'customer_insight',
            title: `Content extracted: ${structuredData.title || url}`,
            content: JSON.stringify(extracted),
            metadata: { tags: ['content', 'extraction'], url },
          },
        ],
      };
    } catch (error) {
      console.error('Content extraction failed:', error);
      return this.buildFallbackResult(structuredData);
    }
  }

  private buildCleanText(data: CrawlResult): string {
    const parts: string[] = [];

    if (data.title) parts.push(`PAGE TITLE: ${data.title}`);
    if (data.metaDescription) parts.push(`META DESCRIPTION: ${data.metaDescription}`);

    // Build SECTIONS: heading + associated content (much more meaningful than flat lists)
    if (data.h1.length > 0) {
      parts.push(`\nHERO SECTION:\n${data.h1[0]}`);
    }

    // Match h2 headings with paragraphs that follow them for section context
    if (data.h2.length > 0) {
      parts.push('\nMAIN SECTIONS:');
      for (const heading of data.h2.slice(0, 8)) {
        parts.push(`\n## ${heading}`);
        // Find paragraphs that likely belong to this section
        const relatedParagraphs = data.paragraphs.filter((p) => {
          const headingWords = heading.toLowerCase().split(/\s+/).filter((w) => w.length > 3);
          return headingWords.some((word) => p.toLowerCase().includes(word));
        });
        if (relatedParagraphs.length > 0) {
          parts.push(relatedParagraphs.slice(0, 2).join('\n'));
        }
      }
    }

    // First meaningful paragraphs (not matched to headings)
    const usedParagraphs = new Set<string>();
    if (data.paragraphs.length > 0) {
      parts.push('\nKEY CONTENT:');
      for (const p of data.paragraphs.slice(0, 15)) {
        if (!usedParagraphs.has(p) && p.length > 30) {
          parts.push(p);
          usedParagraphs.add(p);
        }
      }
    }

    // Navigation reveals site structure (services, products pages)
    if (data.navLinks.length > 0) {
      const uniqueLinks = data.navLinks
        .filter((l, i, arr) => arr.findIndex((a) => a.text === l.text) === i)
        .filter((l) => l.text.length > 2 && l.text.length < 50)
        .slice(0, 15);
      if (uniqueLinks.length > 0) {
        parts.push(`\nSITE NAVIGATION (reveals services/pages):\n${uniqueLinks.map((l) => `• ${l.text}`).join('\n')}`);
      }
    }

    // Limit total text to ~6000 chars for token efficiency
    const fullText = parts.join('\n');
    return fullText.substring(0, 6000);
  }

  private buildFallbackResult(data: CrawlResult): AgentResult {
    // Build from structured data without AI
    const extracted: ExtractedContent = {
      heroMessage: data.h1[0] || data.title || '',
      whatTheyDo: data.metaDescription || data.h1.join('. ') || data.title,
      services: data.h2.slice(0, 5),
      targetSignals: this.detectTargetSignals(data),
      keywords: this.extractKeywords(data),
      pricingSignals: [],
      testimonialSignals: [],
      rawTextSample: data.paragraphs.slice(0, 3).join(' ').substring(0, 500),
    };

    return {
      success: true,
      data: { extractedContent: extracted },
      suggestedNextTasks: [
        {
          type: 'analyze_business',
          title: 'Analyze business from extracted content',
          input: { extractedContent: extracted, url: data.url },
          priority: 'high',
        },
      ],
    };
  }

  private detectTargetSignals(data: CrawlResult): string[] {
    const signals: string[] = [];
    const allText = [data.title, data.metaDescription, ...data.h1, ...data.h2, ...data.paragraphs.slice(0, 10)].join(' ').toLowerCase();

    const patterns = [
      { regex: /\b(kids?|children|child)\b/i, signal: 'children/kids' },
      { regex: /\b(parents?|families|family)\b/i, signal: 'parents/families' },
      { regex: /\b(business(es)?|companies|enterprise)\b/i, signal: 'businesses' },
      { regex: /\b(developer|engineer|programmer)\b/i, signal: 'developers' },
      { regex: /\b(startup|founder)\b/i, signal: 'startups/founders' },
      { regex: /\b(student|learner|teacher)\b/i, signal: 'students/educators' },
      { regex: /\b(small business|smb|sme)\b/i, signal: 'small businesses' },
      { regex: /\bage[sd]?\s*(\d+[-–]\d+)/i, signal: '' },
    ];

    for (const { regex, signal } of patterns) {
      const match = allText.match(regex);
      if (match) {
        signals.push(signal || match[0]);
      }
    }

    return signals;
  }

  private extractKeywords(data: CrawlResult): string[] {
    const words = [data.title, data.metaDescription, ...data.h1, ...data.h2]
      .join(' ')
      .toLowerCase()
      .split(/\s+/)
      .filter((w) => w.length > 3);

    // Count frequency
    const freq = new Map<string, number>();
    for (const w of words) {
      freq.set(w, (freq.get(w) || 0) + 1);
    }

    return Array.from(freq.entries())
      .filter(([, count]) => count >= 2)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([word]) => word);
  }
}
