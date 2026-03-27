/**
 * Block System Type Definitions
 *
 * Defines the structure for visual editor blocks
 */

import { z } from 'zod';

// =============================================================================
// BLOCK TYPES
// =============================================================================

export const BlockTypeEnum = {
  HERO: 'hero',
  PROBLEM: 'problem',
  SOLUTION: 'solution',
  FEATURES: 'features',
  TESTIMONIALS: 'testimonials',
  PRICING: 'pricing',
  FAQ: 'faq',
  CTA: 'cta',
  FOOTER: 'footer',
  CUSTOM: 'custom',
} as const;

export type BlockType = (typeof BlockTypeEnum)[keyof typeof BlockTypeEnum];

// =============================================================================
// CONTENT SCHEMAS
// =============================================================================

// Hero Block
export const heroContentSchema = z.object({
  headline: z.string().min(1),
  subheadline: z.string().optional(),
  ctaText: z.string().optional(),
  ctaUrl: z.string().optional(),
  ctaSecondaryText: z.string().optional(),
  ctaSecondaryUrl: z.string().optional(),
  backgroundImage: z.string().optional(),
  alignment: z.enum(['left', 'center', 'right']).default('center'),
});
export type HeroContent = z.infer<typeof heroContentSchema>;

// Problem Block
export const painPointSchema = z.object({
  title: z.string(),
  description: z.string(),
  icon: z.string().optional(),
});

export const problemContentSchema = z.object({
  title: z.string(),
  description: z.string().optional(),
  painPoints: z.array(painPointSchema).default([]),
});
export type ProblemContent = z.infer<typeof problemContentSchema>;

// Solution Block
export const benefitSchema = z.object({
  title: z.string(),
  description: z.string(),
  icon: z.string().optional(),
});

export const solutionContentSchema = z.object({
  title: z.string(),
  description: z.string().optional(),
  benefits: z.array(benefitSchema).default([]),
});
export type SolutionContent = z.infer<typeof solutionContentSchema>;

// Features Block
export const featureSchema = z.object({
  title: z.string(),
  description: z.string(),
  icon: z.string().optional(),
  image: z.string().optional(),
});

export const featuresContentSchema = z.object({
  title: z.string().optional(),
  subtitle: z.string().optional(),
  features: z.array(featureSchema).default([]),
  layout: z.enum(['grid', 'list', 'cards']).default('grid'),
  columns: z.number().min(1).max(4).default(3),
});
export type FeaturesContent = z.infer<typeof featuresContentSchema>;

// Testimonials Block
export const testimonialSchema = z.object({
  name: z.string(),
  role: z.string().optional(),
  company: z.string().optional(),
  quote: z.string(),
  avatar: z.string().optional(),
  rating: z.number().min(1).max(5).optional(),
});

export const testimonialsContentSchema = z.object({
  title: z.string().optional(),
  subtitle: z.string().optional(),
  testimonials: z.array(testimonialSchema).default([]),
  layout: z.enum(['grid', 'carousel', 'stacked']).default('grid'),
});
export type TestimonialsContent = z.infer<typeof testimonialsContentSchema>;

// Pricing Block
export const pricingPlanSchema = z.object({
  name: z.string(),
  price: z.string(),
  period: z.string().optional(),
  description: z.string().optional(),
  features: z.array(z.string()).default([]),
  ctaText: z.string().optional(),
  ctaUrl: z.string().optional(),
  featured: z.boolean().default(false),
  badge: z.string().optional(),
});

export const pricingContentSchema = z.object({
  title: z.string().optional(),
  subtitle: z.string().optional(),
  plans: z.array(pricingPlanSchema).default([]),
  showAnnualToggle: z.boolean().default(false),
});
export type PricingContent = z.infer<typeof pricingContentSchema>;

// FAQ Block
export const faqItemSchema = z.object({
  question: z.string(),
  answer: z.string(),
});

export const faqContentSchema = z.object({
  title: z.string().optional(),
  subtitle: z.string().optional(),
  questions: z.array(faqItemSchema).default([]),
  layout: z.enum(['accordion', 'grid', 'simple']).default('accordion'),
});
export type FAQContent = z.infer<typeof faqContentSchema>;

// CTA Block
export const ctaContentSchema = z.object({
  title: z.string(),
  description: z.string().optional(),
  ctaText: z.string().optional(),
  ctaUrl: z.string().optional(),
  ctaSecondaryText: z.string().optional(),
  ctaSecondaryUrl: z.string().optional(),
  showEmailCapture: z.boolean().default(false),
  emailPlaceholder: z.string().optional(),
});
export type CTAContent = z.infer<typeof ctaContentSchema>;

// Footer Block
export const footerLinkSchema = z.object({
  label: z.string(),
  url: z.string(),
});

export const footerLinkGroupSchema = z.object({
  title: z.string(),
  links: z.array(footerLinkSchema).default([]),
});

export const socialLinkSchema = z.object({
  platform: z.enum(['twitter', 'facebook', 'instagram', 'linkedin', 'youtube', 'github', 'tiktok']),
  url: z.string(),
});

export const footerContentSchema = z.object({
  companyName: z.string().optional(),
  tagline: z.string().optional(),
  logo: z.string().optional(),
  linkGroups: z.array(footerLinkGroupSchema).default([]),
  socialLinks: z.array(socialLinkSchema).default([]),
  copyright: z.string().optional(),
  showNewsletter: z.boolean().default(false),
});
export type FooterContent = z.infer<typeof footerContentSchema>;

// Custom Block
export const customContentSchema = z.object({
  html: z.string().optional(),
  css: z.string().optional(),
  data: z.record(z.unknown()).optional(),
});
export type CustomContent = z.infer<typeof customContentSchema>;

// =============================================================================
// BLOCK DATA
// =============================================================================

export type BlockContent =
  | HeroContent
  | ProblemContent
  | SolutionContent
  | FeaturesContent
  | TestimonialsContent
  | PricingContent
  | FAQContent
  | CTAContent
  | FooterContent
  | CustomContent;

export interface BlockData {
  id: string;
  type: BlockType;
  content: BlockContent;
  order: number;
  isVisible: boolean;
  backgroundColor?: string;
  customStyles?: Record<string, string>;
}

// =============================================================================
// BLOCK DEFINITION (for registry)
// =============================================================================

export interface BlockDefinition<T = unknown> {
  type: BlockType;
  name: string;
  description: string;
  icon: string;
  category: 'header' | 'content' | 'social-proof' | 'conversion' | 'footer';
  defaultContent: T;
  schema: z.ZodSchema;
  thumbnail?: string;
}

// =============================================================================
// EDITOR TYPES
// =============================================================================

export interface BlockProps<T extends BlockContent = BlockContent> {
  block: BlockData;
  content: T;
  primaryColor: string;
  isEditing?: boolean;
  onUpdate?: (content: Partial<T>) => void;
}

export interface BlockEditorProps<T extends BlockContent = BlockContent> {
  content: T;
  onChange: (content: T) => void;
  primaryColor: string;
}

// =============================================================================
// EDITOR STATE TYPES
// =============================================================================

export interface EditorHistoryEntry {
  blocks: BlockData[];
  timestamp: number;
}

export interface EditorSelection {
  blockId: string | null;
  fieldPath?: string[];
}
