/**
 * SERP Scraper — Block 4 (Real-time Semantic Grader).
 *
 * Fetches the top organic results for a given keyword and extracts the
 * key topical entities. Used by the Content Grader to compute coverage
 * scores against what competitors are actually ranking for.
 *
 * Resolution order for the SerpAPI key:
 *   1. Admin site_config row (section='integrations', key 'serpapi_key')
 *   2. process.env.SERPAPI_KEY (escape hatch for self-hosted operators)
 *   3. If neither, fall back to an LLM simulation so the feature ships
 *      day 1 even without a SerpAPI subscription.
 *
 * Results are cached for 24h in-process per keyword to avoid cost
 * explosion on repeated grades.
 */

import { db } from '../lib/db';
import { siteConfig } from '@1person/core/db';
import { and, eq } from 'drizzle-orm';
import { llmGenerate, extractJSON } from '../lib/llm';

export interface SerpResult {
  url: string;
  title: string;
  snippet: string;
  entities_extracted: string[];
}

interface CacheEntry {
  expiresAt: number;
  results: SerpResult[];
}

const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const cache = new Map<string, CacheEntry>();

async function resolveSerpApiKey(): Promise<string | null> {
  // 1. Admin DB config first (project rule — keys live in admin UI, not .env)
  try {
    const row = await db
      .select()
      .from(siteConfig)
      .where(and(eq(siteConfig.section, 'integrations'), eq(siteConfig.locale, 'global')))
      .limit(1);
    const content = (row[0]?.content || {}) as Record<string, unknown>;
    const v = content.serpapi_key;
    if (typeof v === 'string' && v.trim()) return v.trim();
  } catch {
    // Non-fatal — fall through to env.
  }
  // 2. Env fallback (legacy / self-hosted operators)
  const envKey = process.env.SERPAPI_KEY;
  if (envKey && envKey.trim()) return envKey.trim();
  return null;
}

async function fetchFromSerpApi(keyword: string, count: number, apiKey: string): Promise<SerpResult[]> {
  const params = new URLSearchParams({
    q: keyword,
    api_key: apiKey,
    num: String(count),
    engine: 'google',
  });
  const res = await fetch(`https://serpapi.com/search?${params.toString()}`, {
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`SerpAPI HTTP ${res.status}`);
  const data: any = await res.json();
  const organic: any[] = Array.isArray(data?.organic_results) ? data.organic_results.slice(0, count) : [];
  // Extract entities from titles+snippets with one LLM call (cheap, batched).
  const raw = organic.map((r) => ({
    url: String(r.link || ''),
    title: String(r.title || ''),
    snippet: String(r.snippet || ''),
  }));
  const entities = await extractEntitiesBatch(raw.map((r) => `${r.title}. ${r.snippet}`));
  return raw.map((r, i) => ({ ...r, entities_extracted: entities[i] || [] }));
}

async function extractEntitiesBatch(texts: string[]): Promise<string[][]> {
  if (texts.length === 0) return [];
  const prompt = `Extract the 3-6 most important topical entities (named concepts, products, techniques, frameworks) from each numbered text snippet. Return ONLY valid JSON: {"entities":[["...","..."],["...","..."]]} — one inner array per snippet, in order.

Snippets:
${texts.map((t, i) => `${i + 1}. ${t.slice(0, 280)}`).join('\n')}`;
  try {
    const { text } = await llmGenerate(
      [{ role: 'user', content: prompt }],
      { featureKey: 'content_grade', maxTokens: 1200 }
    );
    const parsed = extractJSON(text);
    const arr = parsed?.entities;
    if (Array.isArray(arr)) {
      return arr.map((row) =>
        Array.isArray(row) ? row.filter((x: unknown) => typeof x === 'string').slice(0, 6) : []
      );
    }
  } catch {
    // Non-fatal — fall through.
  }
  return texts.map(() => []);
}

async function simulateSerpWithLLM(keyword: string, count: number): Promise<SerpResult[]> {
  const prompt = `Simulate the realistic top ${count} Google search results for the keyword: "${keyword}".
For each result, return: a plausible competitor URL, a likely page title (50-70 chars), a likely meta snippet (150 chars), and 4-6 topical entities the page would cover.

Return ONLY valid JSON:
{"results":[{"url":"https://...","title":"...","snippet":"...","entities":["...","..."]}, ...]}`;
  try {
    const { text } = await llmGenerate(
      [{ role: 'user', content: prompt }],
      { featureKey: 'content_grade', maxTokens: 1800 }
    );
    const parsed = extractJSON(text);
    const list = parsed?.results;
    if (Array.isArray(list)) {
      return list.slice(0, count).map((r: any) => ({
        url: typeof r?.url === 'string' ? r.url : '',
        title: typeof r?.title === 'string' ? r.title : '',
        snippet: typeof r?.snippet === 'string' ? r.snippet : '',
        entities_extracted: Array.isArray(r?.entities)
          ? r.entities.filter((x: unknown) => typeof x === 'string').slice(0, 6)
          : [],
      }));
    }
  } catch (err) {
    console.warn('[serp-scraper] LLM fallback failed:', err);
  }
  return [];
}

/**
 * Get the top SERP results for a keyword. Returns at most `count` entries.
 * Uses SerpAPI if configured, otherwise simulates with LLM so the feature
 * works without a paid SerpAPI subscription.
 */
export async function getTopSerpResults(
  keyword: string,
  count = 10,
): Promise<SerpResult[]> {
  const key = `${keyword.toLowerCase().trim()}::${count}`;
  const hit = cache.get(key);
  if (hit && hit.expiresAt > Date.now()) return hit.results;

  const apiKey = await resolveSerpApiKey();
  let results: SerpResult[] = [];
  try {
    results = apiKey
      ? await fetchFromSerpApi(keyword, count, apiKey)
      : await simulateSerpWithLLM(keyword, count);
  } catch (err) {
    console.warn('[serp-scraper] primary fetch failed, falling back to LLM:', err);
    results = await simulateSerpWithLLM(keyword, count);
  }

  cache.set(key, { expiresAt: Date.now() + CACHE_TTL_MS, results });
  return results;
}
