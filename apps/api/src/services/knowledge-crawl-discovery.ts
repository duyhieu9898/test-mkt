import { and, eq } from 'drizzle-orm';
import { db } from '../lib/db';
import { brandIdentities, companies, documents, siteConfig } from '@1person/core/db';
import { CrawlerAgent, type CrawlResult } from '../agents/crawler-agent';

export type CrawlSourceType =
  | 'official_website'
  | 'news'
  | 'blog'
  | 'profile'
  | 'review'
  | 'web';

export interface CrawlDiscoverySource {
  id: string;
  title: string;
  url: string;
  snippet: string;
  type: CrawlSourceType;
  sourceLabel: string;
  confidence: number;
  selectedByDefault: boolean;
  alreadyAdded: boolean;
}

export interface CrawlDiscoveryResult {
  company: {
    id: string;
    name: string;
    websiteUrl: string | null;
    domain: string | null;
  };
  sources: CrawlDiscoverySource[];
  warnings: string[];
  searchedAt: string;
}

interface CandidateSource {
  title: string;
  url: string;
  snippet?: string;
  type: CrawlSourceType;
  sourceLabel: string;
}

const MAX_SOURCES = 24;
const MIN_EXTERNAL_CONFIDENCE = 0.62;
const MAX_EXTERNAL_VERIFY_CANDIDATES = 18;
const VERIFY_TEXT_MAX_CHARS = 9000;
const GENERIC_NAME_TOKENS = new Set([
  'the', 'and', 'for', 'with', 'company', 'business', 'school', 'academy',
  'hub', 'center', 'centre', 'kid', 'kids', 'leader', 'leaders', 'global',
  'vietnam', 'online', 'official',
]);

function cleanText(value: unknown): string {
  return String(value ?? '')
    .replace(/\s+/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();
}

function normalizeUrl(value: string): string | null {
  const raw = value.trim();
  if (!raw) return null;
  try {
    const url = new URL(raw.startsWith('http://') || raw.startsWith('https://') ? raw : `https://${raw}`);
    url.hash = '';
    return url.toString().replace(/\/$/, '');
  } catch {
    return null;
  }
}

function getDomain(value: string | null): string | null {
  if (!value) return null;
  try {
    return new URL(value).hostname.replace(/^www\./, '');
  } catch {
    return null;
  }
}

function normalizeIdentityText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function compactIdentity(value: string): string {
  return normalizeIdentityText(value).replace(/\s+/g, '');
}

function getCompanySignals(companyName: string, domain: string | null) {
  const domainStem = domain?.split('.')[0] || '';
  const normalizedName = normalizeIdentityText(companyName);
  const compactName = compactIdentity(companyName);
  const compactDomainStem = compactIdentity(domainStem);
  const tokens = Array.from(new Set([
    ...normalizedName.split(/\s+/),
    ...normalizeIdentityText(domainStem).split(/\s+/),
  ].filter((token) =>
    token.length >= 3
    && !GENERIC_NAME_TOKENS.has(token)
  )));

  const exactCompacts = Array.from(new Set([
    compactName,
    compactDomainStem,
    domain ? compactIdentity(domain) : '',
  ].filter((value) => value.length >= 6)));

  return { tokens, exactCompacts };
}

function isSameDomain(url: string, domain: string | null): boolean {
  if (!domain) return false;
  try {
    return new URL(url).hostname.replace(/^www\./, '') === domain;
  } catch {
    return false;
  }
}

function getHost(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return null;
  }
}

function isLowValueDiscoveryUrl(url: string): boolean {
  const host = getHost(url);
  if (!host) return true;
  return [
    'google.com',
    'www.google.com',
    'accounts.google.com',
    'maps.google.com',
    'translate.google.com',
  ].includes(host);
}

function sameHostOrPath(baseUrl: string, href: string): string | null {
  try {
    const base = new URL(baseUrl);
    const url = new URL(href, base);
    if (url.hostname.replace(/^www\./, '') !== base.hostname.replace(/^www\./, '')) return null;
    url.hash = '';
    return url.toString().replace(/\/$/, '');
  } catch {
    return null;
  }
}

function inferType(title: string, url: string, fallback: CrawlSourceType): CrawlSourceType {
  const haystack = `${title} ${url}`.toLowerCase();
  if (/\b(blog|article|insight|guide|story)\b/.test(haystack)) return 'blog';
  if (/\b(news|press|media|announcement)\b/.test(haystack)) return 'news';
  if (/\b(review|rating|testimonial)\b/.test(haystack)) return 'review';
  if (/\b(wiki|profile|linkedin|facebook|crunchbase|directory)\b/.test(haystack)) return 'profile';
  return fallback;
}

function confidenceFor(candidate: CandidateSource, companyName: string, domain: string | null): number {
  const haystack = normalizeIdentityText(`${candidate.title} ${candidate.snippet ?? ''} ${candidate.url}`);
  const compactHaystack = haystack.replace(/\s+/g, '');
  const signals = getCompanySignals(companyName, domain);
  let score = candidate.type === 'official_website' ? 0.82 : 0.45;
  if (isSameDomain(candidate.url, domain)) score += 0.28;
  if (domain && compactHaystack.includes(compactIdentity(domain))) score += 0.25;
  if (signals.exactCompacts.some((signal) => compactHaystack.includes(signal))) score += 0.25;
  const matches = signals.tokens.filter((token) => haystack.includes(token)).length;
  if (signals.tokens.length > 0) score += Math.min(0.2, matches / signals.tokens.length * 0.2);
  if (candidate.type === 'news') score += 0.08;
  return Math.max(0.2, Math.min(0.98, Number(score.toFixed(2))));
}

function isRelevantExternalCandidate(candidate: CandidateSource, companyName: string, domain: string | null): boolean {
  if (candidate.type === 'official_website') return true;
  const haystack = normalizeIdentityText(`${candidate.title} ${candidate.snippet ?? ''} ${candidate.url}`);
  const compactHaystack = haystack.replace(/\s+/g, '');
  const signals = getCompanySignals(companyName, domain);

  if (isSameDomain(candidate.url, domain)) return true;
  if (domain && compactHaystack.includes(compactIdentity(domain))) return true;
  if (signals.exactCompacts.some((signal) => compactHaystack.includes(signal))) return true;

  const tokenMatches = signals.tokens.filter((token) => haystack.includes(token));
  const hasStrongToken = tokenMatches.some((token) => token.length >= 7);
  return hasStrongToken || tokenMatches.length >= 2;
}

function hasStrongIdentityMention(value: string, companyName: string, domain: string | null): boolean {
  const haystack = normalizeIdentityText(value);
  const compactHaystack = haystack.replace(/\s+/g, '');
  const signals = getCompanySignals(companyName, domain);

  if (domain && compactHaystack.includes(compactIdentity(domain))) return true;
  if (signals.exactCompacts.some((signal) => compactHaystack.includes(signal))) return true;

  const tokenMatches = signals.tokens.filter((token) => haystack.includes(token));
  if (tokenMatches.some((token) => token.length >= 8)) return true;
  return tokenMatches.length >= 2;
}

function stripHtmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

async function safeFetchText(url: string, timeoutMs = 12000): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (1Person Knowledge Crawl)' },
      signal: AbortSignal.timeout(timeoutMs),
      redirect: 'follow',
    });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

async function fetchReadableText(url: string): Promise<string | null> {
  const readerText = await safeFetchText(`https://r.jina.ai/${url}`, 9000);
  if (readerText && readerText.trim().length > 80) {
    return readerText.slice(0, VERIFY_TEXT_MAX_CHARS);
  }

  const html = await safeFetchText(url, 8000);
  if (!html) return null;
  const text = stripHtmlToText(html);
  return text ? text.slice(0, VERIFY_TEXT_MAX_CHARS) : null;
}

async function verifyExternalCandidate(
  candidate: CandidateSource,
  companyName: string,
  domain: string | null,
): Promise<CandidateSource | null> {
  if (candidate.type === 'official_website') return candidate;
  if (isLowValueDiscoveryUrl(candidate.url)) return null;

  const quickText = `${candidate.title}\n${candidate.snippet ?? ''}\n${candidate.url}`;
  const quickMatch = hasStrongIdentityMention(quickText, companyName, domain);
  const confidence = confidenceFor(candidate, companyName, domain);

  // Exact brand/domain mention in the search result is good enough to show,
  // and avoids slow fetches for already-clear mentions.
  if (quickMatch && confidence >= 0.72) return candidate;

  if (!isRelevantExternalCandidate(candidate, companyName, domain) || confidence < MIN_EXTERNAL_CONFIDENCE) {
    return null;
  }

  const pageText = await fetchReadableText(candidate.url);
  if (!pageText) return null;

  const combined = `${quickText}\n${pageText}`;
  if (!hasStrongIdentityMention(combined, companyName, domain)) return null;

  return {
    ...candidate,
    snippet: candidate.snippet || cleanText(pageText).slice(0, 260),
  };
}

async function getCompanyWebsite(companyId: string): Promise<{
  company: typeof companies.$inferSelect;
  websiteUrl: string | null;
}> {
  const company = await db.query.companies.findFirst({
    where: eq(companies.id, companyId),
  });
  if (!company) throw new Error('Company not found');

  const brand = await db.query.brandIdentities.findFirst({
    where: eq(brandIdentities.companyId, companyId),
    columns: { extractedFromUrl: true },
  });

  const settings = (company.settings ?? {}) as Record<string, any>;
  const websiteUrl = normalizeUrl(
    settings.websiteUrl
      || settings.wordpress?.siteUrl
      || brand?.extractedFromUrl
      || '',
  );

  return { company, websiteUrl };
}

async function discoverOfficialPages(websiteUrl: string): Promise<CandidateSource[]> {
  const candidates: CandidateSource[] = [];
  const crawler = new CrawlerAgent();
  const ctx: any = {
    companyId: 'knowledge-crawl',
    executionId: 'knowledge-crawl',
    memory: { store: async () => '', recall: async () => [], storeKnowledge: async () => '', recallKnowledge: async () => [] },
  };

  const result = await crawler.execute({ url: websiteUrl }, ctx);
  if (result.success) {
    const data = result.data as unknown as CrawlResult & { html?: string };
    candidates.push({
      title: data.title || new URL(websiteUrl).hostname,
      url: websiteUrl,
      snippet: data.metaDescription || data.h1?.[0] || 'Official website homepage',
      type: 'official_website',
      sourceLabel: 'Official site',
    });

    const usefulLinks = (data.navLinks || [])
      .map((link) => ({
        text: cleanText(link.text),
        url: sameHostOrPath(websiteUrl, link.href),
      }))
      .filter((link): link is { text: string; url: string } => !!link.url && link.text.length > 1)
      .filter((link) => {
        const value = `${link.text} ${link.url}`.toLowerCase();
        return /(about|service|product|program|course|blog|news|case|customer|pricing|contact|faq)/.test(value);
      });

    for (const link of usefulLinks.slice(0, 8)) {
      candidates.push({
        title: link.text,
        url: link.url,
        snippet: 'Important page found on the official website.',
        type: 'official_website',
        sourceLabel: 'Official site',
      });
    }
  } else {
    candidates.push({
      title: new URL(websiteUrl).hostname,
      url: websiteUrl,
      snippet: 'Official website URL saved on the company profile.',
      type: 'official_website',
      sourceLabel: 'Official site',
    });
  }

  const origin = new URL(websiteUrl).origin;
  const sitemap = await safeFetchText(`${origin}/sitemap.xml`, 8000);
  if (sitemap) {
    const urls = Array.from(sitemap.matchAll(/<loc>([\s\S]*?)<\/loc>/g))
      .map((match) => normalizeUrl(cleanText(match[1])))
      .filter((url): url is string => !!url)
      .filter((url) => sameHostOrPath(websiteUrl, url));
    for (const url of urls.slice(0, 10)) {
      candidates.push({
        title: url.replace(origin, '').replace(/^\/?/, '/') || new URL(websiteUrl).hostname,
        url,
        snippet: 'Page found in the official website sitemap.',
        type: 'official_website',
        sourceLabel: 'Sitemap',
      });
    }
  }

  return candidates;
}

async function fetchGoogleNewsCandidates(query: string): Promise<CandidateSource[]> {
  const rssUrl = `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=en-US&gl=US&ceid=US:en`;
  const xml = await safeFetchText(rssUrl, 12000);
  if (!xml) return [];

  const candidates: CandidateSource[] = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/g;
  let match: RegExpExecArray | null;
  while ((match = itemRegex.exec(xml)) && candidates.length < 8) {
    const body = match[1] ?? '';
    const title = cleanText(body.match(/<title>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/)?.[1]);
    const link = cleanText(body.match(/<link>([\s\S]*?)<\/link>/)?.[1]);
    const description = cleanText(body.match(/<description>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/description>/)?.[1]);
    const sourceName = cleanText(body.match(/<source[^>]*>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/source>/)?.[1]);
    if (!title || !link) continue;
    candidates.push({
      title,
      url: link,
      snippet: description || 'Public news mention found from Google News.',
      type: inferType(title, link, 'news'),
      sourceLabel: sourceName ? `Google News - ${sourceName}` : 'Google News',
    });
  }
  return candidates;
}

async function resolveSerpApiKey(): Promise<string | null> {
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
    // Env fallback below keeps this feature usable without admin config.
  }
  return process.env.SERPAPI_KEY?.trim() || null;
}

async function fetchSerpApiCandidates(query: string): Promise<CandidateSource[]> {
  const apiKey = await resolveSerpApiKey();
  if (!apiKey) return [];

  const params = new URLSearchParams({
    q: query,
    api_key: apiKey,
    num: '6',
    engine: 'google',
  });
  const res = await fetch(`https://serpapi.com/search?${params.toString()}`, {
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) return [];
  const data: any = await res.json().catch(() => null);
  const organic = Array.isArray(data?.organic_results) ? data.organic_results : [];
  return organic.slice(0, 6).map((item: any) => {
    const title = cleanText(item.title);
    const url = cleanText(item.link);
    return {
      title,
      url,
      snippet: cleanText(item.snippet) || 'Public web result found by search.',
      type: inferType(title, url, 'web'),
      sourceLabel: 'Web search',
    };
  }).filter((item: CandidateSource) => item.title && normalizeUrl(item.url));
}

export async function discoverKnowledgeCrawlData(companyId: string): Promise<CrawlDiscoveryResult> {
  const { company, websiteUrl } = await getCompanyWebsite(companyId);
  const domain = getDomain(websiteUrl);
  const warnings: string[] = [];
  const candidates: CandidateSource[] = [];

  if (websiteUrl) {
    candidates.push(...await discoverOfficialPages(websiteUrl));
  } else {
    warnings.push('No company website was found. Add a website in Company/Brand IQ to improve crawl results.');
  }

  const exactCompany = `"${company.name}"`;
  const exactDomain = domain ? `"${domain}"` : '';
  const searchQueries = Array.from(new Set([
    exactDomain || exactCompany,
    exactCompany,
    domain ? `${exactCompany} ${exactDomain}` : exactCompany,
    domain ? `${exactCompany} -site:${domain}` : exactCompany,
    domain ? `${exactDomain} news OR article OR blog OR wiki` : `${exactCompany} news OR article OR blog OR wiki`,
  ].filter(Boolean)));

  const publicResults = await Promise.allSettled([
    ...searchQueries.slice(0, 3).map((query) => fetchGoogleNewsCandidates(query)),
    ...searchQueries.map((query) => fetchSerpApiCandidates(query)),
  ]);
  for (const result of publicResults) {
    if (result.status === 'fulfilled') candidates.push(...result.value);
  }

  if (!await resolveSerpApiKey()) {
    warnings.push('Public web search is running in limited mode. Add SERPAPI_KEY for broader Google result discovery.');
  }

  const existingDocs = await db
    .select({ sourceUrl: documents.sourceUrl })
    .from(documents)
    .where(eq(documents.companyId, companyId));
  const existingUrls = new Set(existingDocs.map((doc) => normalizeUrl(doc.sourceUrl || '')).filter(Boolean));

  const seen = new Set<string>();
  const uniqueCandidates: CandidateSource[] = [];
  for (const candidate of candidates) {
    const url = normalizeUrl(candidate.url);
    if (!url || seen.has(url) || isLowValueDiscoveryUrl(url)) continue;
    seen.add(url);
    uniqueCandidates.push({ ...candidate, url });
  }

  const officialCandidates = uniqueCandidates.filter((candidate) => candidate.type === 'official_website');
  const externalCandidates = uniqueCandidates.filter((candidate) => candidate.type !== 'official_website');
  const verifiedExternal = (await Promise.allSettled(
    externalCandidates
      .slice(0, MAX_EXTERNAL_VERIFY_CANDIDATES)
      .map((candidate) => verifyExternalCandidate(candidate, company.name, domain)),
  ))
    .flatMap((result) => result.status === 'fulfilled' && result.value ? [result.value] : []);

  const sources: CrawlDiscoverySource[] = [];
  for (const candidate of [...officialCandidates, ...verifiedExternal]) {
    const url = normalizeUrl(candidate.url);
    if (!url) continue;
    const confidence = confidenceFor({ ...candidate, url }, company.name, domain);
    const type = candidate.type === 'web' ? inferType(candidate.title, url, 'web') : candidate.type;
    if (
      type !== 'official_website'
      && (!isRelevantExternalCandidate({ ...candidate, url, type }, company.name, domain)
        || confidence < MIN_EXTERNAL_CONFIDENCE)
    ) {
      continue;
    }
    const alreadyAdded = existingUrls.has(url);
    sources.push({
      id: Buffer.from(url).toString('base64url').slice(0, 32),
      title: candidate.title || getDomain(url) || url,
      url,
      snippet: candidate.snippet || '',
      type,
      sourceLabel: candidate.sourceLabel,
      confidence,
      selectedByDefault: false,
      alreadyAdded,
    });
  }

  sources.sort((a, b) => {
    if (a.alreadyAdded !== b.alreadyAdded) return a.alreadyAdded ? 1 : -1;
    return b.confidence - a.confidence;
  });

  return {
    company: {
      id: company.id,
      name: company.name,
      websiteUrl,
      domain,
    },
    sources: sources.slice(0, MAX_SOURCES),
    warnings,
    searchedAt: new Date().toISOString(),
  };
}
