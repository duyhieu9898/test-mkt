/**
 * Brand IQ Extractor — Block 2.
 *
 * Input: a website URL and/or up to 5 writing samples.
 * Output: a structured Brand IQ profile (voice, audience personas,
 * style guide, visual identity, OKRs slot) saved to brand_iq_profiles.
 *
 * Pipeline:
 *   1. Fetch the URL (plain HTML, no headless browser) and pull out
 *      <title>, meta description, OG tags, and a body excerpt.
 *   2. Best-effort visual extraction from inline CSS (regex over hex
 *      colors + font-family declarations + og:image for logo guess).
 *   3. Call the configured LLM once with a structured JSON schema
 *      prompt to derive voice / personas / style guide from the text
 *      plus samples.
 *   4. Mark any previous profiles inactive and insert the new row.
 */
import { eq, and, desc } from 'drizzle-orm';
import { db } from '../lib/db';
import {
  brandIqProfiles,
  companies,
  type BrandIqVoice,
  type AudiencePersona,
  type StyleGuide,
  type VisualIdentity,
  type QuarterlyOkr,
  type BrandIqProfile,
} from '@1person/core/db';
import { llmGenerate, extractJSON } from '../lib/llm';

/* ─── Public types ───────────────────────────────────────────────── */

export interface BrandIqInput {
  url?: string;
  samples?: string[];
}

export interface ExtractedSource {
  title: string | null;
  description: string | null;
  ogImage: string | null;
  bodyExcerpt: string;
  detectedColors: string[];
  detectedFonts: string[];
}

const DEFAULT_VOICE: BrandIqVoice = {
  adjectives: ['professional', 'clear', 'helpful'],
  description: 'Concise, friendly, jargon-light. Talks to the reader directly.',
  firstPerson: 'we',
  sentenceLength: 'varied',
  signaturePhrases: [],
  avoidPhrases: ['leverage', 'synergy', 'cutting-edge'],
  emojiUsage: 'sparingly',
};

const DEFAULT_STYLE: StyleGuide = {
  headlineRules: ['Lead with the benefit, not the feature.', 'Keep under 12 words.'],
  bodyRules: ['One idea per paragraph.', 'Show concrete examples.'],
  ctaRules: ['Use an action verb.', 'Tell the reader exactly what happens next.'],
  formattingPreferences: ['Use bullet lists for 3+ items.', 'Bold the key sentence per section.'],
};

const DEFAULT_VISUAL: VisualIdentity = {
  primaryColor: '#3b82f6',
  secondaryColor: '#8b5cf6',
  accentColors: [],
  fontHeadline: null,
  fontBody: null,
  imageMood: 'modern, clean, human-led',
  logoUrl: null,
};

/* ─── URL scraping (no headless browser) ─────────────────────────── */

const HEX_RE = /#[0-9a-fA-F]{6}\b/g;
const FONT_RE = /font-family\s*:\s*([^;"]+)/gi;

export async function scrapeBrandSource(url: string): Promise<ExtractedSource> {
  let html = '';
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 1Person-BrandIQ/1.0' },
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    html = await res.text();
  } catch (e) {
    return {
      title: null,
      description: null,
      ogImage: null,
      bodyExcerpt: `[fetch failed for ${url}: ${(e as Error).message}]`,
      detectedColors: [],
      detectedFonts: [],
    };
  }

  // Title
  const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  const title = titleMatch?.[1]?.trim().slice(0, 200) ?? null;

  // Meta description / OG description
  const descMatch =
    html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i) ||
    html.match(/<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["']/i);
  const description = descMatch?.[1]?.trim().slice(0, 400) ?? null;

  // OG image (logo guess)
  const ogImageMatch =
    html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i) ||
    html.match(/<link[^>]+rel=["']icon["'][^>]+href=["']([^"']+)["']/i);
  let ogImage = ogImageMatch?.[1]?.trim() ?? null;
  // Resolve relative URL
  if (ogImage && !ogImage.startsWith('http')) {
    try {
      ogImage = new URL(ogImage, url).toString();
    } catch {
      /* ignore */
    }
  }

  // Body excerpt — strip tags + whitespace
  const bodyMatch = html.match(/<body[\s\S]*?>([\s\S]*?)<\/body>/i);
  const rawBody = bodyMatch?.[1] ?? html;
  const stripped = rawBody
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const bodyExcerpt = stripped.slice(0, 3000);

  // Hex colors from inline style + style tags
  const colorMatches = Array.from(html.matchAll(HEX_RE)).map((m) => m[0].toLowerCase());
  const colorCounts = new Map<string, number>();
  for (const c of colorMatches) {
    // Skip very-light / very-dark (likely text/bg, not brand)
    if (/^#(?:fff|000|ffffff|000000|111111|eeeeee|f5f5f5|fafafa)$/.test(c)) continue;
    colorCounts.set(c, (colorCounts.get(c) ?? 0) + 1);
  }
  const detectedColors = Array.from(colorCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([c]) => c);

  // Font families
  const fontMatches = Array.from(html.matchAll(FONT_RE)).map((m) =>
    m[1]?.split(',')[0]?.trim().replace(/['"]/g, '').toLowerCase(),
  );
  const fontCounts = new Map<string, number>();
  for (const f of fontMatches) {
    if (!f || f.length < 3 || f.length > 40) continue;
    if (/inherit|initial|unset|sans-serif|serif|monospace/.test(f)) continue;
    fontCounts.set(f, (fontCounts.get(f) ?? 0) + 1);
  }
  const detectedFonts = Array.from(fontCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([f]) => f);

  return { title, description, ogImage, bodyExcerpt, detectedColors, detectedFonts };
}

/* ─── LLM-driven derivation ──────────────────────────────────────── */

function buildPrompt(companyName: string, src: ExtractedSource | null, samples: string[]): string {
  const sourceBlock = src
    ? `WEBSITE TITLE: ${src.title ?? '(none)'}\nMETA DESCRIPTION: ${src.description ?? '(none)'}\nBODY EXCERPT (first 3000 chars):\n"""${src.bodyExcerpt}"""\nDETECTED COLORS: ${src.detectedColors.join(', ') || '(none)'}\nDETECTED FONTS: ${src.detectedFonts.join(', ') || '(none)'}`
    : '(no URL provided)';
  const samplesBlock =
    samples.length > 0
      ? samples.map((s, i) => `SAMPLE ${i + 1}:\n"""${s.slice(0, 1500)}"""`).join('\n\n')
      : '(no writing samples provided)';
  return `You are a senior brand strategist. Analyze the company's existing public surface and extract a structured Brand IQ.

COMPANY NAME: ${companyName}

${sourceBlock}

WRITING SAMPLES:
${samplesBlock}

Respond ONLY with a single valid JSON object matching this schema (no markdown, no commentary):

{
  "voice": {
    "adjectives": ["adjective", ...], // 4-6 items
    "description": "2-3 sentences describing how the brand sounds — the LLM will mimic this",
    "firstPerson": "we" | "i" | "the_team" | "none",
    "sentenceLength": "short" | "medium" | "long" | "varied",
    "signaturePhrases": ["phrase the brand uses often", ...], // 0-5 items
    "avoidPhrases": ["jargon to avoid", ...], // 0-5 items
    "emojiUsage": "none" | "sparingly" | "frequent"
  },
  "audiencePersonas": [
    {
      "id": "slug-string",
      "name": "Human label",
      "role": "Their job / situation",
      "painPoints": ["pain 1", "pain 2"],
      "goals": ["goal 1", "goal 2"],
      "channels": ["where they hang out, e.g. LinkedIn, Reddit"]
    }
  ], // 3-5 personas
  "styleGuide": {
    "headlineRules": ["rule 1", ...], // 2-4 items
    "bodyRules": ["rule 1", ...], // 2-4 items
    "ctaRules": ["rule 1", ...], // 2-4 items
    "formattingPreferences": ["pref 1", ...]
  },
  "tagline": "5-9 word brand tagline if you can derive one, else null"
}

Be specific. Pull concrete signature phrases from the samples when possible. Personas must be distinct (not just "ICP variants").`;
}

function coerceVoice(v: any): BrandIqVoice {
  return {
    adjectives: Array.isArray(v?.adjectives) ? v.adjectives.slice(0, 8).map(String) : DEFAULT_VOICE.adjectives,
    description: typeof v?.description === 'string' ? v.description : DEFAULT_VOICE.description,
    firstPerson: ['we', 'i', 'the_team', 'none'].includes(v?.firstPerson) ? v.firstPerson : 'we',
    sentenceLength: ['short', 'medium', 'long', 'varied'].includes(v?.sentenceLength) ? v.sentenceLength : 'varied',
    signaturePhrases: Array.isArray(v?.signaturePhrases) ? v.signaturePhrases.slice(0, 8).map(String) : [],
    avoidPhrases: Array.isArray(v?.avoidPhrases) ? v.avoidPhrases.slice(0, 8).map(String) : DEFAULT_VOICE.avoidPhrases,
    emojiUsage: ['none', 'sparingly', 'frequent'].includes(v?.emojiUsage) ? v.emojiUsage : 'sparingly',
  };
}

function coercePersonas(p: any): AudiencePersona[] {
  if (!Array.isArray(p)) return [];
  return p.slice(0, 8).map((it: any, idx: number) => ({
    id: typeof it?.id === 'string' ? it.id : `persona-${idx + 1}`,
    name: typeof it?.name === 'string' ? it.name : `Persona ${idx + 1}`,
    role: typeof it?.role === 'string' ? it.role : '',
    painPoints: Array.isArray(it?.painPoints) ? it.painPoints.slice(0, 6).map(String) : [],
    goals: Array.isArray(it?.goals) ? it.goals.slice(0, 6).map(String) : [],
    channels: Array.isArray(it?.channels) ? it.channels.slice(0, 6).map(String) : [],
  }));
}

function coerceStyle(s: any): StyleGuide {
  return {
    headlineRules: Array.isArray(s?.headlineRules) ? s.headlineRules.slice(0, 6).map(String) : DEFAULT_STYLE.headlineRules,
    bodyRules: Array.isArray(s?.bodyRules) ? s.bodyRules.slice(0, 6).map(String) : DEFAULT_STYLE.bodyRules,
    ctaRules: Array.isArray(s?.ctaRules) ? s.ctaRules.slice(0, 6).map(String) : DEFAULT_STYLE.ctaRules,
    formattingPreferences: Array.isArray(s?.formattingPreferences) ? s.formattingPreferences.slice(0, 6).map(String) : DEFAULT_STYLE.formattingPreferences,
  };
}

function visualFromSource(src: ExtractedSource | null): VisualIdentity {
  if (!src) return { ...DEFAULT_VISUAL };
  return {
    primaryColor: src.detectedColors[0] ?? DEFAULT_VISUAL.primaryColor,
    secondaryColor: src.detectedColors[1] ?? DEFAULT_VISUAL.secondaryColor,
    accentColors: src.detectedColors.slice(2, 5),
    fontHeadline: src.detectedFonts[0] ?? null,
    fontBody: src.detectedFonts[1] ?? src.detectedFonts[0] ?? null,
    imageMood: DEFAULT_VISUAL.imageMood,
    logoUrl: src.ogImage,
  };
}

/* ─── Persistence ────────────────────────────────────────────────── */

export async function getActiveBrandIq(companyId: string): Promise<BrandIqProfile | null> {
  const row = await db.query.brandIqProfiles.findFirst({
    where: and(eq(brandIqProfiles.companyId, companyId), eq(brandIqProfiles.isActive, true)),
    orderBy: [desc(brandIqProfiles.version)],
  });
  return row ?? null;
}

export async function generateBrandIq(companyId: string, input: BrandIqInput): Promise<BrandIqProfile> {
  const company = await db.query.companies.findFirst({
    where: eq(companies.id, companyId),
    columns: { id: true, name: true, industry: true },
  });
  if (!company) throw new Error('Company not found');

  // 1. URL scrape
  const src = input.url ? await scrapeBrandSource(input.url) : null;
  const samples = (input.samples ?? []).filter((s) => typeof s === 'string' && s.trim().length > 50);

  if (!src && samples.length === 0) {
    throw new Error('Provide a URL or at least one writing sample to extract Brand IQ');
  }

  // 2. LLM derivation
  const prompt = buildPrompt(company.name, src, samples);

  let parsed: any = {};
  try {
    const response = await llmGenerate(
      [
        {
          role: 'system',
          content:
            'You are a brand strategist. Respond with valid JSON only — no markdown, no commentary outside the JSON.',
        },
        { role: 'user', content: prompt },
      ],
      { featureKey: 'brand_iq_extract', maxTokens: 2500, json: true },
    );
    parsed = extractJSON(response.text) ?? {};
  } catch {
    // Fall back to defaults — we still have visuals from CSS.
    parsed = {};
  }

  const voice = coerceVoice(parsed.voice);
  const personas = coercePersonas(parsed.audiencePersonas);
  const style = coerceStyle(parsed.styleGuide);
  const visual = visualFromSource(src);
  const tagline = typeof parsed.tagline === 'string' && parsed.tagline.length <= 120 ? parsed.tagline : null;

  // 3. Mark previous active rows inactive, insert new version
  const previous = await db
    .select({ version: brandIqProfiles.version })
    .from(brandIqProfiles)
    .where(eq(brandIqProfiles.companyId, companyId))
    .orderBy(desc(brandIqProfiles.version))
    .limit(1);
  const nextVersion = (previous[0]?.version ?? 0) + 1;

  await db
    .update(brandIqProfiles)
    .set({ isActive: false, updatedAt: new Date() })
    .where(and(eq(brandIqProfiles.companyId, companyId), eq(brandIqProfiles.isActive, true)));

  const [inserted] = await db
    .insert(brandIqProfiles)
    .values({
      companyId,
      version: nextVersion,
      isActive: true,
      sourceUrl: input.url ?? null,
      sourceSamples: samples,
      voice,
      audiencePersonas: personas,
      styleGuide: style,
      visualIdentity: visual,
      okrs: [],
      tagline,
      generatedBy: 'ai',
    })
    .returning();

  if (!inserted) throw new Error('Failed to persist Brand IQ');
  return inserted;
}

/* ─── Manual edit helpers (used by PUT routes) ───────────────────── */

export async function updateBrandIqFacet(
  companyId: string,
  patch: Partial<{
    voice: BrandIqVoice;
    audiencePersonas: AudiencePersona[];
    styleGuide: StyleGuide;
    visualIdentity: VisualIdentity;
    okrs: QuarterlyOkr[];
    tagline: string | null;
  }>,
): Promise<BrandIqProfile> {
  const current = await getActiveBrandIq(companyId);
  if (!current) throw new Error('No active Brand IQ to update — generate one first');
  const [updated] = await db
    .update(brandIqProfiles)
    .set({ ...patch, generatedBy: 'manual', updatedAt: new Date() })
    .where(eq(brandIqProfiles.id, current.id))
    .returning();
  if (!updated) throw new Error('Update failed');
  return updated;
}

/* ─── Context renderer (consumed by business-context.ts) ─────────── */

export function renderBrandIqContext(p: BrandIqProfile): string {
  const lines: string[] = [];
  lines.push('=== BRAND IQ (always follow this) ===');
  if (p.tagline) lines.push(`TAGLINE: ${p.tagline}`);
  lines.push(`VOICE: ${p.voice.adjectives.join(', ')}. ${p.voice.description}`);
  lines.push(
    `WRITING: first-person=${p.voice.firstPerson}, sentence=${p.voice.sentenceLength}, emoji=${p.voice.emojiUsage}.`,
  );
  if (p.voice.signaturePhrases.length > 0)
    lines.push(`USE THESE PHRASES: ${p.voice.signaturePhrases.join(' · ')}`);
  if (p.voice.avoidPhrases.length > 0) lines.push(`AVOID: ${p.voice.avoidPhrases.join(' · ')}`);

  if (p.audiencePersonas.length > 0) {
    lines.push('AUDIENCE PERSONAS:');
    for (const ap of p.audiencePersonas) {
      lines.push(
        `- ${ap.name} (${ap.role}). Pains: ${ap.painPoints.join('; ') || '(none)'}. Goals: ${ap.goals.join('; ') || '(none)'}.`,
      );
    }
  }
  lines.push('STYLE RULES:');
  lines.push(`  Headlines: ${p.styleGuide.headlineRules.join(' / ')}`);
  lines.push(`  Body: ${p.styleGuide.bodyRules.join(' / ')}`);
  lines.push(`  CTA: ${p.styleGuide.ctaRules.join(' / ')}`);
  lines.push(
    `VISUAL: primary=${p.visualIdentity.primaryColor}, secondary=${p.visualIdentity.secondaryColor}, mood=${p.visualIdentity.imageMood}`,
  );
  if (p.okrs.length > 0) {
    lines.push('CURRENT OKRs:');
    for (const o of p.okrs) lines.push(`- [${o.quarter}] ${o.objective} (KRs: ${o.keyResults.join('; ')})`);
  }
  lines.push('=== END BRAND IQ ===');
  return lines.join('\n');
}
