import OpenAI from 'openai';
import { agentLogger } from './logger';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const logger = agentLogger.child({ service: 'embeddings' });

export interface EmbeddingResult {
  embedding: number[];
  model: string;
  tokensUsed: number;
}

// Generate embedding for a single text
export async function generateEmbedding(text: string): Promise<EmbeddingResult> {
  try {
    // Truncate if too long (max 8191 tokens for ada-002)
    const truncatedText = text.slice(0, 30000);

    const response = await openai.embeddings.create({
      model: 'text-embedding-ada-002',
      input: truncatedText,
    });

    logger.debug('Generated embedding', {
      textLength: truncatedText.length,
      tokensUsed: response.usage.total_tokens,
    });

    return {
      embedding: response.data[0].embedding,
      model: 'text-embedding-ada-002',
      tokensUsed: response.usage.total_tokens,
    };
  } catch (error) {
    logger.error('Failed to generate embedding', { error: String(error) });
    throw error;
  }
}

// Generate embeddings for multiple texts (batch)
export async function generateEmbeddings(texts: string[]): Promise<EmbeddingResult[]> {
  try {
    // Truncate each text
    const truncatedTexts = texts.map((t) => t.slice(0, 30000));

    const response = await openai.embeddings.create({
      model: 'text-embedding-ada-002',
      input: truncatedTexts,
    });

    logger.debug('Generated batch embeddings', {
      count: texts.length,
      tokensUsed: response.usage.total_tokens,
    });

    return response.data.map((d) => ({
      embedding: d.embedding,
      model: 'text-embedding-ada-002',
      tokensUsed: Math.round(response.usage.total_tokens / texts.length),
    }));
  } catch (error) {
    logger.error('Failed to generate batch embeddings', { error: String(error) });
    throw error;
  }
}

// Calculate cosine similarity between two embeddings
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error('Embeddings must have same dimensions');
  }

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

// Find most similar embeddings from a list
export function findMostSimilar(
  queryEmbedding: number[],
  candidates: Array<{ id: string; embedding: number[] }>,
  topK: number = 5
): Array<{ id: string; similarity: number }> {
  const results = candidates
    .map((candidate) => ({
      id: candidate.id,
      similarity: cosineSimilarity(queryEmbedding, candidate.embedding),
    }))
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, topK);

  return results;
}

// Create a text representation for memory storage
export function createMemoryText(
  title: string,
  content: string,
  metadata?: Record<string, unknown>
): string {
  let text = `${title}\n\n${content}`;

  if (metadata) {
    const relevantKeys = ['tags', 'outcome', 'campaign', 'type'];
    const metaStr = relevantKeys
      .filter((key) => metadata[key])
      .map((key) => `${key}: ${JSON.stringify(metadata[key])}`)
      .join('\n');

    if (metaStr) {
      text += `\n\nMetadata:\n${metaStr}`;
    }
  }

  return text;
}
