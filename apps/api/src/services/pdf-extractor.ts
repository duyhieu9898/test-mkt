/**
 * PDF & Document Text Extractor
 *
 * Extracts text content from uploaded files (PDF, text, markdown)
 * for use as additional context in LLM-powered page generation.
 */

const MAX_CHARS = 10000;

export async function extractTextFromFile(buffer: Buffer, mimeType: string): Promise<string> {
  if (mimeType === 'application/pdf') {
    try {
      const data = await pdfParse(buffer);
      const pdfParse = (await import('pdf-parse')).default;
      return data.text.substring(0, MAX_CHARS);
    } catch {
      return '';
    }
  }

  if (mimeType.startsWith('text/') || mimeType === 'text/markdown') {
    return buffer.toString('utf-8').substring(0, MAX_CHARS);
  }

  return '';
}
