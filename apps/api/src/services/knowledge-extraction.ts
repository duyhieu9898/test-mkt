/**
 * Knowledge Extraction Service
 *
 * Extracts structured knowledge from documents (PDF, URL, text).
 * Uses CrawlerAgent for URLs, LLM for structuring.
 * All extracted knowledge flows into the Memory System.
 */

import { llmGenerate, extractJSON } from '../lib/llm';
import { CrawlerAgent } from '../agents/crawler-agent';

export interface KnowledgeEntry {
  category: string;
  title: string;
  content: string;
  tags: string[];
  confidence: number;
}

export class KnowledgeExtractionService {
  /**
   * Extract text from a PDF buffer
   */
  async extractFromPDF(fileBuffer: Buffer): Promise<string> {
    try {
      // Dynamic import to avoid issues if pdf-parse not installed
      const pdfParse = (await import('pdf-parse')).default;
      const data = await pdfParse(fileBuffer);
      return data.text || '';
    } catch (err) {
      console.warn('[KnowledgeExtraction] PDF parsing failed, treating as raw text');
      return fileBuffer.toString('utf-8').substring(0, 10000);
    }
  }

  /**
   * Extract text from a URL using CrawlerAgent
   */
  async extractFromURL(url: string): Promise<string> {
    const crawler = new CrawlerAgent();
    const mockCtx: any = {
      companyId: 'extraction',
      executionId: 'extraction',
      memory: { store: async () => 'id', recall: async () => [], storeKnowledge: async () => 'id', recallKnowledge: async () => [] },
    };

    const result = await crawler.execute({ url }, mockCtx);
    if (!result.success) {
      throw new Error(`Failed to crawl ${url}: ${result.error}`);
    }

    const data = result.data as any;
    const parts = [
      data.title ? `Title: ${data.title}` : '',
      data.metaDescription ? `Description: ${data.metaDescription}` : '',
      ...(data.h1 || []).map((h: string) => `H1: ${h}`),
      ...(data.h2 || []).map((h: string) => `H2: ${h}`),
      ...(data.paragraphs || []).slice(0, 30),
    ].filter(Boolean);

    return parts.join('\n\n');
  }

  /**
   * Structure raw text into knowledge entries using LLM
   */
  async structureContent(rawText: string, documentName: string): Promise<KnowledgeEntry[]> {
    // Chunk text if too long (max ~4000 tokens worth)
    const maxChars = 8000;
    const text = rawText.substring(0, maxChars);

    try {
      const { text: response } = await llmGenerate([{
        role: 'user',
        content: `Extract structured knowledge from this document.

Document: ${documentName}

Content:
<<<
${text}
>>>

Extract distinct knowledge items. Each item should be a self-contained fact or piece of information.

Return ONLY JSON array:
[
  {
    "category": "product|pricing|faq|policy|process|team|market|customer|technical|general",
    "title": "Clear, specific title",
    "content": "The actual knowledge content — detailed and useful",
    "tags": ["relevant", "tags"],
    "confidence": 0.9
  }
]

Rules:
- Each entry must be independently useful
- Category must be one of: product, pricing, faq, policy, process, team, market, customer, technical, general
- Be specific in titles, not vague
- Extract at least 3 entries, max 15
- Confidence: 0.9+ for explicit facts, 0.7-0.9 for inferred, below 0.7 for uncertain`,
      }], { maxTokens: 2000 });

      const parsed = extractJSON(response);
      if (parsed && Array.isArray(parsed)) {
        return parsed.map((entry: any) => ({
          category: entry.category || 'general',
          title: entry.title || 'Untitled',
          content: entry.content || '',
          tags: entry.tags || [],
          confidence: typeof entry.confidence === 'number' ? entry.confidence : 0.7,
        }));
      }
    } catch (err) {
      console.error('[KnowledgeExtraction] LLM structuring failed:', err);
    }

    // Fallback: create a single entry from raw text
    return [{
      category: 'general',
      title: documentName,
      content: text.substring(0, 2000),
      tags: [],
      confidence: 0.5,
    }];
  }
}

export const knowledgeExtractionService = new KnowledgeExtractionService();
