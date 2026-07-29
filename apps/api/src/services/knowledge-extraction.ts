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
  evidence?: string;
}

function splitTextIntoChunks(text: string, maxChars: number, maxChunks: number): string[] {
  const cleaned = text.trim();
  const chunks: string[] = [];
  let cursor = 0;

  while (cursor < cleaned.length) {
    const hardEnd = Math.min(cursor + maxChars, cleaned.length);
    const paragraphEnd = cleaned.lastIndexOf('\n\n', hardEnd);
    const sentenceEnd = cleaned.lastIndexOf('. ', hardEnd);
    const boundary = Math.max(paragraphEnd, sentenceEnd);
    const end = boundary > cursor + Math.floor(maxChars * 0.65) ? boundary + 1 : hardEnd;
    chunks.push(cleaned.slice(cursor, end).trim());
    cursor = end;
  }

  const nonEmptyChunks = chunks.filter(Boolean);
  if (nonEmptyChunks.length <= maxChunks) return nonEmptyChunks;

  const selected = new Set<number>();
  for (let i = 0; i < maxChunks; i++) {
    selected.add(Math.round((i * (nonEmptyChunks.length - 1)) / (maxChunks - 1)));
  }
  return Array.from(selected)
    .sort((a, b) => a - b)
    .map((index) => nonEmptyChunks[index] ?? '')
    .filter((chunk) => chunk.length > 0);
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
    const chunks = splitTextIntoChunks(rawText, 9000, 6);
    const allEntries: KnowledgeEntry[] = [];

    for (const [chunkIndex, text] of chunks.entries()) {
      try {
        const { text: response } = await llmGenerate([{
          role: 'user',
          content: `Extract structured knowledge from this document chunk.

Document: ${documentName}
Chunk: ${chunkIndex + 1}/${chunks.length}

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
    "confidence": 0.9,
    "evidence": "Short quote or phrase copied from this chunk"
  }
]

Rules:
- Use ONLY facts explicitly present in this chunk. Do not use outside company context.
- Do not invent decisions, strategies, products, pricing, policies, or recommendations that are not written in this chunk.
- Each entry must be independently useful and supported by the evidence quote.
- Category must be one of: product, pricing, faq, policy, process, team, market, customer, technical, general
- Be specific in titles, not vague
- Extract 0-10 entries. Return [] if this chunk has no concrete business facts.
- Add an "evidence" field containing a short quote or phrase from this chunk.
- Confidence: 0.9+ for explicit facts, 0.6-0.8 for lightly summarized facts. Never include unsupported guesses.`,
        }], { maxTokens: 2000 });

        const parsed = extractJSON(response);
        if (parsed && Array.isArray(parsed)) {
          allEntries.push(...parsed.map((entry: any) => ({
            category: entry.category || 'general',
            title: entry.title || 'Untitled',
            content: entry.content || '',
            tags: entry.tags || [],
            confidence: typeof entry.confidence === 'number' ? entry.confidence : 0.7,
            evidence: typeof entry.evidence === 'string' ? entry.evidence : undefined,
          })));
        }
      } catch (err) {
        console.error('[KnowledgeExtraction] LLM structuring failed:', err);
      }
    }

    const seen = new Set<string>();
    const groundedEntries = allEntries
      .filter((entry) => entry.content.trim().length > 0)
      .filter((entry) => {
        const key = `${entry.category}:${entry.title}:${entry.content}`.toLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .slice(0, 25);

    if (groundedEntries.length > 0) return groundedEntries;

    // Fallback: create a single entry from raw text
    const text = rawText.trim();
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
