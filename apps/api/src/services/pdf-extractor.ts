/**
 * PDF & Document Text Extractor
 *
 * Extracts text content from uploaded files (PDF, text, markdown)
 * for use as additional context in LLM-powered page generation.
 */

const MAX_CHARS = 10000;

export async function extractTextFromFile(buffer: Buffer, mimeType: string): Promise<string> {
  if (mimeType === 'application/pdf') {
    let parser: any;
    try {
      const { PDFParse } = await import('pdf-parse');
      parser = new PDFParse({ data: buffer });
      const data = await parser.getText();
      return (data.text || '').substring(0, MAX_CHARS);
    } catch {
      return '';
    } finally {
      await parser?.destroy?.().catch?.(() => undefined);
    }
  }

  if (mimeType.startsWith('text/') || mimeType === 'text/markdown') {
    return buffer.toString('utf-8').substring(0, MAX_CHARS);
  }

  return '';
}
