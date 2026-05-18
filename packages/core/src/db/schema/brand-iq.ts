/**
 * Brand IQ Layer — Block 2 of the 2027 build plan.
 *
 * Single per-company profile that every agent reads before producing
 * any user-facing output (blog, banner, social, ads, chatbot replies,
 * landing pages). The 5 facets — voice, audience personas, style
 * guide, visual identity, OKRs — are derived once from a URL plus a
 * few writing samples and then editable by the founder.
 *
 * History is kept by versioning rows (only the latest `is_active = true`
 * row is read by `getActiveBrandIq`).
 */
import {
  pgTable,
  uuid,
  text,
  boolean,
  jsonb,
  timestamp,
  integer,
  index,
} from 'drizzle-orm/pg-core';
import { companies } from './companies';

/* ─── Sub-shapes (the JSON columns) ──────────────────────────────── */

export interface BrandIqVoice {
  /** 3-7 adjectives that describe how the brand sounds (eg. "warm", "direct"). */
  adjectives: string[];
  /** Free-form paragraph the LLM should imitate. */
  description: string;
  /** "We" vs "I" vs "the team" — first-person convention. */
  firstPerson: 'we' | 'i' | 'the_team' | 'none';
  /** Sentence rhythm preference. */
  sentenceLength: 'short' | 'medium' | 'long' | 'varied';
  /** Phrases the brand says often. */
  signaturePhrases: string[];
  /** Phrases the brand never uses. */
  avoidPhrases: string[];
  /** Emoji policy. */
  emojiUsage: 'none' | 'sparingly' | 'frequent';
}

export interface AudiencePersona {
  id: string; // local slug, e.g. "solo-founder"
  name: string; // human label, e.g. "Solo Founder Hằng"
  role: string;
  painPoints: string[];
  goals: string[];
  channels: string[]; // where they hang out
}

export interface StyleGuide {
  headlineRules: string[]; // "Always start with a verb", etc.
  bodyRules: string[];
  ctaRules: string[];
  formattingPreferences: string[]; // "Use bullet lists for ≥ 3 items"
}

export interface VisualIdentity {
  primaryColor: string; // hex
  secondaryColor: string; // hex
  accentColors: string[];
  fontHeadline: string | null;
  fontBody: string | null;
  imageMood: string; // "warm, photographic, human-led"
  logoUrl: string | null;
}

export interface QuarterlyOkr {
  id: string;
  objective: string;
  keyResults: string[];
  quarter: string; // "2026-Q2"
}

/* ─── The table ──────────────────────────────────────────────────── */

export const brandIqProfiles = pgTable(
  'brand_iq_profiles',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    companyId: uuid('company_id').notNull().references(() => companies.id, { onDelete: 'cascade' }),

    /** Version counter — increments per regenerate so history is auditable. */
    version: integer('version').notNull().default(1),
    /** Only the latest row per company is `is_active = true`. */
    isActive: boolean('is_active').notNull().default(true),

    /** Inputs the founder gave us. */
    sourceUrl: text('source_url'),
    sourceSamples: jsonb('source_samples').$type<string[]>().default([]).notNull(),

    /** The 5 facets — see typed interfaces above. */
    voice: jsonb('voice').$type<BrandIqVoice>().notNull(),
    audiencePersonas: jsonb('audience_personas').$type<AudiencePersona[]>().default([]).notNull(),
    styleGuide: jsonb('style_guide').$type<StyleGuide>().notNull(),
    visualIdentity: jsonb('visual_identity').$type<VisualIdentity>().notNull(),
    okrs: jsonb('okrs').$type<QuarterlyOkr[]>().default([]).notNull(),

    /** Optional founder-supplied tagline. */
    tagline: text('tagline'),

    generatedBy: text('generated_by').default('ai').notNull(), // 'ai' | 'manual'

    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (t) => ({
    companyIdx: index('brand_iq_company_idx').on(t.companyId),
    activeIdx: index('brand_iq_active_idx').on(t.companyId, t.isActive),
  }),
);

export type BrandIqProfile = typeof brandIqProfiles.$inferSelect;
export type NewBrandIqProfile = typeof brandIqProfiles.$inferInsert;
