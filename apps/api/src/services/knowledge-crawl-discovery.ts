import { desc, eq } from 'drizzle-orm';
import { db } from '../lib/db';
import { brandIdentities, brandIqProfiles, companies, documents } from '@1person/core/db';
import { buildContentLanguageInstruction, normalizeContentLanguage, type ContentLanguage } from '../lib/language';
import { extractJSON, llmGenerate } from '../lib/llm';
import {
  analyzeDiscoveryTopic,
  cleanDiscoveryText as cleanText,
  type DiscoveryTopicPlan,
  discoverGoogleNewsSources,
  discoverPublicWebSources,
  discoverWebsiteSources,
  fetchReadableText,
  getDiscoveryDomain as getDomain,
  inferDiscoveryType as inferType,
  isSocialProfileUrl,
  isSameDiscoveryDomain as isSameDomain,
  normalizeDiscoveryUrl as normalizeUrl,
} from './public-discovery';

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
  searchFocus: {
    query: string | null;
    targetUrl: string | null;
    domain: string | null;
    mode: 'public_google' | 'website';
  };
  sources: CrawlDiscoverySource[];
  warnings: string[];
  searchedAt: string;
}

export interface CrawlDiscoveryOptions {
  query?: string | null;
  websiteUrl?: string | null;
  language?: string | null;
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
const MAX_EXTERNAL_VERIFY_CANDIDATES = 28;
const VERIFY_TEXT_MAX_CHARS = 9000;
const GENERIC_NAME_TOKENS = new Set([
  'the', 'and', 'for', 'with', 'company', 'business', 'school', 'academy',
  'hub', 'center', 'centre', 'kid', 'kids', 'leader', 'leaders', 'global',
  'vietnam', 'online', 'official',
]);

async function localizeCrawlSources(
  sources: CrawlDiscoverySource[],
  language: ContentLanguage,
): Promise<CrawlDiscoverySource[]> {
  if (language === 'en' || sources.length === 0) return sources;

  const prompt = `${buildContentLanguageInstruction(language)}

Translate the user-facing crawl result cards into the selected language.
Preserve URLs, company names, brand names, product names, personal names, platform names, and proper nouns.
Do not add facts, do not change confidence values, and do not invent source details.

Return ONLY valid JSON:
{"items":[{"id":"same id","title":"localized title","snippet":"localized snippet","sourceLabel":"localized label"}]}

Items:
${sources.map((source) => JSON.stringify({
    id: source.id,
    title: source.title,
    snippet: source.snippet,
    sourceLabel: source.sourceLabel,
    url: source.url,
  })).join('\n')}`;

  try {
    const { text } = await llmGenerate(
      [{ role: 'user', content: prompt }],
      { featureKey: 'knowledge_crawl_localize', maxTokens: 2600 },
    );
    const parsed = extractJSON(text) as { items?: Array<Record<string, unknown>> } | null;
    const items = Array.isArray(parsed?.items) ? parsed.items : [];
    const byId = new Map(items.map((item) => [cleanText(item.id), item]));

    return sources.map((source) => {
      const localized = byId.get(source.id);
      if (!localized) return source;
      return {
        ...source,
        title: cleanText(localized.title).slice(0, 180) || source.title,
        snippet: cleanText(localized.snippet).slice(0, 360) || source.snippet,
        sourceLabel: cleanText(localized.sourceLabel).slice(0, 120) || source.sourceLabel,
      };
    });
  } catch (err) {
    console.warn('[knowledge-crawl] Source localization failed, using original crawl output:', err);
    return sources;
  }
}

function parseDiscoveryFocus(rawQuery: string | null | undefined, rawWebsiteUrl?: string | null): {
  query: string | null;
  targetUrl: string | null;
  domain: string | null;
  mode: 'public_google' | 'website';
} {
  const query = cleanText(rawQuery).slice(0, 180) || null;
  const targetUrl = normalizeUrl(cleanText(rawWebsiteUrl || ''));

  if (targetUrl) {
    return {
      query,
      targetUrl,
      domain: getDomain(targetUrl),
      mode: 'website',
    };
  }

  return {
    query,
    targetUrl: null,
    domain: null,
    mode: 'public_google',
  };
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
  if (candidate.type === 'profile' || isSocialProfileUrl(candidate.url)) score += 0.1;
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

async function verifyExternalCandidate(
  candidate: CandidateSource,
  identityName: string,
  domain: string | null,
  topic: string | null,
): Promise<CandidateSource | null> {
  if (candidate.type === 'official_website') return candidate;
  if (isLowValueDiscoveryUrl(candidate.url)) return null;

  const quickText = `${candidate.title}\n${candidate.snippet ?? ''}\n${candidate.url}`;
  const identityMatch = hasStrongIdentityMention(quickText, identityName, domain);
  const topicMatch = topic ? hasStrongIdentityMention(quickText, topic, null) : false;
  const confidence = confidenceFor(candidate, identityName, domain);

  // Exact brand/domain mention in the search result is good enough to show,
  // and avoids slow fetches for already-clear mentions.
  if ((identityMatch || topicMatch) && confidence >= 0.72) return candidate;

  if (!isRelevantExternalCandidate(candidate, identityName, domain) || confidence < MIN_EXTERNAL_CONFIDENCE) {
    return null;
  }

  const pageText = await fetchReadableText(candidate.url, VERIFY_TEXT_MAX_CHARS);
  if (!pageText) return null;

  const combined = `${quickText}\n${pageText}`;
  if (
    !hasStrongIdentityMention(combined, identityName, domain)
    && !(topic && hasStrongIdentityMention(combined, topic, null))
  ) {
    return null;
  }

  return {
    ...candidate,
    snippet: candidate.snippet || cleanText(pageText).slice(0, 260),
  };
}

function buildPublicDiscoveryQueries(args: {
  companyName: string;
  domain: string | null;
  industry: string | null;
  topic: string | null;
  topicPlan?: DiscoveryTopicPlan | null;
}) {
  const companyName = cleanText(args.companyName);
  const domain = args.domain ? cleanText(args.domain) : '';
  const topic = args.topic ? cleanText(args.topic) : '';
  const industry = args.industry ? cleanText(args.industry) : '';
  const quotedCompany = companyName ? `"${companyName}"` : '';
  const quotedDomain = domain ? `"${domain}"` : '';
  const topicPart = topic || industry;
  const topicHints = [
    topic,
    args.topicPlan?.intent,
    ...(args.topicPlan?.keywords || []),
    ...(args.topicPlan?.phrases || []),
    ...(args.topicPlan?.slugs || []),
  ]
    .map((value) => cleanText(value))
    .filter(Boolean)
    .slice(0, 8);
  const focusedTopic = topicHints.length ? topicHints.join(' OR ') : topicPart;

  // Split into intent buckets so we can surface a healthy mix of official
  // profiles, mentions, articles, and broader public pages without trusting
  // one noisy search query too much.
  const social = [
    `${quotedCompany} ${quotedDomain} facebook OR linkedin OR instagram OR youtube OR tiktok`,
    `${quotedCompany} site:facebook.com OR site:linkedin.com/company OR site:instagram.com`,
    domain ? `${quotedDomain} facebook OR linkedin OR instagram OR youtube OR tiktok` : '',
  ];
  const articles = [
    `${quotedCompany} ${quotedDomain} news OR article OR blog OR wiki`,
    focusedTopic ? `${quotedCompany} ${focusedTopic} news OR blog OR article` : '',
    domain ? `${quotedDomain} news OR article OR blog` : '',
  ];
  const web = [
    `${quotedCompany} ${quotedDomain}`,
    focusedTopic ? `${quotedCompany} ${focusedTopic}` : '',
    domain ? `${quotedDomain}` : '',
  ];

  const normalizeList = (values: string[]) => Array.from(new Set(
    values.map((value) => cleanText(value)).filter((value) => value.length > 0),
  ));

  return {
    social: normalizeList(social),
    articles: normalizeList(articles),
    web: normalizeList(web),
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
  const brandIq = await db.query.brandIqProfiles.findFirst({
    where: eq(brandIqProfiles.companyId, companyId),
    columns: { sourceUrl: true, isActive: true, version: true },
    orderBy: [desc(brandIqProfiles.isActive), desc(brandIqProfiles.version)],
  });
  const urlDocuments = await db
    .select({ sourceUrl: documents.sourceUrl })
    .from(documents)
    .where(eq(documents.companyId, companyId))
    .orderBy(desc(documents.updatedAt))
    .limit(20);

  const settings = (company.settings ?? {}) as Record<string, any>;
  const websiteUrl = [
    settings.websiteUrl,
    settings.wordpress?.siteUrl,
    brandIq?.sourceUrl,
    brand?.extractedFromUrl,
    ...urlDocuments.map((doc) => doc.sourceUrl),
  ]
    .map((url) => normalizeUrl(url || ''))
    .find(Boolean) || null;

  return { company, websiteUrl };
}

export async function discoverKnowledgeCrawlData(
  companyId: string,
  options: CrawlDiscoveryOptions = {},
): Promise<CrawlDiscoveryResult> {
  const { company, websiteUrl } = await getCompanyWebsite(companyId);
  const domain = getDomain(websiteUrl);
  const focus = parseDiscoveryFocus(options.query, options.websiteUrl);
  const identityName = company.name || focus.query || 'Business';
  const topic = focus.query;
  const relevanceDomain = focus.domain || domain;
  const language = normalizeContentLanguage(
    options.language ?? (company.settings as Record<string, unknown> | null | undefined)?.language,
  );
  const topicPlan = !focus.targetUrl && topic
    ? await analyzeDiscoveryTopic({
      topic,
      websiteUrl,
      companyName: company.name,
      industry: company.industry,
      language,
    })
    : null;
  const warnings: string[] = [];
  const candidates: CandidateSource[] = [];

  if (focus.targetUrl) {
    candidates.push(...await discoverWebsiteSources({
      websiteUrl: focus.targetUrl,
      topic: focus.query,
      language,
    }));
  }

  if (!focus.targetUrl) {
    if (websiteUrl) {
      candidates.push({
        title: company.name || getDomain(websiteUrl) || websiteUrl,
        url: websiteUrl,
        snippet: topic
          ? `Saved company website from Brand IQ/company profile. Use it as the official source for "${topic}".`
          : 'Saved company website from Brand IQ/company profile.',
        type: 'official_website',
        sourceLabel: 'Official website',
      });
    }

    const searchQueries = buildPublicDiscoveryQueries({
      companyName: identityName,
      domain: relevanceDomain,
      industry: company.industry,
      topic,
      topicPlan,
    });

    const publicResults = await Promise.allSettled([
      ...searchQueries.articles.slice(0, 4).map((query) => discoverGoogleNewsSources(query, 6, language)),
      ...searchQueries.social.slice(0, 3).map((query) => discoverPublicWebSources(query, 8, language)),
      ...searchQueries.web.slice(0, 3).map((query) => discoverPublicWebSources(query, 8, language)),
    ]);
    for (const result of publicResults) {
      if (result.status === 'fulfilled') candidates.push(...result.value);
    }
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
      .map((candidate) => verifyExternalCandidate(candidate, identityName, relevanceDomain, topic)),
  ))
    .flatMap((result) => result.status === 'fulfilled' && result.value ? [result.value] : []);

  const sources: CrawlDiscoverySource[] = [];
  for (const candidate of [...officialCandidates, ...verifiedExternal]) {
    const url = normalizeUrl(candidate.url);
    if (!url) continue;
    const confidence = confidenceFor({ ...candidate, url }, identityName, relevanceDomain);
    const type = candidate.type === 'web' ? inferType(candidate.title, url, 'web') : candidate.type;
    if (
      type !== 'official_website'
      && (!isRelevantExternalCandidate({ ...candidate, url, type }, identityName, relevanceDomain)
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
  const localizedSources = await localizeCrawlSources(sources.slice(0, MAX_SOURCES), language);

  return {
    company: {
      id: company.id,
      name: company.name,
      websiteUrl,
      domain,
    },
    searchFocus: focus,
    sources: localizedSources,
    warnings,
    searchedAt: new Date().toISOString(),
  };
}
