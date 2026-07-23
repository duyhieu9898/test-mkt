/**
 * Market scan engine (doc 10 §5).
 *
 * A CEO brief is only as good as its source data. This scanner verifies the
 * competitor website first, then collects website/news/public-web/social
 * evidence before asking the LLM to extract strategy signals. Generic
 * "no recent news" output is filtered out so CEO Advisor does not learn noise.
 */
import { llmGenerate, extractJSON } from '../lib/llm';
import {
  cleanDiscoveryText,
  discoverPublicWebSources,
  discoverWebsiteSources,
  fetchReadableText,
  getDiscoveryDomain,
  normalizeDiscoveryUrl,
  type PublicDiscoverySource,
} from './public-discovery';

export interface Signal { type: string; text: string; url?: string; date?: string }
export interface ScanSource { kind: string; url: string; fetchedAt: string }
export interface CompetitorLite {
  id: string;
  name: string;
  url: string | null;
  keywords: string[];
  industry?: string | null;
  companyName?: string | null;
  products?: string[];
  audiences?: string[];
  language?: string | null;
}
export interface ScanResult {
  sources: ScanSource[];
  signals: Signal[];
  aiSummary: string;
  recommendedAction: string;
  resolvedUrl?: string | null;
  resolutionNote?: string;
}

async function safeFetch(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(30_000),
      headers: { 'User-Agent': 'Mozilla/5.0 (1Person MarketScan)' },
      redirect: 'follow',
    });
    if (!res.ok) return null;
    return await res.text();
  } catch { return null; }
}

async function fetchJina(url: string): Promise<string | null> {
  const text = await safeFetch(`https://r.jina.ai/${url}`);
  return text ? text.slice(0, 5000) : null;
}

interface NewsItem { title: string; url: string; date: string }
async function fetchNews(query: string): Promise<NewsItem[]> {
  const url = `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=en-US&gl=US&ceid=US:en`;
  const xml = await safeFetch(url);
  if (!xml) return [];
  const items: NewsItem[] = [];
  const re = /<item>([\s\S]*?)<\/item>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) && items.length < 5) {
    const b = m[1] ?? '';
    const title = cleanDiscoveryText(b.match(/<title>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/)?.[1]);
    const link = cleanDiscoveryText(b.match(/<link>([\s\S]*?)<\/link>/)?.[1]);
    const date = cleanDiscoveryText(b.match(/<pubDate>([\s\S]*?)<\/pubDate>/)?.[1]);
    if (title && link) items.push({ title, url: link, date });
  }
  return items;
}

function normalizeText(value: unknown): string {
  return cleanDiscoveryText(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[\u0111\u0110]/g, 'd')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function competitorTokens(name: string): string[] {
  const normalized = normalizeText(name);
  const compact = normalized.replace(/\s+/g, '');
  return Array.from(new Set([
    normalized,
    compact,
    ...normalized.split(/\s+/).filter((word) => word.length >= 3),
  ].filter((word) => word.length >= 3)));
}

function isGenericNoSignal(value: unknown): boolean {
  const text = normalizeText(value);
  if (!text) return true;
  return [
    'no recent news',
    'no significant updates',
    'no current information',
    'no competitor activity',
    'no credible signal',
    'no concrete signal',
    'monitor for future updates',
    'khong co tin moi',
    'khong co cap nhat',
    'khong tim thay tin hieu',
  ].some((phrase) => text.includes(phrase));
}

function isBadPublicPage(title: string, body: string): boolean {
  const text = normalizeText(`${title} ${body.slice(0, 1200)}`);
  return [
    '404',
    'page not found',
    'not found',
    'domain for sale',
    'buy this domain',
    'this domain is for sale',
    'parking page',
    'access denied',
  ].some((signal) => text.includes(signal));
}

function sourceScore(source: PublicDiscoverySource, competitorName: string): number {
  const tokens = competitorTokens(competitorName);
  const host = getDiscoveryDomain(source.url) ?? '';
  const haystack = normalizeText(`${source.title} ${source.snippet} ${source.url}`);
  const compactHaystack = haystack.replace(/\s+/g, '');
  const matchedTokens = tokens.filter((token) =>
    haystack.includes(token) || compactHaystack.includes(token.replace(/\s+/g, '')),
  ).length;

  let score = matchedTokens * 20;
  if (source.type === 'official_website') score += 15;
  if (source.type === 'profile') score -= 10;
  if (/facebook|linkedin|instagram|youtube|tiktok|twitter|x\.com/.test(host)) score -= 20;
  if (/\.vn$/.test(host)) score += 5;
  if (isGenericNoSignal(`${source.title} ${source.snippet}`)) score -= 30;
  return score;
}

async function validateCompetitorUrl(url: string, competitorName: string): Promise<{ url: string; text: string } | null> {
  const normalized = normalizeDiscoveryUrl(url);
  if (!normalized) return null;
  const text = await fetchReadableText(normalized, 5000);
  if (!text) return null;
  const title = text.match(/^Title:\s*(.+)$/m)?.[1] ?? '';
  if (isBadPublicPage(title, text)) return null;

  const tokens = competitorTokens(competitorName);
  const haystack = normalizeText(`${normalized} ${title} ${text.slice(0, 1200)}`);
  const compactHaystack = haystack.replace(/\s+/g, '');
  const tokenHit = tokens.some((token) =>
    haystack.includes(token) || compactHaystack.includes(token.replace(/\s+/g, '')),
  );
  return tokenHit ? { url: normalized, text } : null;
}

export async function resolveCompetitorWebsite(args: {
  name: string;
  url?: string | null;
  industry?: string | null;
  companyName?: string | null;
  language?: string | null;
}): Promise<{ url: string | null; confidence: 'high' | 'medium' | 'low'; note: string }> {
  if (args.url) {
    const validExisting = await validateCompetitorUrl(args.url, args.name);
    if (validExisting) {
      return { url: validExisting.url, confidence: 'high', note: 'Existing competitor URL was verified.' };
    }
  }

  const queries = [
    `"${args.name}" official website`,
    `"${args.name}" ${args.industry ?? ''}`.trim(),
    `"${args.name}" ${args.companyName ?? ''} competitor`.trim(),
  ].filter(Boolean);

  const candidates: PublicDiscoverySource[] = [];
  for (const query of queries.slice(0, 3)) {
    candidates.push(...await discoverPublicWebSources(query, 8, args.language));
  }

  const seen = new Set<string>();
  const ranked = candidates
    .filter((source) => {
      const normalized = normalizeDiscoveryUrl(source.url);
      if (!normalized || seen.has(normalized)) return false;
      seen.add(normalized);
      source.url = normalized;
      return true;
    })
    .map((source) => ({ source, score: sourceScore(source, args.name) }))
    .filter((item) => item.score >= 20)
    .sort((left, right) => right.score - left.score);

  for (const { source, score } of ranked.slice(0, 6)) {
    const valid = await validateCompetitorUrl(source.url, args.name);
    if (valid) {
      return {
        url: valid.url,
        confidence: score >= 45 ? 'high' : 'medium',
        note: `Resolved competitor website from public search: ${source.title}`,
      };
    }
  }

  return {
    url: null,
    confidence: 'low',
    note: args.url
      ? 'Configured competitor URL could not be verified and no better official website was found.'
      : 'No verified official website was found.',
  };
}

function dedupeSources(sources: ScanSource[]): ScanSource[] {
  const seen = new Set<string>();
  return sources.filter((source) => {
    const key = `${source.kind}:${source.url}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function evidenceLine(source: PublicDiscoverySource, index: number): string {
  return `${index + 1}. [${source.type}] ${source.title} — ${source.url}\n${source.snippet}`;
}

function sanitizeSignals(rawSignals: unknown): Signal[] {
  if (!Array.isArray(rawSignals)) return [];
  const seen = new Set<string>();
  const signals: Signal[] = [];
  for (const raw of rawSignals) {
    if (!raw || typeof raw !== 'object') continue;
    const item = raw as Record<string, unknown>;
    const text = cleanDiscoveryText(item.text).slice(0, 600);
    if (!text || isGenericNoSignal(text)) continue;
    const url = typeof item.url === 'string' ? normalizeDiscoveryUrl(item.url) : null;
    if (!url) continue;
    const key = normalizeText(`${item.type ?? 'news'} ${text} ${url}`).slice(0, 220);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    signals.push({
      type: cleanDiscoveryText(item.type || 'market_signal').slice(0, 60) || 'market_signal',
      text,
      url,
      date: item.date ? cleanDiscoveryText(item.date).slice(0, 80) : undefined,
    });
    if (signals.length >= 6) break;
  }
  return signals;
}

export async function scanCompetitor(competitor: CompetitorLite): Promise<ScanResult> {
  const sources: ScanSource[] = [];
  const now = new Date().toISOString();
  const resolved = await resolveCompetitorWebsite({
    name: competitor.name,
    url: competitor.url,
    industry: competitor.industry,
    companyName: competitor.companyName,
    language: competitor.language,
  });
  const scanUrl = resolved.url ?? competitor.url;

  let websiteMd = '';
  if (scanUrl) {
    const md = await fetchJina(scanUrl);
    if (md && !isBadPublicPage('', md)) {
      websiteMd = md;
      sources.push({ kind: resolved.url ? 'verified_website' : 'website', url: scanUrl, fetchedAt: now });
    }
  }

  const keywordTopic = (competitor.keywords ?? []).slice(0, 3).join(' ') || null;
  const websiteSources = scanUrl
    ? await discoverWebsiteSources({
        websiteUrl: scanUrl,
        topic: keywordTopic,
        maxSources: 8,
        language: competitor.language,
      }).catch(() => [])
    : [];
  for (const source of websiteSources.slice(0, 8)) {
    sources.push({ kind: source.type === 'profile' ? 'social' : 'website_page', url: source.url, fetchedAt: now });
  }

  const queryFocus = [
    competitor.name,
    competitor.industry,
    ...(competitor.products ?? []).slice(0, 2),
    ...(competitor.audiences ?? []).slice(0, 2),
  ].filter(Boolean).join(' ');
  const newsQueries = Array.from(new Set([
    competitor.name,
    ...((competitor.keywords ?? []).slice(0, 3).map((kw) => `${competitor.name} ${kw}`)),
    queryFocus,
  ].filter(Boolean)));

  const newsItems: NewsItem[] = [];
  for (const query of newsQueries.slice(0, 4)) {
    for (const it of await fetchNews(query)) {
      newsItems.push(it);
      sources.push({ kind: 'news', url: it.url, fetchedAt: now });
    }
  }

  const publicQueries = [
    `"${competitor.name}"`,
    `${competitor.name} ${competitor.industry ?? ''}`.trim(),
    ...((competitor.keywords ?? []).slice(0, 2).map((kw) => `"${competitor.name}" ${kw}`)),
  ].filter(Boolean).slice(0, 4);
  const publicSources = (await Promise.all(
    publicQueries.map((query) => discoverPublicWebSources(query, 6, competitor.language).catch(() => [])),
  )).flat();
  for (const source of publicSources.slice(0, 12)) {
    sources.push({ kind: source.type === 'profile' ? 'social' : source.type, url: source.url, fetchedAt: now });
  }

  const sourceEvidence = [
    ...websiteSources.map(evidenceLine),
    ...publicSources.slice(0, 10).map(evidenceLine),
  ].join('\n\n') || '(no public web sources)';
  const newsBlock = newsItems.map((n, i) => `${i + 1}. ${n.title} — ${n.url} (${n.date})`).join('\n') || '(no news)';

  const resp = await llmGenerate(
    [
      {
        role: 'system',
        content: 'You analyze competitor and market intel for a CEO. Extract only evidence-backed signals that change marketing or strategic decisions. Return STRICT JSON only.',
      },
      {
        role: 'user',
        content: `Competitor: ${competitor.name}
Configured URL: ${competitor.url ?? '(none)'}
Verified URL: ${resolved.url ?? '(not verified)'}
URL resolution note: ${resolved.note}
Company: ${competitor.companyName ?? '(unknown)'}
Industry: ${competitor.industry ?? '(unknown)'}
Products/services to protect: ${(competitor.products ?? []).slice(0, 6).join(' | ') || '(unknown)'}
Audiences to protect: ${(competitor.audiences ?? []).slice(0, 6).join(' | ') || '(unknown)'}

WEBSITE (markdown, truncated):
${websiteMd || '(no verified website content)'}

PUBLIC WEB AND SOCIAL EVIDENCE:
${sourceEvidence}

RECENT NEWS:
${newsBlock}

Return JSON:
{"signals":[{"type":"product_launch|pricing_change|content_positioning|hiring|social_activity|review_signal|news|market_signal","text":"concrete observation and why it matters","url":"source URL","date":"source date if known"}],"aiSummary":"1-2 evidence-backed sentences","recommendedAction":"1 concrete CEO/marketing action"}

Rules:
- Use only observations supported by the evidence above.
- Every signal must include a real source URL.
- If the evidence only says there is no news, no updates, or an inaccessible/incorrect website, return {"signals":[],"aiSummary":"","recommendedAction":""}.
- Do not write generic recommendations like "monitor this competitor" unless there is a concrete source-backed reason.
- Prefer market/customer-facing signals: offers, programs, pricing, content themes, events, hiring, social channels, reviews, campaigns.`,
      },
    ],
    { featureKey: 'market_scan', traceName: 'market.scan', json: true, metadata: { competitorId: competitor.id } },
  );

  const parsed = extractJSON(resp.text) ?? {};
  const signals = sanitizeSignals(parsed.signals);
  const aiSummary = isGenericNoSignal(parsed.aiSummary) ? '' : cleanDiscoveryText(parsed.aiSummary).slice(0, 500);
  const recommendedAction = isGenericNoSignal(parsed.recommendedAction)
    ? ''
    : cleanDiscoveryText(parsed.recommendedAction).slice(0, 350);

  return {
    sources: dedupeSources(sources).slice(0, 30),
    signals,
    aiSummary,
    recommendedAction,
    resolvedUrl: resolved.url,
    resolutionNote: resolved.note,
  };
}
