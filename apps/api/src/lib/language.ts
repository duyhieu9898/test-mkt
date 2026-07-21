import { eq } from 'drizzle-orm';
import { companies } from '@1person/core/db';
import { db } from './db';

export const SUPPORTED_CONTENT_LANGUAGES = ['en', 'ja'] as const;
export type ContentLanguage = typeof SUPPORTED_CONTENT_LANGUAGES[number];

const LANGUAGE_ALIASES: Record<string, ContentLanguage> = {
  en: 'en',
  english: 'en',
  ja: 'ja',
  jp: 'ja',
  japanese: 'ja',
  nihongo: 'ja',
  '日本語': 'ja',
};

export const CONTENT_LANGUAGE_NAMES: Record<ContentLanguage, string> = {
  en: 'English',
  ja: 'Japanese',
};

export function normalizeContentLanguage(value?: unknown): ContentLanguage {
  const normalized = String(value ?? '')
    .trim()
    .toLowerCase();
  if (!normalized) return 'en';
  return LANGUAGE_ALIASES[normalized] ?? 'en';
}

export function contentLanguageName(value?: unknown): string {
  return CONTENT_LANGUAGE_NAMES[normalizeContentLanguage(value)];
}

export function buildContentLanguageInstruction(value?: unknown): string {
  const language = normalizeContentLanguage(value);
  const name = CONTENT_LANGUAGE_NAMES[language];
  return [
    `OUTPUT LANGUAGE: ${name} (${language}).`,
    'All user-facing copy must be written in this language.',
    'Keep JSON keys, enum values, IDs, URLs, platform names, and technical field names exactly as requested.',
    'Do not translate brand names, product names, company names, source titles, or proper nouns unless the source already provides a translated version.',
  ].join('\n');
}

export async function resolveCompanyLanguage(companyId: string): Promise<ContentLanguage> {
  const company = await db.query.companies.findFirst({
    where: eq(companies.id, companyId),
    columns: { settings: true },
  });
  return normalizeContentLanguage(company?.settings?.language);
}

type LocalizedDefaultKey =
  | 'learnMore'
  | 'getStarted'
  | 'exploreNow'
  | 'discover'
  | 'confidence'
  | 'betterWay'
  | 'makeItHappen';

export function localizedDefault(
  language: ContentLanguage | string | undefined,
  key: LocalizedDefaultKey,
): string {
  const lang = normalizeContentLanguage(language);
  const values: Record<ContentLanguage, Record<LocalizedDefaultKey, string>> = {
    en: {
      learnMore: 'Learn More',
      getStarted: 'Get Started',
      exploreNow: 'Explore Now',
      discover: 'Discover',
      confidence: 'Choose With Confidence',
      betterWay: 'A Better Way Forward',
      makeItHappen: 'Make It Happen',
    },
    ja: {
      learnMore: '詳しく見る',
      getStarted: 'はじめる',
      exploreNow: '今すぐ見る',
      discover: '発見する',
      confidence: '安心して選ぶ',
      betterWay: 'より良い次の一手',
      makeItHappen: '今すぐ実行',
    },
  };
  return values[lang][key];
}
