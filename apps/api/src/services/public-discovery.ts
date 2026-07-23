import { CrawlerAgent, type CrawlResult } from '../agents/crawler-agent';
import { extractJSON, llmGenerate } from '../lib/llm';
import { buildContentLanguageInstruction, normalizeContentLanguage, type ContentLanguage } from '../lib/language';

export type PublicDiscoverySourceType =
  | 'official_website'
  | 'news'
  | 'blog'
  | 'profile'
  | 'review'
  | 'web';

export interface PublicDiscoverySource {
  title: string;
  url: string;
  snippet: string;
  type: PublicDiscoverySourceType;
  sourceLabel: string;
}

type DiscoveryLabelKey =
  | 'officialSite'
  | 'likelyPage'
  | 'sitemap'
  | 'googleNews'
  | 'socialProfile'
  | 'publicWeb'
  | 'websiteProvided'
  | 'websitePageFound'
  | 'sitemapPageFound'
  | 'newsMentionFound'
  | 'publicWebFound';

const DISCOVERY_LABELS: Record<ContentLanguage, Record<DiscoveryLabelKey, string>> = {
  en: {
    officialSite: 'Official site',
    likelyPage: 'Likely page',
    sitemap: 'Sitemap',
    googleNews: 'Google News',
    socialProfile: 'Social profile',
    publicWeb: 'Public web',
    websiteProvided: 'Website URL provided for crawling.',
    websitePageFound: 'Important page found on the website.',
    sitemapPageFound: 'Page found in the website sitemap.',
    newsMentionFound: 'Public news mention found from Google News.',
    publicWebFound: 'Public web result found from free web discovery.',
  },
  vi: {
    officialSite: 'Website chính thức',
    likelyPage: 'Trang liên quan',
    sitemap: 'Sitemap',
    googleNews: 'Google News',
    socialProfile: 'Hồ sơ mạng xã hội',
    publicWeb: 'Web công khai',
    websiteProvided: 'URL website được nhập để crawl.',
    websitePageFound: 'Trang quan trọng được tìm thấy trong website.',
    sitemapPageFound: 'Trang được tìm thấy trong sitemap của website.',
    newsMentionFound: 'Tin tức công khai được tìm thấy từ Google News.',
    publicWebFound: 'Kết quả web công khai được tìm thấy bằng cơ chế tìm kiếm miễn phí.',
  },
  ja: {
    officialSite: '公式サイト',
    likelyPage: '関連ページ候補',
    sitemap: 'サイトマップ',
    googleNews: 'Googleニュース',
    socialProfile: 'SNSプロフィール',
    publicWeb: '公開Web',
    websiteProvided: 'クロール対象として入力されたWebサイトURLです。',
    websitePageFound: 'Webサイト内で見つかった重要なページです。',
    sitemapPageFound: 'サイトマップで見つかったページです。',
    newsMentionFound: 'Googleニュースで見つかった公開ニュースです。',
    publicWebFound: '無料の公開Web検索で見つかった結果です。',
  },
};

function discoveryLabel(language: unknown, key: DiscoveryLabelKey): string {
  const lang = normalizeContentLanguage(language);
  return DISCOVERY_LABELS[lang][key] || DISCOVERY_LABELS.en[key];
}

export interface TopicCoverageResult {
  url: string;
  title: string;
  snippet: string;
  entities_extracted: string[];
}

export interface DiscoveryTopicPlan {
  original: string;
  intent: string;
  keywords: string[];
  phrases: string[];
  slugs: string[];
  likelyPaths: string[];
}

const SITE_PAGE_HINTS = /(about|service|product|program|course|blog|news|case|customer|pricing|contact|faq|career|careers|job|jobs|recruit|recruitment|hiring|vacancy|join-us|work-with-us|tuyen-dung|viec-lam|ung-tuyen)/;
const SOCIAL_PROFILE_HOSTS = [
  'facebook.com',
  'linkedin.com',
  'instagram.com',
  'youtube.com',
  'tiktok.com',
  'x.com',
  'twitter.com',
  'threads.net',
];

export function cleanDiscoveryText(value: unknown): string {
  return String(value ?? '')
    .replace(/\s+/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();
}

function normalizeDiscoverySearchText(value: unknown): string {
  return cleanDiscoveryText(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[đĐ]/g, 'd')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function topicSearchTerms(topic: string | null): string[] {
  const normalized = normalizeDiscoverySearchText(topic);
  if (!normalized) return [];

  const terms = normalized
    .split(/\s+/)
    .filter((term) => term.length >= 3)
    .slice(0, 10);

  const phrases = [normalized];
  const compact = normalized.replace(/\s+/g, '');
  if (compact.length >= 5) phrases.push(compact);

  const isRecruitingIntent = [
    'tuyen dung',
    'tuyendung',
    'viec lam',
    'vieclam',
    'ung tuyen',
    'ungtuyen',
    'career',
    'careers',
    'job',
    'jobs',
    'recruit',
    'recruitment',
    'hiring',
  ].some((signal) => normalized.includes(signal) || compact.includes(signal.replace(/\s+/g, '')));

  if (isRecruitingIntent) {
    phrases.push(
      'tuyen dung',
      'tuyendung',
      'viec lam',
      'vieclam',
      'ung tuyen',
      'ungtuyen',
      'career',
      'careers',
      'job',
      'jobs',
      'recruit',
      'recruitment',
      'hiring',
      'vacancy',
      'vacancies',
      'join us',
      'joinus',
      'work with us',
      'workwithus',
      'nhan su',
      'nhansu',
    );
  }

  return Array.from(new Set([...phrases, ...terms]));
}

function normalizeExpandedDiscoveryText(value: unknown): string {
  return cleanDiscoveryText(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[\u0111\u0110]/g, 'd')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function slugifyDiscoveryTerm(value: string): string {
  return normalizeExpandedDiscoveryText(value).replace(/\s+/g, '-');
}

function compactDiscoveryTerm(value: string): string {
  return normalizeExpandedDiscoveryText(value).replace(/\s+/g, '');
}

function sanitizeTopicValues(value: unknown, max = 12): string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const items: string[] = [];
  for (const raw of value) {
    const item = cleanDiscoveryText(raw).slice(0, 80);
    const key = normalizeExpandedDiscoveryText(item);
    if (!item || !key || seen.has(key)) continue;
    seen.add(key);
    items.push(item);
    if (items.length >= max) break;
  }
  return items;
}

function buildFallbackTopicPlan(topic: string | null): DiscoveryTopicPlan | null {
  const normalized = normalizeExpandedDiscoveryText(topic);
  if (!normalized) return null;

  const words = normalized
    .split(/\s+/)
    .filter((word) => word.length >= 3)
    .slice(0, 10);
  const compact = normalized.replace(/\s+/g, '');
  const slugs = Array.from(new Set([
    slugifyDiscoveryTerm(normalized),
    compact,
    ...words,
  ].filter((value) => value.length >= 3)));

  return {
    original: cleanDiscoveryText(topic),
    intent: normalized,
    keywords: Array.from(new Set([normalized, compact, ...words])).filter(Boolean).slice(0, 14),
    phrases: Array.from(new Set([cleanDiscoveryText(topic), normalized, compact])).filter(Boolean).slice(0, 14),
    slugs: slugs.slice(0, 16),
    likelyPaths: slugs.slice(0, 12).map((slug) => `/${slug}`),
  };
}

export async function analyzeDiscoveryTopic(args: {
  topic?: string | null;
  websiteUrl?: string | null;
  companyName?: string | null;
  industry?: string | null;
  language?: string | null;
}): Promise<DiscoveryTopicPlan | null> {
  const topic = cleanDiscoveryText(args.topic);
  if (!topic) return null;
  const fallback = buildFallbackTopicPlan(topic);

  const prompt = `You help a website crawler understand what the user wants to find.
${buildContentLanguageInstruction(args.language)}

User crawl request: "${topic}"
Website URL: ${args.websiteUrl || '(not provided)'}
Company: ${args.companyName || '(unknown)'}
Industry: ${args.industry || '(unknown)'}

Return ONLY valid JSON with this exact shape:
{
  "intent": "short intent label",
  "keywords": ["5-12 focused keywords or synonyms"],
  "phrases": ["5-12 exact phrases likely to appear in page titles or content"],
  "slugs": ["5-12 URL slug variants without leading slash"],
  "likelyPaths": ["/path-variant", "/another-path"]
}

Rules:
- Stay tightly focused on the user's request. Do not broaden into unrelated business topics.
- Include the original language and likely English/Vietnamese website wording when useful.
- Include no-accent variants and URL slug variants.
- If the request is a product/service/content/policy/pricing/contact/team/news topic, produce variants for that topic.
- Write intent, keywords, and phrases in the selected output language when they are user-facing. Keep slugs and likelyPaths URL-safe.
- Do not invent company facts. This is only for crawl keyword expansion.`;

  try {
    const { text } = await llmGenerate(
      [{ role: 'user', content: prompt }],
      { featureKey: 'knowledge_crawl_topic_expand', maxTokens: 900 },
    );
    const parsed = extractJSON(text) as Record<string, unknown> | null;
    if (!parsed || typeof parsed !== 'object') return fallback;

    const keywords = sanitizeTopicValues(parsed.keywords);
    const phrases = sanitizeTopicValues(parsed.phrases);
    const slugs = sanitizeTopicValues(parsed.slugs).map(slugifyDiscoveryTerm).filter(Boolean);
    const likelyPaths = sanitizeTopicValues(parsed.likelyPaths)
      .map((path) => {
        const cleaned = cleanDiscoveryText(path);
        if (!cleaned) return '';
        return cleaned.startsWith('/') ? cleaned : `/${slugifyDiscoveryTerm(cleaned)}`;
      })
      .filter(Boolean);

    return {
      original: topic,
      intent: cleanDiscoveryText(parsed.intent).slice(0, 80) || fallback?.intent || topic,
      keywords: Array.from(new Set([...(fallback?.keywords || []), ...keywords])).slice(0, 18),
      phrases: Array.from(new Set([...(fallback?.phrases || []), ...phrases])).slice(0, 18),
      slugs: Array.from(new Set([...(fallback?.slugs || []), ...slugs])).slice(0, 18),
      likelyPaths: Array.from(new Set([...(fallback?.likelyPaths || []), ...likelyPaths])).slice(0, 18),
    };
  } catch (err) {
    console.warn('[public-discovery] Topic expansion failed, using fallback:', err);
    return fallback;
  }
}

function expandedTopicSearchTerms(topic: string | null, plan?: DiscoveryTopicPlan | null): string[] {
  const fallback = buildFallbackTopicPlan(topic);
  const values = [
    topic,
    fallback?.intent,
    ...(fallback?.keywords || []),
    ...(fallback?.phrases || []),
    ...(fallback?.slugs || []),
    plan?.intent,
    ...(plan?.keywords || []),
    ...(plan?.phrases || []),
    ...(plan?.slugs || []),
    ...(plan?.likelyPaths || []),
  ];

  const terms = values
    .flatMap((value) => {
      const normalized = normalizeExpandedDiscoveryText(value);
      if (!normalized) return [];
      const compact = compactDiscoveryTerm(normalized);
      return [
        normalized,
        compact.length >= 5 ? compact : '',
        slugifyDiscoveryTerm(normalized),
        ...normalized.split(/\s+/).filter((word) => word.length >= 3),
      ];
    })
    .filter(Boolean);

  return Array.from(new Set(terms)).slice(0, 40);
}

export function normalizeDiscoveryUrl(value: string): string | null {
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

export function getDiscoveryDomain(value: string | null): string | null {
  if (!value) return null;
  try {
    return new URL(value).hostname.replace(/^www\./, '');
  } catch {
    return null;
  }
}

export function isSocialProfileUrl(value: string): boolean {
  try {
    const host = new URL(value).hostname.replace(/^www\./, '');
    return SOCIAL_PROFILE_HOSTS.some((domain) => host === domain || host.endsWith(`.${domain}`));
  } catch {
    return false;
  }
}

export function sameHostOrPath(baseUrl: string, href: string): string | null {
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

export function isSameDiscoveryDomain(url: string, domain: string | null): boolean {
  if (!domain) return false;
  try {
    return new URL(url).hostname.replace(/^www\./, '') === domain;
  } catch {
    return false;
  }
}

export function inferDiscoveryType(
  title: string,
  url: string,
  fallback: PublicDiscoverySourceType,
): PublicDiscoverySourceType {
  const haystack = `${title} ${url}`.toLowerCase();
  if (isSocialProfileUrl(url)) return 'profile';
  if (/\b(blog|article|insight|guide|story)\b/.test(haystack)) return 'blog';
  if (/\b(news|press|media|announcement)\b/.test(haystack)) return 'news';
  if (/\b(review|rating|testimonial)\b/.test(haystack)) return 'review';
  if (/\b(wiki|profile|linkedin|facebook|crunchbase|directory)\b/.test(haystack)) return 'profile';
  return fallback;
}

function decodeDiscoveryHtml(value: string): string {
  return cleanDiscoveryText(value)
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&apos;/g, "'");
}

function normalizeSearchResultUrl(rawHref: string): string | null {
  const href = decodeDiscoveryHtml(rawHref);
  if (!href) return null;

  try {
    const url = new URL(href, 'https://duckduckgo.com');
    const duckDuckGoRedirect = url.searchParams.get('uddg');
    if (duckDuckGoRedirect) return normalizeDiscoveryUrl(decodeURIComponent(duckDuckGoRedirect));
    return normalizeDiscoveryUrl(url.toString());
  } catch {
    return normalizeDiscoveryUrl(href);
  }
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

function isReadableErrorResponse(text: string): boolean {
  const normalized = normalizeExpandedDiscoveryText(text.slice(0, 1200));
  return /\btarget url returned error (4\d\d|5\d\d)\b/i.test(text)
    || /\bwarning target url returned error (4\d\d|5\d\d)\b/i.test(normalized);
}

function isLikelyNotFoundPage(title: string, text: string): boolean {
  const normalizedTitle = normalizeExpandedDiscoveryText(title);
  const normalizedText = normalizeExpandedDiscoveryText(text.slice(0, 1500));
  return [
    '404',
    'page not found',
    'not found',
    'khong tim thay',
    'khong tim thay trang',
    'trang khong ton tai',
  ].some((signal) => normalizedTitle.includes(signal) || normalizedText.includes(signal));
}

export async function safeFetchText(url: string, timeoutMs = 12000): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (1Person PublicDiscovery)' },
      signal: AbortSignal.timeout(timeoutMs),
      redirect: 'follow',
    });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

export async function fetchReadableText(url: string, maxChars = 9000): Promise<string | null> {
  const readerText = await safeFetchText(`https://r.jina.ai/${url}`, 9000);
  if (readerText && readerText.trim().length > 80 && !isReadableErrorResponse(readerText)) {
    return readerText.slice(0, maxChars);
  }

  const html = await safeFetchText(url, 8000);
  if (!html) return null;
  const text = stripHtmlToText(html);
  return text ? text.slice(0, maxChars) : null;
}

function topicMatches(value: string, topic: string | null, plan?: DiscoveryTopicPlan | null): boolean {
  const terms = expandedTopicSearchTerms(topic, plan);
  if (terms.length === 0) return true;
  const haystack = normalizeExpandedDiscoveryText(value);
  const compactHaystack = haystack.replace(/\s+/g, '');
  return terms.some((term) => {
    const normalizedTerm = normalizeExpandedDiscoveryText(term);
    if (!normalizedTerm) return false;
    return haystack.includes(normalizedTerm) || compactHaystack.includes(normalizedTerm.replace(/\s+/g, ''));
  });
}

function likelyTopicPaths(topic: string | null, plan?: DiscoveryTopicPlan | null): string[] {
  const terms = expandedTopicSearchTerms(topic, plan);
  if (terms.length === 0) return [];
  const normalized = normalizeExpandedDiscoveryText(topic);
  const compact = normalized.replace(/\s+/g, '-');
  const paths = [
    compact ? `/${compact}` : '',
    ...(plan?.likelyPaths || []),
    ...(plan?.slugs || []).map((slug) => `/${slugifyDiscoveryTerm(slug)}`),
  ].filter(Boolean);

  const isRecruitingIntent = terms.some((term) =>
    ['tuyen dung', 'tuyendung', 'viec lam', 'vieclam', 'career', 'careers', 'job', 'jobs', 'recruitment', 'hiring']
      .includes(term),
  );
  if (isRecruitingIntent) {
    paths.push(
      '/tuyen-dung',
      '/tuyendung',
      '/viec-lam',
      '/vieclam',
      '/ung-tuyen',
      '/ungtuyen',
      '/careers',
      '/career',
      '/jobs',
      '/job',
      '/recruitment',
      '/hiring',
      '/join-us',
      '/work-with-us',
    );
  }

  return Array.from(new Set(paths));
}

function extractLinksFromHtml(html: string, websiteUrl: string): Array<{ text: string; url: string }> {
  const links: Array<{ text: string; url: string }> = [];
  const linkRegex = /<a[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let match: RegExpExecArray | null;
  while ((match = linkRegex.exec(html))) {
    const href = match[1];
    const text = cleanDiscoveryText((match[2] || '').replace(/<[^>]*>/g, ' '));
    if (!href || href.startsWith('#') || href.startsWith('javascript:')) continue;
    const url = sameHostOrPath(websiteUrl, href);
    if (url) links.push({ text: text || url, url });
  }
  return links;
}

async function buildWebsiteCandidateFromUrl(
  url: string,
  sourceLabel: string,
  language?: string | null,
): Promise<PublicDiscoverySource | null> {
  const text = await fetchReadableText(url, 1800);
  if (!text) return null;
  const title = text.match(/^Title:\s*(.+)$/m)?.[1]
    || text.split('\n').find((line) => cleanDiscoveryText(line).length > 8)
    || url;
  if (isLikelyNotFoundPage(title, text)) return null;
  return {
    title: cleanDiscoveryText(title).slice(0, 160),
    url,
    snippet: cleanDiscoveryText(text).slice(0, 260) || discoveryLabel(language, 'websitePageFound'),
    type: 'official_website',
    sourceLabel,
  };
}

export async function discoverWebsiteSources(args: {
  websiteUrl: string;
  topic?: string | null;
  maxSources?: number;
  language?: string | null;
}): Promise<PublicDiscoverySource[]> {
  const websiteUrl = normalizeDiscoveryUrl(args.websiteUrl);
  if (!websiteUrl) return [];

  const maxSources = args.maxSources ?? 18;
  const topic = cleanDiscoveryText(args.topic);
  const language = normalizeContentLanguage(args.language);
  const topicPlan = await analyzeDiscoveryTopic({ topic, websiteUrl, language });
  const hasTopic = expandedTopicSearchTerms(topic, topicPlan).length > 0;
  const candidates: PublicDiscoverySource[] = [];
  let homepageHtml = '';
  const crawler = new CrawlerAgent();
  const ctx: any = {
    companyId: 'public-discovery',
    executionId: 'public-discovery',
    memory: { store: async () => '', recall: async () => [], storeKnowledge: async () => '', recallKnowledge: async () => [] },
  };

  const result = await crawler.execute({ url: websiteUrl }, ctx);
  if (result.success) {
    const data = result.data as unknown as CrawlResult & { html?: string };
    homepageHtml = data.html || '';
    const homepageCandidateText = [
      data.title,
      data.metaDescription,
      ...(data.h1 || []),
      ...(data.h2 || []),
      ...(data.paragraphs || []).slice(0, 8),
      websiteUrl,
    ].join(' ');
    if (!hasTopic || topicMatches(homepageCandidateText, topic, topicPlan)) {
      candidates.push({
        title: data.title || new URL(websiteUrl).hostname,
        url: websiteUrl,
        snippet: data.metaDescription || data.h1?.[0] || discoveryLabel(language, 'websiteProvided'),
        type: 'official_website',
        sourceLabel: discoveryLabel(language, 'officialSite'),
      });
    }

    const htmlLinks = homepageHtml ? extractLinksFromHtml(homepageHtml, websiteUrl) : [];
    const usefulLinks = [...(data.navLinks || []), ...htmlLinks]
      .map((link) => ({
        text: cleanDiscoveryText(link.text),
        url: sameHostOrPath(websiteUrl, 'href' in link ? link.href : link.url),
      }))
      .filter((link): link is { text: string; url: string } => !!link.url && link.text.length > 1)
      .filter((link) => {
        const value = `${link.text} ${link.url}`.toLowerCase();
        return hasTopic ? topicMatches(value, topic, topicPlan) : SITE_PAGE_HINTS.test(value);
      });

    for (const link of usefulLinks.slice(0, hasTopic ? 16 : 10)) {
      candidates.push({
        title: link.text,
        url: link.url,
        snippet: discoveryLabel(language, 'websitePageFound'),
        type: 'official_website',
        sourceLabel: discoveryLabel(language, 'officialSite'),
      });
    }
  } else {
    candidates.push({
      title: new URL(websiteUrl).hostname,
      url: websiteUrl,
      snippet: discoveryLabel(language, 'websiteProvided'),
      type: 'official_website',
      sourceLabel: discoveryLabel(language, 'officialSite'),
    });
  }

  const origin = new URL(websiteUrl).origin;
  if (hasTopic) {
    const likelyCandidates = await Promise.allSettled(
      likelyTopicPaths(topic, topicPlan)
        .slice(0, 16)
        .map((path) => normalizeDiscoveryUrl(`${origin}${path}`))
        .filter((url): url is string => !!url)
        .map((url) => buildWebsiteCandidateFromUrl(url, discoveryLabel(language, 'likelyPage'), language)),
    );
    for (const result of likelyCandidates) {
      const candidate = result.status === 'fulfilled' ? result.value : null;
      if (candidate && topicMatches(`${candidate.title} ${candidate.snippet} ${candidate.url}`, topic, topicPlan)) {
        candidates.push(candidate);
      }
    }
  }

  const sitemap = await safeFetchText(`${origin}/sitemap.xml`, 8000);
  if (sitemap) {
    const allUrls = Array.from(sitemap.matchAll(/<loc>([\s\S]*?)<\/loc>/g))
      .map((match) => normalizeDiscoveryUrl(cleanDiscoveryText(match[1])))
      .filter((url): url is string => !!url)
      .filter((url) => sameHostOrPath(websiteUrl, url));
    const selectedUrls = hasTopic
      ? Array.from(new Set([
        ...allUrls.filter((url) => topicMatches(url, topic, topicPlan)).slice(0, 18),
        ...allUrls.filter((url) => SITE_PAGE_HINTS.test(url)).slice(0, 10),
      ])).slice(0, 24)
      : allUrls.filter((url) => SITE_PAGE_HINTS.test(url)).slice(0, 14);
    const sitemapCandidates = hasTopic
      ? await Promise.allSettled(selectedUrls.map((url) => buildWebsiteCandidateFromUrl(url, discoveryLabel(language, 'sitemap'), language)))
      : [];

    for (const [index, url] of selectedUrls.entries()) {
      const result = sitemapCandidates[index];
      const candidate = result?.status === 'fulfilled' ? result.value : null;
      if (hasTopic && !candidate) continue;
      if (candidate && !topicMatches(`${candidate.title} ${candidate.snippet} ${candidate.url}`, topic, topicPlan)) continue;
      candidates.push(candidate || {
        title: url.replace(origin, '').replace(/^\/?/, '/') || new URL(websiteUrl).hostname,
        url,
        snippet: discoveryLabel(language, 'sitemapPageFound'),
        type: 'official_website',
        sourceLabel: discoveryLabel(language, 'sitemap'),
      });
    }
  }

  const seen = new Set<string>();
  return candidates
    .filter((candidate) => {
      const normalized = normalizeDiscoveryUrl(candidate.url);
      if (!normalized || seen.has(normalized)) return false;
      seen.add(normalized);
      candidate.url = normalized;
      return true;
    })
    .slice(0, maxSources);
}

export async function discoverGoogleNewsSources(
  query: string,
  maxSources = 10,
  language?: string | null,
): Promise<PublicDiscoverySource[]> {
  const cleanQuery = cleanDiscoveryText(query);
  if (!cleanQuery) return [];
  const rssUrl = `https://news.google.com/rss/search?q=${encodeURIComponent(cleanQuery)}&hl=en-US&gl=US&ceid=US:en`;
  const xml = await safeFetchText(rssUrl, 12000);
  if (!xml) return [];

  const candidates: PublicDiscoverySource[] = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/g;
  let match: RegExpExecArray | null;
  while ((match = itemRegex.exec(xml)) && candidates.length < maxSources) {
    const body = match[1] ?? '';
    const title = cleanDiscoveryText(body.match(/<title>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/)?.[1]);
    const link = cleanDiscoveryText(body.match(/<link>([\s\S]*?)<\/link>/)?.[1]);
    const description = cleanDiscoveryText(body.match(/<description>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/description>/)?.[1]);
    const sourceName = cleanDiscoveryText(body.match(/<source[^>]*>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/source>/)?.[1]);
    if (!title || !link) continue;
    candidates.push({
      title,
      url: link,
      snippet: description || discoveryLabel(language, 'newsMentionFound'),
      type: inferDiscoveryType(title, link, 'news'),
      sourceLabel: sourceName
        ? `${discoveryLabel(language, 'googleNews')} - ${sourceName}`
        : discoveryLabel(language, 'googleNews'),
    });
  }
  return candidates;
}

export async function discoverPublicWebSources(
  query: string,
  maxSources = 10,
  language?: string | null,
): Promise<PublicDiscoverySource[]> {
  const cleanQuery = cleanDiscoveryText(query);
  if (!cleanQuery) return [];

  const html = await safeFetchText(
    `https://html.duckduckgo.com/html/?q=${encodeURIComponent(cleanQuery)}`,
    12000,
  );
  if (!html) return [];

  const candidates: PublicDiscoverySource[] = [];
  const blockRegex = /<div[^>]+class="[^"]*result[^"]*"[\s\S]*?<\/div>\s*<\/div>/gi;
  const anchorRegex = /<a[^>]+class="[^"]*result__a[^"]*"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i;
  const snippetRegex = /<a[^>]+class="[^"]*result__snippet[^"]*"[^>]*>([\s\S]*?)<\/a>|<div[^>]+class="[^"]*result__snippet[^"]*"[^>]*>([\s\S]*?)<\/div>/i;

  let blockMatch: RegExpExecArray | null;
  while ((blockMatch = blockRegex.exec(html)) && candidates.length < maxSources) {
    const block = blockMatch[0] ?? '';
    const anchor = block.match(anchorRegex);
    const href = anchor?.[1];
    const titleHtml = anchor?.[2];
    if (!href || !titleHtml) continue;

    const url = normalizeSearchResultUrl(href);
    if (!url) continue;

    const snippetMatch = block.match(snippetRegex);
    const snippetHtml = snippetMatch?.[1] || snippetMatch?.[2] || '';
    const title = decodeDiscoveryHtml(titleHtml.replace(/<[^>]*>/g, ' '));
    const snippet = decodeDiscoveryHtml(snippetHtml.replace(/<[^>]*>/g, ' '));
    if (!title) continue;

    candidates.push({
      title,
      url,
      snippet: snippet || discoveryLabel(language, 'publicWebFound'),
      type: inferDiscoveryType(title, url, 'web'),
      sourceLabel: isSocialProfileUrl(url)
        ? discoveryLabel(language, 'socialProfile')
        : discoveryLabel(language, 'publicWeb'),
    });
  }

  return candidates;
}

export async function extractEntitiesFromTexts(texts: string[]): Promise<string[][]> {
  if (texts.length === 0) return [];
  const prompt = `Extract the 3-6 most important topical entities (named concepts, products, techniques, frameworks) from each numbered text snippet. Return ONLY valid JSON: {"entities":[["...","..."],["...","..."]]} - one inner array per snippet, in order.

Snippets:
${texts.map((t, i) => `${i + 1}. ${t.slice(0, 320)}`).join('\n')}`;

  try {
    const { text } = await llmGenerate(
      [{ role: 'user', content: prompt }],
      { featureKey: 'content_grade', maxTokens: 1200 },
    );
    const parsed = extractJSON(text);
    const arr = parsed?.entities;
    if (Array.isArray(arr)) {
      return arr.map((row) =>
        Array.isArray(row) ? row.filter((x: unknown) => typeof x === 'string').slice(0, 6) : [],
      );
    }
  } catch (err) {
    console.warn('[public-discovery] Entity extraction failed:', err);
  }
  return texts.map(() => []);
}

export async function getTopicCoverageResults(
  keyword: string,
  count = 10,
): Promise<TopicCoverageResult[]> {
  const sources = await discoverGoogleNewsSources(keyword, count);
  const normalizedSources = sources
    .map((source) => ({
      url: normalizeDiscoveryUrl(source.url) || source.url,
      title: source.title,
      snippet: source.snippet,
    }))
    .filter((source) => source.url && source.title);
  const entities = await extractEntitiesFromTexts(
    normalizedSources.map((source) => `${source.title}. ${source.snippet}`),
  );
  return normalizedSources.map((source, index) => ({
    ...source,
    entities_extracted: entities[index] || [],
  }));
}
