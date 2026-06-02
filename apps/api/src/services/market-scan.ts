/**
 * Market scan engine (doc 10 §5) — Jina Reader + Google News RSS + LLM.
 * Triggered only by explicit user click (no cron).
 */
import { llmGenerate, extractJSON } from '../lib/llm';

export interface Signal { type: string; text: string; url?: string; date?: string }
export interface ScanSource { kind: string; url: string; fetchedAt: string }
export interface CompetitorLite { id: string; name: string; url: string | null; keywords: string[] }
export interface ScanResult {
  sources: ScanSource[]; signals: Signal[]; aiSummary: string; recommendedAction: string;
}

async function safeFetch(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(30_000),
      headers: { 'User-Agent': 'Mozilla/5.0 (1Person MarketScan)' },
    });
    if (!res.ok) return null;
    return await res.text();
  } catch { return null; }
}

async function fetchJina(url: string): Promise<string | null> {
  const text = await safeFetch(`https://r.jina.ai/${url}`);
  return text ? text.slice(0, 4000) : null;
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
    const title = b.match(/<title>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/)?.[1]?.trim() ?? '';
    const link = b.match(/<link>([\s\S]*?)<\/link>/)?.[1]?.trim() ?? '';
    const date = b.match(/<pubDate>([\s\S]*?)<\/pubDate>/)?.[1]?.trim() ?? '';
    if (title && link) items.push({ title, url: link, date });
  }
  return items;
}

export async function scanCompetitor(competitor: CompetitorLite): Promise<ScanResult> {
  const sources: ScanSource[] = [];
  const now = new Date().toISOString();
  let websiteMd = '';
  if (competitor.url) {
    const md = await fetchJina(competitor.url);
    if (md) { websiteMd = md; sources.push({ kind: 'website', url: competitor.url, fetchedAt: now }); }
  }
  const newsItems: NewsItem[] = [];
  for (const kw of (competitor.keywords ?? []).slice(0, 3)) {
    for (const it of await fetchNews(`${kw} ${competitor.name}`)) {
      newsItems.push(it);
      sources.push({ kind: 'news', url: it.url, fetchedAt: now });
    }
  }
  const newsBlock = newsItems.map((n, i) => `${i + 1}. ${n.title} — ${n.url} (${n.date})`).join('\n') || '(no news)';

  const resp = await llmGenerate(
    [
      { role: 'system', content: 'You analyze competitor intel for a startup CEO. Extract concrete signals (product_launch, pricing_change, hire, news, content). Return STRICT JSON only.' },
      { role: 'user', content: `Competitor: ${competitor.name}\nURL: ${competitor.url ?? '(none)'}\n\nWEBSITE (markdown, truncated):\n${websiteMd || '(no website)'}\n\nRECENT NEWS:\n${newsBlock}\n\nReturn JSON: {"signals":[{"type":"...","text":"...","url":"...","date":"..."}],"aiSummary":"1-2 sentences","recommendedAction":"1 sentence CEO action"}\nMax 6 signals. Real observations only.` },
    ],
    { featureKey: 'market_scan', traceName: 'market.scan', json: true, metadata: { competitorId: competitor.id } },
  );

  const parsed = extractJSON(resp.text) ?? {};
  const signals: Signal[] = Array.isArray(parsed.signals)
    ? parsed.signals.filter((s: any) => s && typeof s.text === 'string').slice(0, 6).map((s: any) => ({
        type: String(s.type ?? 'news'),
        text: String(s.text),
        url: s.url ? String(s.url) : undefined,
        date: s.date ? String(s.date) : undefined,
      }))
    : [];
  return {
    sources, signals,
    aiSummary: String(parsed.aiSummary ?? ''),
    recommendedAction: String(parsed.recommendedAction ?? ''),
  };
}
