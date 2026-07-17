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
   * Extract plain text using the parser that matches the uploaded format.
   * Keeping this here ensures the API fallback and queue worker behave alike.
   */
  async extractFromDocument(
    fileBuffer: Buffer,
    fileName: string,
    fileType: 'pdf' | 'doc' | 'text',
  ): Promise<string> {
    let text = '';

    if (fileType === 'pdf') {
      text = await this.extractFromPDF(fileBuffer);
    } else if (fileType === 'doc') {
      if (!fileName.toLowerCase().endsWith('.docx')) {
        throw new Error('Legacy .doc files are not supported. Save the file as .docx or PDF and try again.');
      }
      text = await this.extractFromDOCX(fileBuffer);
    } else {
      text = fileBuffer.toString('utf-8');
    }

    const cleaned = text.replace(/\u0000/g, '').trim();
    if (cleaned.length < 10) {
      throw new Error('No readable text was found in this document.');
    }
    return cleaned;
  }

  /**
   * Extract text from a PDF buffer
   */
  async extractFromPDF(fileBuffer: Buffer): Promise<string> {
    let parser: { getText: () => Promise<{ text: string }>; destroy: () => Promise<void> } | null = null;
    try {
      const { PDFParse } = await import('pdf-parse');
      parser = new PDFParse({ data: fileBuffer });
      const result = await parser.getText();
      return result.text || '';
    } catch (err) {
      console.warn('[KnowledgeExtraction] PDF parsing failed:', err);
      throw new Error('Could not read this PDF. Make sure it contains selectable text and is not password protected.');
    } finally {
      await parser?.destroy().catch(() => undefined);
    }
  }

  /** Extract raw text from the OpenXML content inside a .docx file. */
  async extractFromDOCX(fileBuffer: Buffer): Promise<string> {
    try {
      const mammoth = (await import('mammoth')).default;
      const result = await mammoth.extractRawText({ buffer: fileBuffer });
      return result.value || '';
    } catch (err) {
      console.warn('[KnowledgeExtraction] DOCX parsing failed:', err);
      throw new Error('Could not read this Word file. Make sure it is a valid .docx document.');
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
