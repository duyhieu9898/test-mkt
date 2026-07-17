import { eq } from 'drizzle-orm';
import { companies, type AudiencePersona, type BrandIqProfile } from '@1person/core/db';
import { db } from '../lib/db';
import { getActiveBrandIq } from './brand-iq-extractor';
import type { BannerLayout } from './imgly-banner-renderer';

export interface BrandCreativeKit {
  companyId: string;
  companyName: string;
  source: 'brand_iq' | 'company' | 'fallback';
  sourceProfileId?: string;
  sourceVersion?: number;
  logoUrl?: string | null;
  colors: {
    primary: string;
    secondary: string;
    accentColors: string[];
    text: string;
    mutedText: string;
    ctaBg: string;
    ctaText: string;
  };
  fonts: {
    headline: string | null;
    body: string | null;
  };
  imageMood: string;
  voice: {
    adjectives: string[];
    description: string;
    signaturePhrases: string[];
    avoidPhrases: string[];
  };
  styleRules: {
    headlineRules: string[];
    bodyRules: string[];
    ctaRules: string[];
  };
  audiencePersonas: Pick<AudiencePersona, 'name' | 'role' | 'painPoints' | 'goals' | 'channels'>[];
}

export interface BrandableBannerTheme {
  backgroundValue: string;
  colors: {
    primary: string;
    secondary: string;
    text: string;
    ctaBg: string;
    ctaText: string;
  };
  layout: BannerLayout;
}

const DEFAULT_PRIMARY = '#6366f1';
const DEFAULT_SECONDARY = '#8b5cf6';

function normalizeHexColor(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (/^#[0-9a-f]{6}$/i.test(trimmed)) return trimmed.toLowerCase();
  if (/^#[0-9a-f]{3}$/i.test(trimmed)) {
    const [r = '0', g = '0', b = '0'] = trimmed.slice(1).toLowerCase().split('');
    return `#${r}${r}${g}${g}${b}${b}`;
  }
  return null;
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const normalized = normalizeHexColor(hex) ?? DEFAULT_PRIMARY;
  return {
    r: parseInt(normalized.slice(1, 3), 16),
    g: parseInt(normalized.slice(3, 5), 16),
    b: parseInt(normalized.slice(5, 7), 16),
  };
}

function contrastText(hex: string): string {
  const { r, g, b } = hexToRgb(hex);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.62 ? '#111827' : '#ffffff';
}

function safeStringArray(value: unknown, limit = 6): string[] {
  return Array.isArray(value)
    ? value.map((item) => String(item).trim()).filter(Boolean).slice(0, limit)
    : [];
}

function buildFromBrandIq(
  companyId: string,
  companyName: string,
  companyLogo: string | null | undefined,
  profile: BrandIqProfile,
): BrandCreativeKit {
  const visual = profile.visualIdentity;
  const primary = normalizeHexColor(visual.primaryColor) ?? DEFAULT_PRIMARY;
  const secondary = normalizeHexColor(visual.secondaryColor) ?? DEFAULT_SECONDARY;
  const accents = safeStringArray(visual.accentColors, 5)
    .map(normalizeHexColor)
    .filter((color): color is string => Boolean(color));

  return {
    companyId,
    companyName,
    source: 'brand_iq',
    sourceProfileId: profile.id,
    sourceVersion: profile.version,
    logoUrl: visual.logoUrl || companyLogo || null,
    colors: {
      primary,
      secondary,
      accentColors: accents,
      text: '#ffffff',
      mutedText: 'rgba(255,255,255,0.82)',
      ctaBg: secondary,
      ctaText: contrastText(secondary),
    },
    fonts: {
      headline: visual.fontHeadline,
      body: visual.fontBody,
    },
    imageMood: visual.imageMood || 'modern, clean, human-led',
    voice: {
      adjectives: safeStringArray(profile.voice.adjectives, 7),
      description: profile.voice.description,
      signaturePhrases: safeStringArray(profile.voice.signaturePhrases, 6),
      avoidPhrases: safeStringArray(profile.voice.avoidPhrases, 8),
    },
    styleRules: {
      headlineRules: safeStringArray(profile.styleGuide.headlineRules, 6),
      bodyRules: safeStringArray(profile.styleGuide.bodyRules, 6),
      ctaRules: safeStringArray(profile.styleGuide.ctaRules, 6),
    },
    audiencePersonas: profile.audiencePersonas.slice(0, 4).map((persona) => ({
      name: persona.name,
      role: persona.role,
      painPoints: persona.painPoints.slice(0, 4),
      goals: persona.goals.slice(0, 4),
      channels: persona.channels.slice(0, 4),
    })),
  };
}

export async function buildBrandCreativeKit(companyId: string): Promise<BrandCreativeKit> {
  const [company, brandIq] = await Promise.all([
    db.query.companies.findFirst({
      where: eq(companies.id, companyId),
      columns: { id: true, name: true, logo: true },
    }),
    getActiveBrandIq(companyId).catch(() => null),
  ]);

  const companyName = company?.name || 'Your company';
  if (brandIq) {
    return buildFromBrandIq(companyId, companyName, company?.logo, brandIq);
  }

  const primary = DEFAULT_PRIMARY;
  const secondary = DEFAULT_SECONDARY;
  return {
    companyId,
    companyName,
    source: company?.logo ? 'company' : 'fallback',
    logoUrl: company?.logo || null,
    colors: {
      primary,
      secondary,
      accentColors: [],
      text: '#ffffff',
      mutedText: 'rgba(255,255,255,0.82)',
      ctaBg: secondary,
      ctaText: contrastText(secondary),
    },
    fonts: { headline: null, body: null },
    imageMood: 'modern, clean, human-led',
    voice: {
      adjectives: ['clear', 'helpful', 'professional'],
      description: 'Clear, friendly, benefit-led marketing language.',
      signaturePhrases: [],
      avoidPhrases: [],
    },
    styleRules: {
      headlineRules: ['Lead with the customer benefit.', 'Keep headlines short and specific.'],
      bodyRules: ['Use concrete details.', 'Avoid jargon.'],
      ctaRules: ['Use a direct action verb.'],
    },
    audiencePersonas: [],
  };
}

export function applyBrandKitToBannerTheme<T extends BrandableBannerTheme>(
  theme: T,
  brandKit?: BrandCreativeKit | null,
  variantIndex = 0,
): T {
  if (!brandKit) return theme;
  const secondary =
    brandKit.colors.accentColors[variantIndex % Math.max(brandKit.colors.accentColors.length, 1)]
    || brandKit.colors.secondary;

  return {
    ...theme,
    backgroundValue: `linear-gradient(135deg, ${brandKit.colors.primary} 0%, ${secondary} 100%)`,
    colors: {
      primary: brandKit.colors.primary,
      secondary,
      text: brandKit.colors.text,
      ctaBg: brandKit.colors.ctaBg,
      ctaText: brandKit.colors.ctaText,
    },
  };
}

export function renderBrandCreativeKitPrompt(brandKit?: BrandCreativeKit | null): string {
  if (!brandKit) return '';
  return [
    '=== BRAND CREATIVE KIT (apply to this campaign) ===',
    `Brand: ${brandKit.companyName}`,
    `Source: ${brandKit.source}${brandKit.sourceVersion ? ` v${brandKit.sourceVersion}` : ''}`,
    `Logo: ${brandKit.logoUrl ? 'available; place it as an editable overlay, never generate it inside the AI image' : 'not available'}`,
    `Colors: primary=${brandKit.colors.primary}, secondary=${brandKit.colors.secondary}${brandKit.colors.accentColors.length ? `, accents=${brandKit.colors.accentColors.join(', ')}` : ''}`,
    `Visual mood: ${brandKit.imageMood}`,
    `Voice: ${brandKit.voice.adjectives.join(', ')}. ${brandKit.voice.description}`,
    brandKit.voice.signaturePhrases.length ? `Preferred phrases: ${brandKit.voice.signaturePhrases.join(' / ')}` : '',
    brandKit.voice.avoidPhrases.length ? `Avoid phrases: ${brandKit.voice.avoidPhrases.join(' / ')}` : '',
    brandKit.styleRules.headlineRules.length ? `Headline rules: ${brandKit.styleRules.headlineRules.join(' / ')}` : '',
    brandKit.styleRules.ctaRules.length ? `CTA rules: ${brandKit.styleRules.ctaRules.join(' / ')}` : '',
    brandKit.audiencePersonas.length
      ? `Personas: ${brandKit.audiencePersonas.map((p) => `${p.name} (${p.role})`).join('; ')}`
      : '',
  ].filter(Boolean).join('\n');
}

export function brandCreativeKitSnapshot(brandKit?: BrandCreativeKit | null) {
  if (!brandKit) return null;
  return {
    source: brandKit.source,
    sourceProfileId: brandKit.sourceProfileId,
    sourceVersion: brandKit.sourceVersion,
    companyName: brandKit.companyName,
    logoUrl: brandKit.logoUrl ?? null,
    colors: brandKit.colors,
    fonts: brandKit.fonts,
    imageMood: brandKit.imageMood,
    voice: {
      adjectives: brandKit.voice.adjectives,
      avoidPhrases: brandKit.voice.avoidPhrases,
    },
    styleRules: {
      headlineRules: brandKit.styleRules.headlineRules,
      ctaRules: brandKit.styleRules.ctaRules,
    },
  };
}

export function buildBrandFitSummary(brandKit?: BrandCreativeKit | null, logoApplied = false) {
  if (!brandKit) return null;
  return {
    source: brandKit.source,
    logoAvailable: Boolean(brandKit.logoUrl),
    logoApplied,
    colorsApplied: true,
    voiceApplied: brandKit.source === 'brand_iq',
    imageMoodApplied: Boolean(brandKit.imageMood),
    checkedAt: new Date().toISOString(),
  };
}
