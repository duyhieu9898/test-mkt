/**
 * Brand IQ Extractor — Block 2.
 *
 * Input: existing company intelligence plus optional URL/user context.
 * Output: a structured Brand IQ profile (voice, audience personas,
 * style guide, visual identity, OKRs slot) saved to brand_iq_profiles.
 *
 * Pipeline:
 *   1. Fetch the URL (plain HTML, no headless browser) and pull out
 *      <title>, meta description, OG tags, and a body excerpt.
 *   2. Best-effort visual extraction from inline CSS (regex over hex
 *      colors + font-family declarations + og:image for logo guess).
 *   3. Call the configured LLM once with a structured JSON schema
 *      prompt grounded in company, Brain Hub, campaign, content, and
 *      optional user-supplied context.
 *   4. Mark any previous profiles inactive and insert the new row.
 */
import { eq, and, desc } from 'drizzle-orm';
import { db } from '../lib/db';
import {
  brandIqProfiles,
  companies,
  brandIdentities,
  type BrandIqVoice,
  type AudiencePersona,
  type StyleGuide,
  type VisualIdentity,
  type QuarterlyOkr,
  type JtbdForces,
  type CustomerLanguage,
  type AntiPersona,
  type Objection,
  type BrandIqProfile,
} from '@1person/core/db';
import { renderSkillKnowledgeBundle } from '@1person/core';
import { llmGenerate, extractJSON } from '../lib/llm';
import { embedBrandIqProfile } from './embedding-service';

// P2: ground the extraction in the product-marketing + customer-research playbooks
// (skills K41/K27). Bounded so the prompt stays lean.
const PMM_FRAMEWORK = renderSkillKnowledgeBundle(['product-marketing', 'customer-research'], {
  maxCharsEach: 4500,
});

/* ─── Public types ───────────────────────────────────────────────── */

export interface BrandIqInput {
  url?: string;
  samples?: string[];
  /** Server-built context from company data. Never accepted directly from the client. */
  companyContext?: string;
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

function buildPrompt(
  companyName: string,
  src: ExtractedSource | null,
  samples: string[],
  companyContext: string,
): string {
  const sourceBlock = src
    ? `WEBSITE TITLE: ${src.title ?? '(none)'}\nMETA DESCRIPTION: ${src.description ?? '(none)'}\nBODY EXCERPT (first 3000 chars):\n"""${src.bodyExcerpt}"""\nDETECTED COLORS: ${src.detectedColors.join(', ') || '(none)'}\nDETECTED FONTS: ${src.detectedFonts.join(', ') || '(none)'}`
    : '(no URL provided)';
  const samplesBlock =
    samples.length > 0
      ? samples.map((s, i) => `ADDITIONAL INPUT ${i + 1}:\n"""${s.slice(0, 1500)}"""`).join('\n\n')
      : '(no additional user context provided)';
  return `You are a senior brand + product-marketing strategist. Analyze the company's existing public surface and extract a structured Brand IQ.

Apply the playbooks below (product-marketing positioning + customer-research). Do NOT ask questions — infer from the material provided, and where evidence is thin, make a clearly reasonable best guess rather than leaving fields empty.

${PMM_FRAMEWORK}

---

COMPANY NAME: ${companyName}

EXISTING COMPANY CONTEXT:
${companyContext || '(only the company name is available)'}

${sourceBlock}

USER-SUPPLIED CONTEXT OR WRITING EXAMPLES:
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
  "tagline": "5-9 word brand tagline if you can derive one, else null",
  "jtbdForces": {
    "push": ["frustration driving them away from their current solution", ...], // 2-4
    "pull": ["what attracts them to this product", ...], // 2-4
    "habit": ["inertia keeping them on the old way", ...], // 1-3
    "anxiety": ["worry about switching to this product", ...] // 1-3
  },
  "customerLanguage": {
    "problemPhrases": ["verbatim phrase customers use for the problem", ...], // 2-5
    "solutionPhrases": ["verbatim phrase for the desired outcome", ...], // 2-5
    "wordsToUse": ["resonant term to mirror in copy", ...], // 2-6
    "wordsToAvoid": ["jargon that falls flat", ...], // 0-5
    "glossary": [ { "term": "product-specific term", "definition": "short plain-English meaning" } ] // 0-5
  },
  "antiPersonas": [ { "name": "who is NOT a fit", "whyNotFit": "why they won't get value" } ], // 1-3
  "objections": [ { "objection": "top objection heard", "response": "how to address it" } ] // 2-4
}

Be specific. Treat explicit user preferences as constraints. When an input is clearly a real writing
example, use it as voice evidence and pull concrete signature phrases or customer language from it.
Personas must be distinct (not just "ICP variants"). For JTBD forces, think about the moment of switching.`;
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

function strArr(v: any, max = 6): string[] {
  return Array.isArray(v) ? v.slice(0, max).map(String).filter((s) => s.trim().length > 0) : [];
}

function coerceJtbd(j: any): JtbdForces | null {
  if (!j || typeof j !== 'object') return null;
  const out: JtbdForces = {
    push: strArr(j.push, 5),
    pull: strArr(j.pull, 5),
    habit: strArr(j.habit, 5),
    anxiety: strArr(j.anxiety, 5),
  };
  // Only persist if at least one force was found.
  return out.push.length || out.pull.length || out.habit.length || out.anxiety.length ? out : null;
}

function coerceCustomerLanguage(c: any): CustomerLanguage | null {
  if (!c || typeof c !== 'object') return null;
  const glossary = Array.isArray(c.glossary)
    ? c.glossary
        .slice(0, 8)
        .map((g: any) => ({ term: String(g?.term ?? ''), definition: String(g?.definition ?? '') }))
        .filter((g: { term: string }) => g.term.trim().length > 0)
    : [];
  const out: CustomerLanguage = {
    problemPhrases: strArr(c.problemPhrases, 6),
    solutionPhrases: strArr(c.solutionPhrases, 6),
    wordsToUse: strArr(c.wordsToUse, 8),
    wordsToAvoid: strArr(c.wordsToAvoid, 8),
    glossary,
  };
  return out.problemPhrases.length || out.solutionPhrases.length || out.wordsToUse.length
    ? out
    : null;
}

function coerceAntiPersonas(a: any): AntiPersona[] {
  if (!Array.isArray(a)) return [];
  return a
    .slice(0, 5)
    .map((it: any) => ({ name: String(it?.name ?? ''), whyNotFit: String(it?.whyNotFit ?? '') }))
    .filter((it: AntiPersona) => it.name.trim().length > 0);
}

function coerceObjections(o: any): Objection[] {
  if (!Array.isArray(o)) return [];
  return o
    .slice(0, 6)
    .map((it: any) => ({ objection: String(it?.objection ?? ''), response: String(it?.response ?? '') }))
    .filter((it: Objection) => it.objection.trim().length > 0);
}

function validHex(value: unknown): value is string {
  return typeof value === 'string' && /^#[0-9a-fA-F]{6}$/.test(value);
}

function visualFromSources(
  src: ExtractedSource | null,
  brand: typeof brandIdentities.$inferSelect | null,
  current: BrandIqProfile | null,
): VisualIdentity {
  const colors = (brand?.colors ?? {}) as {
    primary?: string;
    secondary?: string;
    accent?: string;
  };
  const typography = (brand?.typography ?? {}) as {
    headingFont?: string;
    bodyFont?: string;
  };
  const existing = current?.visualIdentity;
  const detected = src?.detectedColors ?? [];
  return {
    primaryColor: detected[0]
      ?? (validHex(colors.primary) ? colors.primary : null)
      ?? existing?.primaryColor
      ?? DEFAULT_VISUAL.primaryColor,
    secondaryColor: detected[1]
      ?? (validHex(colors.secondary) ? colors.secondary : null)
      ?? existing?.secondaryColor
      ?? DEFAULT_VISUAL.secondaryColor,
    accentColors: detected.slice(2, 5).length
      ? detected.slice(2, 5)
      : [
        ...(validHex(colors.accent) ? [colors.accent] : []),
        ...(existing?.accentColors ?? []),
      ].slice(0, 5),
    fontHeadline: src?.detectedFonts[0]
      ?? typography.headingFont
      ?? existing?.fontHeadline
      ?? null,
    fontBody: src?.detectedFonts[1]
      ?? src?.detectedFonts[0]
      ?? typography.bodyFont
      ?? existing?.fontBody
      ?? null,
    imageMood: brand?.visualStyle
      ? `${brand.visualStyle}, human-led`
      : existing?.imageMood ?? DEFAULT_VISUAL.imageMood,
    logoUrl: src?.ogImage ?? brand?.logoUrl ?? existing?.logoUrl ?? null,
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
  const [company, brand, current] = await Promise.all([
    db.query.companies.findFirst({
      where: eq(companies.id, companyId),
    }),
    db.query.brandIdentities.findFirst({
      where: eq(brandIdentities.companyId, companyId),
    }),
    getActiveBrandIq(companyId),
  ]);
  if (!company) throw new Error('Company not found');

  // 1. URL scrape
  const sourceUrl = input.url
    ?? current?.sourceUrl
    ?? brand?.extractedFromUrl
    ?? (company.settings as { websiteUrl?: string } | null)?.websiteUrl
    ?? undefined;
  const src = sourceUrl ? await scrapeBrandSource(sourceUrl) : null;
  const suppliedSamples = (input.samples ?? [])
    .filter((s) => typeof s === 'string' && s.trim().length > 50)
    .map((s) => s.trim());
  const samples = [...new Set([...(current?.sourceSamples ?? []), ...suppliedSamples])].slice(-5);
  const companyProfile = JSON.stringify({
    name: company.name,
    industry: company.industry,
    description: company.description,
    businessType: company.businessType,
    goals: company.goals,
    businessPlan: company.businessPlan,
    language: company.settings?.language,
    websiteUrl: sourceUrl,
  }, null, 2);
  const companyContext = `${companyProfile}\n\n${input.companyContext ?? ''}`.slice(0, 18_000);

  // 2. LLM derivation
  const prompt = buildPrompt(company.name, src, samples, companyContext);

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

  const voice = parsed.voice ? coerceVoice(parsed.voice) : current?.voice ?? DEFAULT_VOICE;
  const personas = parsed.audiencePersonas
    ? coercePersonas(parsed.audiencePersonas)
    : current?.audiencePersonas ?? [];
  const style = parsed.styleGuide ? coerceStyle(parsed.styleGuide) : current?.styleGuide ?? DEFAULT_STYLE;
  const visual = visualFromSources(src, brand ?? null, current);
  const tagline = typeof parsed.tagline === 'string' && parsed.tagline.length <= 120
    ? parsed.tagline
    : current?.tagline ?? null;
  const jtbdForces = parsed.jtbdForces
    ? coerceJtbd(parsed.jtbdForces)
    : current?.jtbdForces ?? null;
  const customerLanguage = parsed.customerLanguage
    ? coerceCustomerLanguage(parsed.customerLanguage)
    : current?.customerLanguage ?? null;
  const antiPersonas = parsed.antiPersonas
    ? coerceAntiPersonas(parsed.antiPersonas)
    : current?.antiPersonas ?? [];
  const objections = parsed.objections
    ? coerceObjections(parsed.objections)
    : current?.objections ?? [];

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
      sourceUrl: sourceUrl ?? null,
      sourceSamples: samples,
      voice,
      audiencePersonas: personas,
      styleGuide: style,
      visualIdentity: visual,
      okrs: current?.okrs ?? [],
      jtbdForces,
      customerLanguage,
      antiPersonas,
      objections,
      tagline,
      generatedBy: 'ai',
    })
    .returning();

  if (!inserted) throw new Error('Failed to persist Brand IQ');

  // Auto-embed so AI Employees can semantically recall brand context
  // when chatting. Don't block on failure — embedding is non-critical.
  try {
    await embedBrandIqProfile({
      companyId,
      profileId: inserted.id,
      text: renderBrandIqContext(inserted),
    });
  } catch (e) {
    console.warn('[brand-iq] embedding failed (non-fatal):', (e as Error).message);
  }

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
    jtbdForces: JtbdForces | null;
    customerLanguage: CustomerLanguage | null;
    antiPersonas: AntiPersona[];
    objections: Objection[];
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

  // P2 — product-marketing depth. Grounds every agent in positioning + verbatim language.
  const j = p.jtbdForces;
  if (j && (j.push.length || j.pull.length || j.habit.length || j.anxiety.length)) {
    lines.push('WHY CUSTOMERS SWITCH (JTBD forces):');
    if (j.push.length) lines.push(`  Push (away from old): ${j.push.join('; ')}`);
    if (j.pull.length) lines.push(`  Pull (toward us): ${j.pull.join('; ')}`);
    if (j.habit.length) lines.push(`  Habit (inertia): ${j.habit.join('; ')}`);
    if (j.anxiety.length) lines.push(`  Anxiety (switching fear): ${j.anxiety.join('; ')}`);
  }
  const cl = p.customerLanguage;
  if (cl && (cl.problemPhrases.length || cl.solutionPhrases.length || cl.wordsToUse.length)) {
    lines.push('CUSTOMER LANGUAGE (mirror these verbatim):');
    if (cl.problemPhrases.length) lines.push(`  Problem (their words): ${cl.problemPhrases.join(' · ')}`);
    if (cl.solutionPhrases.length) lines.push(`  Outcome (their words): ${cl.solutionPhrases.join(' · ')}`);
    if (cl.wordsToUse.length) lines.push(`  Words to use: ${cl.wordsToUse.join(', ')}`);
    if (cl.wordsToAvoid.length) lines.push(`  Words to avoid: ${cl.wordsToAvoid.join(', ')}`);
    if (cl.glossary.length) lines.push(`  Glossary: ${cl.glossary.map((g) => `${g.term}=${g.definition}`).join(' · ')}`);
  }
  if (p.antiPersonas.length > 0) {
    lines.push(`NOT A FIT (don't target): ${p.antiPersonas.map((a) => `${a.name} (${a.whyNotFit})`).join(' · ')}`);
  }
  if (p.objections.length > 0) {
    lines.push('COMMON OBJECTIONS → RESPONSE:');
    for (const o of p.objections) lines.push(`  - "${o.objection}" → ${o.response}`);
  }

  lines.push('=== END BRAND IQ ===');
  return lines.join('\n');
}
